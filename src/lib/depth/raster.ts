/**
 * Turns the depth model's output into the depth raster the renderers use for
 * lens blur. The model's map is soft (it works at 518 px on the short side), so
 * it is
 *  1. resampled to the raster size,
 *  2. optionally "flattened" per detected person: each person region from
 *     subject segmentation is set to its own median depth, so a person stays
 *     uniformly sharp when focused on (and blurs as one when not),
 *  3. refined with two passes of a joint bilateral filter (colour-guided) and
 *     a guided filter (He et al.) on luminance, which pull the model's soft
 *     depth ramps onto the photo's real edges.
 *
 * The depth map itself is cached per photo; this composition is cheap and
 * redone when the segmentation or the "protect subject" option changes.
 * Nothing here alters the photo's pixels.
 */
import { sampleDepth, type DepthRaster } from '../engine/cpu/cpuRender';
import type { SegmentationMaps } from '../masks/rasterize';

/** Normalized nearness 0 (far) .. 65535 (near), row-major, as produced by the depth model. */
export interface DepthMap {
  width: number;
  height: number;
  data: Uint16Array;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Long edge of the depth raster used for previews and for export. */
export const DEPTH_RASTER_SIDE = 1024;
export const DEPTH_EXPORT_SIDE = 2048;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function rasterSize(full: { width: number; height: number }, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(full.width, full.height));
  return { width: Math.max(1, Math.round(full.width * k)), height: Math.max(1, Math.round(full.height * k)) };
}

/** Mean over a (2r+1)^2 window, normalized by the number of pixels inside the image. O(n) per pass. */
export function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = 0; x <= Math.min(w - 1, r); x++) acc += src[row + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      tmp[row + x] = acc / (hi - lo + 1);
      if (x + r + 1 < w) acc += src[row + x + r + 1];
      if (x - r >= 0) acc -= src[row + x - r];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y <= Math.min(h - 1, r); y++) acc += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(h - 1, y + r);
      out[y * w + x] = acc / (hi - lo + 1);
      if (y + r + 1 < h) acc += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) acc -= tmp[(y - r) * w + x];
    }
  }
  return out;
}

/** Guided filter of `p` with grey guide `I` (both 0..1): edge-preserving, follows the guide's edges. */
export function guidedFilter(I: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const Ip = new Float32Array(n);
  const II = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Ip[i] = I[i] * p[i];
    II[i] = I[i] * I[i];
  }
  const mI = boxMean(I, w, h, r);
  const mP = boxMean(p, w, h, r);
  const mIp = boxMean(Ip, w, h, r);
  const mII = boxMean(II, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i];
    const cov = mIp[i] - mI[i] * mP[i];
    a[i] = cov / (varI + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = boxMean(a, w, h, r);
  const mB = boxMean(b, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = mA[i] * I[i] + mB[i];
  return q;
}

/**
 * Joint bilateral filter of `p` guided by an RGBA image: each pixel averages
 * the depth of nearby pixels of a similar colour. Pulls the soft depth ramps
 * the model produces at object boundaries back onto the object they belong
 * to (so an object's rim does not get an in-between depth and blur outward).
 * Taps are spaced `stride` px apart to keep it fast.
 */
export function jointBilateral(
  p: Float32Array,
  guide: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  stride: number,
  sigmaS: number,
  sigmaR: number,
): Float32Array {
  const out = new Float32Array(w * h);
  const taps: [number, number, number][] = [];
  for (let dy = -radius; dy <= radius; dy += stride)
    for (let dx = -radius; dx <= radius; dx += stride) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= radius * radius) taps.push([dx, dy, Math.exp(-d2 / (2 * sigmaS * sigmaS))]);
    }
  // Range weights by colour distance (0..442), tabulated.
  const range = new Float32Array(443);
  for (let d = 0; d < range.length; d++) range[d] = Math.exp(-(d * d) / (2 * (sigmaR * 255) ** 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r0 = guide[i * 4];
      const g0 = guide[i * 4 + 1];
      const b0 = guide[i * 4 + 2];
      let acc = 0;
      let ws = 0;
      for (const [dx, dy, sw] of taps) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        const dr = guide[j * 4] - r0;
        const dg = guide[j * 4 + 1] - g0;
        const db = guide[j * 4 + 2] - b0;
        const wt = sw * range[Math.round(Math.sqrt(dr * dr + dg * dg + db * db))];
        acc += p[j] * wt;
        ws += wt;
      }
      out[i] = ws > 0 ? acc / ws : p[i];
    }
  }
  return out;
}

/** Bilinear resample of a single-channel map (values scaled by `scale`) to w x h. */
function resample(src: ArrayLike<number>, sw: number, sh: number, w: number, h: number, scale: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) / h) * sh - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ay = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) / w) * sw - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const ax = fx - x0;
      const top = src[y0 * sw + x0] * (1 - ax) + src[y0 * sw + x1] * ax;
      const bot = src[y1 * sw + x0] * (1 - ax) + src[y1 * sw + x1] * ax;
      out[y * w + x] = (top * (1 - ay) + bot * ay) * scale;
    }
  }
  return out;
}

/** Subject confidence (0..1) from segmentation, resampled to w x h. */
export function subjectMask(seg: SegmentationMaps, w: number, h: number): Float32Array {
  return resample(seg.maps.subject, seg.width, seg.height, w, h, 1 / 255);
}

/**
 * Sets every connected person region (subject confidence > 0.3) to its own
 * median nearness, blended in by confidence. Separate people keep separate
 * depths, so a person in the background still blurs.
 */
export function flattenSubjects(n: Float32Array, m: Float32Array, w: number, h: number): Float32Array {
  const out = n.slice();
  const label = new Int32Array(w * h).fill(-1);
  const minArea = Math.max(16, Math.round(w * h * 0.002));
  const stack: number[] = [];
  const members: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || m[start] <= 0.3) continue;
    members.length = 0;
    const visit = (j: number) => {
      if (label[j] !== -1 || m[j] <= 0.3) return;
      label[j] = start;
      stack.push(j);
    };
    visit(start);
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y < h - 1) visit(i + w);
    }
    if (members.length < minArea) continue;
    // Median over the confident core of the region.
    const hist = new Uint32Array(1024);
    let count = 0;
    for (const i of members) {
      if (m[i] < 0.6) continue;
      hist[Math.min(1023, Math.max(0, Math.round(n[i] * 1023)))]++;
      count++;
    }
    if (count === 0) continue;
    let acc = 0;
    let med = 0;
    for (let b = 0; b < 1024; b++) {
      acc += hist[b];
      if (acc * 2 >= count) {
        med = b / 1023;
        break;
      }
    }
    for (const i of members) {
      const k = smooth(0.3, 0.7, m[i]);
      out[i] = n[i] + (med - n[i]) * k;
    }
  }
  return out;
}

export interface ComposeOptions {
  /** Subject confidence at the guide's size (from subjectMask), or null when unavailable / not wanted. */
  subject: Float32Array | null;
}

/** 2x2 box downsample of an RGBA image to hw x hh. */
function halfGuide(guide: RgbaImage, hw: number, hh: number): Uint8ClampedArray {
  const { width: w, height: h, data } = guide;
  const out = new Uint8ClampedArray(hw * hh * 4);
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < hw; x++) {
      const x0 = Math.min(w - 1, 2 * x);
      const x1 = Math.min(w - 1, 2 * x + 1);
      const y0 = Math.min(h - 1, 2 * y);
      const y1 = Math.min(h - 1, 2 * y + 1);
      for (let c = 0; c < 3; c++)
        out[(y * hw + x) * 4 + c] = (data[(y0 * w + x0) * 4 + c] + data[(y0 * w + x1) * 4 + c] + data[(y1 * w + x0) * 4 + c] + data[(y1 * w + x1) * 4 + c]) / 4;
      out[(y * hw + x) * 4 + 3] = 255;
    }
  return out;
}

/** Builds the lens-blur depth raster at the guide image's size. */
export function composeDepthRaster(depth: DepthMap, guide: RgbaImage, opts: ComposeOptions): DepthRaster {
  const { width: w, height: h } = guide;
  let n = resample(depth.data, depth.width, depth.height, w, h, 1 / 65535);
  if (opts.subject) n = flattenSubjects(n, opts.subject, w, h);
  // Joint bilateral at half resolution (fast enough for the main thread). The model works at 518 px
  // on the short side and its edge ramps are a few model pixels wide; the radius covers them.
  const hw = Math.max(1, Math.ceil(w / 2));
  const hh = Math.max(1, Math.ceil(h / 2));
  const half = halfGuide(guide, hw, hh);
  let nh = resample(n, w, h, hw, hh, 1);
  const radius = Math.max(2, Math.round((6 * Math.min(w, h)) / 518));
  const stride = Math.max(1, Math.round(radius / 3));
  for (let it = 0; it < 2; it++) nh = jointBilateral(nh, half, hw, hh, radius, stride, radius / 2, 0.1);
  n = resample(nh, hw, hh, w, h, 1);
  const I = new Float32Array(w * h);
  const g = guide.data;
  for (let i = 0; i < w * h; i++) I[i] = (0.2126 * g[i * 4] + 0.7152 * g[i * 4 + 1] + 0.0722 * g[i * 4 + 2]) / 255;
  const r = Math.max(2, Math.round(Math.max(w, h) / 170));
  const q = guidedFilter(I, n, w, h, r, 4e-4);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = Math.round(Math.min(1, Math.max(0, q[i])) * 255);
  return { width: w, height: h, data };
}

/** Nearness (0..1) around a point (normalized source coordinates), averaged over a small neighbourhood. */
export function depthAt(raster: DepthRaster, x: number, y: number): number {
  let s = 0;
  let k = 0;
  const dx = 1.5 / raster.width;
  const dy = 1.5 / raster.height;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      s += sampleDepth(raster, Math.min(1, Math.max(0, x + i * dx)), Math.min(1, Math.max(0, y + j * dy)));
      k++;
    }
  return s / k;
}

/** Focus distance slider value (0 near .. 100 far) for a nearness. */
export const focusFromNearness = (n: number) => Math.round(Math.min(100, Math.max(0, (1 - n) * 100)));

/**
 * A sensible first focus: the detected person (largest confident region), or
 * otherwise the nearest part of the central area of the frame.
 */
export function autoFocus(raster: DepthRaster, subject: Float32Array | null): { x: number; y: number; nearness: number } {
  const { width: w, height: h, data } = raster;
  const pick = (want: (i: number) => boolean) => {
    let sx = 0;
    let sy = 0;
    let count = 0;
    const hist = new Uint32Array(256);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!want(i)) continue;
        sx += x;
        sy += y;
        count++;
        hist[data[i]]++;
      }
    if (count === 0) return null;
    let acc = 0;
    let med = 0;
    for (let b = 0; b < 256; b++) {
      acc += hist[b];
      if (acc * 2 >= count) {
        med = b;
        break;
      }
    }
    return { x: (sx / count + 0.5) / w, y: (sy / count + 0.5) / h, nearness: med / 255, count };
  };
  if (subject) {
    const p = pick((i) => subject[i] > 0.5);
    if (p && p.count >= w * h * 0.01) return p;
  }
  // Nearest 15% of the central region.
  const hist = new Uint32Array(256);
  let total = 0;
  const inCentre = (i: number) => {
    const x = i % w;
    const y = (i / w) | 0;
    return x > w * 0.2 && x < w * 0.8 && y > h * 0.15 && y < h * 0.9;
  };
  for (let i = 0; i < w * h; i++)
    if (inCentre(i)) {
      hist[data[i]]++;
      total++;
    }
  let acc = 0;
  let cut = 255;
  for (let b = 255; b >= 0; b--) {
    acc += hist[b];
    if (acc >= total * 0.15) {
      cut = b;
      break;
    }
  }
  return pick((i) => inCentre(i) && data[i] >= cut) ?? { x: 0.5, y: 0.5, nearness: data[(h >> 1) * w + (w >> 1)] / 255 };
}
