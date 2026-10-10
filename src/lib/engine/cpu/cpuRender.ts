/**
 * CPU fallback renderer (used when WebGL2 is unavailable, runs in a Web Worker).
 *
 * Implements the same stages as the GPU path using pixel.ts, with box-blur
 * approximations of the Gaussian pyramid. Portrait retouching and layer blur
 * are GPU-only; the UI discloses this when the CPU path is active. Lens blur
 * runs on both paths (lensBlurLinear is the reference for the GLSL passes).
 */
import { SRGB8_TO_LINEAR, linearToSrgb } from '../../color/srgb';
import type { EditState } from '../../schema/adjustments';
import { apply, outputToSourceMatrix, type Size } from '../geometry';
import {
  BLUR_RADII,
  MIN_BLUR_PX,
  deriveDevelopParams,
  deriveLensParams,
  deriveLocalParams,
  lensBlurPlan,
  lensRadiusPx,
  type DevelopParams,
  type LensParams,
} from '../params';
import {
  applyGrainSrgb,
  applyVignette,
  bokehCompress,
  bokehExpand,
  cocSimilarity,
  detailStage,
  developLinear,
  displayStage,
  grainValue,
  lensBlendWeights,
  lensCoc,
  lensGatherWeight,
  lensSample,
  localAdjust,
  vignetteWeight,
  type RGB,
} from '../pixel';
import { defaultAdjustments } from '../../schema/adjustments';

export interface CpuImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface CpuRenderInput {
  source: CpuImage;
  /** Full-resolution oriented size of the image the source represents. */
  fullSize: Size;
  edit: EditState;
  out: Size;
  neutral?: boolean;
  /** Alpha-channel mask rasters keyed by layer id (full-image extent). */
  layerMasks?: Record<string, CpuImage>;
  /** Depth raster for lens blur (full-image extent). */
  depth?: DepthRaster | null;
  shouldCancel?: () => boolean;
}

/** Three passes of a separable box blur approximate a Gaussian. Operates on Float32 RGB. */
export function boxBlur3(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  const a: Float32Array = src.slice();
  const b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    boxH(a, b, w, h, r);
    boxV(b, a, w, h, r);
  }
  return a;
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[(y * w + Math.min(w - 1, Math.max(0, k))) * 3 + c];
      for (let x = 0; x < w; x++) {
        dst[(y * w + x) * 3 + c] = acc * norm;
        const add = Math.min(w - 1, x + r + 1);
        const sub = Math.max(0, x - r);
        acc += src[(y * w + add) * 3 + c] - src[(y * w + sub) * 3 + c];
      }
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const norm = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[(Math.min(h - 1, Math.max(0, k)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) {
        dst[(y * w + x) * 3 + c] = acc * norm;
        const add = Math.min(h - 1, y + r + 1);
        const sub = Math.max(0, y - r);
        acc += src[(add * w + x) * 3 + c] - src[(sub * w + x) * 3 + c];
      }
    }
  }
}

/** Single-channel depth raster: nearness 0 (far) .. 255 (near), covering the full image. */
export interface DepthRaster {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** Bilinear depth lookup at normalized full-image coordinates (matches GL LINEAR + CLAMP_TO_EDGE). Returns 0..1. */
export function sampleDepth(d: DepthRaster, s: number, t: number): number {
  const fx = Math.min(d.width - 1, Math.max(0, s * d.width - 0.5));
  const fy = Math.min(d.height - 1, Math.max(0, t * d.height - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(d.width - 1, x0 + 1);
  const y1 = Math.min(d.height - 1, y0 + 1);
  const ax = fx - x0;
  const ay = fy - y0;
  const D = d.data;
  const top = D[y0 * d.width + x0] * (1 - ax) + D[y0 * d.width + x1] * ax;
  const bot = D[y1 * d.width + x0] * (1 - ax) + D[y1 * d.width + x1] * ax;
  return (top * (1 - ay) + bot * ay) / 255;
}

export interface SourceRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LensLevel {
  f: number;
  w: number;
  h: number;
  prep: Float32Array;
  gather: Float32Array;
}

/**
 * Depth-aware lens blur on linear RGB (3 floats per pixel), CPU reference of
 * the GLSL lens passes. `region` is the extent of `lin` within the full image
 * (normalized), `rmaxPx` the full blur radius in pixels of `lin`.
 *
 * Per level (a coarse level for large blur, plus a finer one for the
 * near-focus range when the coarse level is heavily downscaled):
 *  1. prep: highlights expanded, averaged over factor x factor blocks (only
 *     texels at a similar depth to the block centre), with the block's CoC;
 *  2. gather: scatter-as-gather disc blur (golden-angle samples).
 * Then composite: depth-aware upsample of each level, blended by CoC, mixed
 * with the sharp image.
 */
export function lensBlurLinear(
  lin: Float32Array,
  W: number,
  H: number,
  depth: DepthRaster,
  region: SourceRegion,
  L: LensParams,
  rmaxPx: number,
): Float32Array {
  const plan = lensBlurPlan(rmaxPx);
  const cocAt = (px: number, py: number) =>
    lensCoc(sampleDepth(depth, region.x + (px / W) * region.w, region.y + (py / H) * region.h), L);

  const level = (f: number, radius: number, N: number): LensLevel => {
    const cocScale = rmaxPx / f;
    const lw = Math.ceil(W / f);
    const lh = Math.ceil(H / f);
    // 1. Prep.
    const prep = new Float32Array(lw * lh * 4);
    for (let j = 0; j < lh; j++) {
      for (let i = 0; i < lw; i++) {
        const cc = cocAt((i + 0.5) * f, (j + 0.5) * f) * cocScale;
        let r = 0;
        let g = 0;
        let b = 0;
        let ws = 0;
        let pr = 0;
        let pg = 0;
        let pb = 0;
        let pn = 0;
        for (let y = j * f; y < Math.min(H, j * f + f); y++) {
          for (let x = i * f; x < Math.min(W, i * f + f); x++) {
            const o = (y * W + x) * 3;
            const e = bokehExpand([lin[o], lin[o + 1], lin[o + 2]], L.boost);
            const w = cocSimilarity(cocAt(x + 0.5, y + 0.5) * cocScale, cc);
            r += e[0] * w;
            g += e[1] * w;
            b += e[2] * w;
            ws += w;
            pr += e[0];
            pg += e[1];
            pb += e[2];
            pn++;
          }
        }
        const o = (j * lw + i) * 4;
        if (ws > 1e-3) {
          prep[o] = r / ws;
          prep[o + 1] = g / ws;
          prep[o + 2] = b / ws;
        } else {
          prep[o] = pr / pn;
          prep[o + 1] = pg / pn;
          prep[o + 2] = pb / pn;
        }
        prep[o + 3] = cc;
      }
    }
    // 2. Gather.
    const gather = new Float32Array(lw * lh * 4);
    const taps = Array.from({ length: N }, (_, k) => lensSample(k, N, radius));
    for (let j = 0; j < lh; j++) {
      for (let i = 0; i < lw; i++) {
        const o = (j * lw + i) * 4;
        const c0 = prep[o + 3];
        let r = prep[o];
        let g = prep[o + 1];
        let b = prep[o + 2];
        let ws = 1;
        let fg = 0;
        for (const [dx, dy, dist] of taps) {
          // Bilinear footprint with per-texel coverage (interpolating colour and CoC first would leak
          // in-focus texels across depth edges as halos).
          const qx = i + dx;
          const qy = j + dy;
          const x0 = Math.floor(qx);
          const y0 = Math.floor(qy);
          const ax = qx - x0;
          const ay = qy - y0;
          for (let t = 0; t < 4; t++) {
            const ix = Math.min(lw - 1, Math.max(0, x0 + (t & 1)));
            const iy = Math.min(lh - 1, Math.max(0, y0 + (t >> 1)));
            const bil = (t & 1 ? ax : 1 - ax) * (t >> 1 ? ay : 1 - ay);
            const so = (iy * lw + ix) * 4;
            const [cw, cf] = lensGatherWeight(prep[so + 3], c0, dist);
            const w = bil * cw;
            r += prep[so] * w;
            g += prep[so + 1] * w;
            b += prep[so + 2] * w;
            ws += w;
            fg += bil * cf;
          }
        }
        gather[o] = r / ws;
        gather[o + 1] = g / ws;
        gather[o + 2] = b / ws;
        gather[o + 3] = fg / ws;
      }
    }
    return { f, w: lw, h: lh, prep, gather };
  };

  /** Depth-aware (joint bilateral) upsample of a level's gather at full-res pixel (x, y) with CoC c0 (px). */
  const upsample = (lv: LensLevel, x: number, y: number, c0: number, out: number[]) => {
    const c0l = c0 / lv.f;
    const qx = (x + 0.5) / lv.f - 0.5;
    const qy = (y + 0.5) / lv.f - 0.5;
    const x0 = Math.floor(qx);
    const y0 = Math.floor(qy);
    const ax = qx - x0;
    const ay = qy - y0;
    let r = 0;
    let g = 0;
    let b = 0;
    let fg = 0;
    let ws = 0;
    let br = 0;
    let bg = 0;
    let bb = 0;
    let bf = 0;
    for (let k = 0; k < 4; k++) {
      const ix = Math.min(lv.w - 1, Math.max(0, x0 + (k & 1)));
      const iy = Math.min(lv.h - 1, Math.max(0, y0 + (k >> 1)));
      const bil = (k & 1 ? ax : 1 - ax) * (k >> 1 ? ay : 1 - ay);
      const lo = (iy * lv.w + ix) * 4;
      const w = bil * cocSimilarity(lv.prep[lo + 3], c0l);
      const G = lv.gather;
      r += G[lo] * w;
      g += G[lo + 1] * w;
      b += G[lo + 2] * w;
      fg += G[lo + 3] * w;
      ws += w;
      br += G[lo] * bil;
      bg += G[lo + 1] * bil;
      bb += G[lo + 2] * bil;
      bf += G[lo + 3] * bil;
    }
    if (ws > 1e-4) {
      out[0] = r / ws;
      out[1] = g / ws;
      out[2] = b / ws;
      out[3] = fg / ws;
    } else {
      out[0] = br;
      out[1] = bg;
      out[2] = bb;
      out[3] = bf;
    }
  };

  const coarse = level(plan.factor, plan.radius, plan.samples);
  const fine = plan.fine ? level(plan.fine.factor, plan.fine.radius, plan.fine.samples) : null;

  // 3. Composite.
  const out = new Float32Array(lin.length);
  const B = [0, 0, 0, 0];
  const A = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const c0 = cocAt(x + 0.5, y + 0.5) * rmaxPx;
      const [tc, u] = lensBlendWeights(c0, plan);
      upsample(coarse, x, y, c0, B);
      if (fine && u < 1) {
        upsample(fine, x, y, c0, A);
        for (let k = 0; k < 4; k++) B[k] = A[k] + (B[k] - A[k]) * u;
      }
      const t = Math.max(tc, B[3]);
      if (t <= 0) {
        out[o] = lin[o];
        out[o + 1] = lin[o + 1];
        out[o + 2] = lin[o + 2];
        continue;
      }
      const c = bokehCompress([B[0], B[1], B[2]], L.boost);
      out[o] = lin[o] + (c[0] - lin[o]) * t;
      out[o + 1] = lin[o + 1] + (c[1] - lin[o + 1]) * t;
      out[o + 2] = lin[o + 2] + (c[2] - lin[o + 2]) * t;
    }
  }
  return out;
}

function sampleMask(mask: CpuImage, s: number, t: number): number {
  const x = Math.min(mask.width - 1, Math.max(0, Math.round(s * mask.width - 0.5)));
  const y = Math.min(mask.height - 1, Math.max(0, Math.round(t * mask.height - 0.5)));
  return mask.data[(y * mask.width + x) * 4 + 3] / 255;
}

export class RenderCancelled extends Error {}

export function cpuRender(input: CpuRenderInput): ImageData | CpuImage {
  const { source, edit } = input;
  const W = source.width;
  const H = source.height;
  const neutral = !!input.neutral;
  const globalOn = !neutral && edit.adjustmentsVisible;
  const P: DevelopParams = deriveDevelopParams(globalOn ? edit.adjustments : defaultAdjustments());
  const n = W * H;

  // Linearize.
  let lin: Float32Array = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    lin[i * 3] = SRGB8_TO_LINEAR[source.data[i * 4]];
    lin[i * 3 + 1] = SRGB8_TO_LINEAR[source.data[i * 4 + 1]];
    lin[i * 3 + 2] = SRGB8_TO_LINEAR[source.data[i * 4 + 2]];
  }

  const pxPerFull = W / input.fullSize.width;
  const longEdge = Math.max(input.fullSize.width, input.fullSize.height);

  // Lens blur (source space, linear light; like retouching, not affected by the adjustments toggle).
  const lens = deriveLensParams(edit.lensBlur);
  const lensPx = lensRadiusPx(lens, longEdge, pxPerFull);
  if (!neutral && lens.active && input.depth && lensPx >= 0.5) {
    lin = lensBlurLinear(lin, W, H, input.depth, { x: 0, y: 0, w: 1, h: 1 }, lens, lensPx);
    if (input.shouldCancel?.()) throw new RenderCancelled();
  }

  const D = P.detail;
  const detailOn =
    globalOn && (D.sharpen > 0 || D.noise > 0 || D.colorNoise > 0 || D.texture !== 0 || D.clarity !== 0 || D.dehaze !== 0);
  const layers = neutral
    ? []
    : edit.layers.filter((l) => l.visible && l.opacity > 0 && input.layerMasks?.[l.id]);
  const radius = (frac: number, min: number) => Math.max(min, frac * longEdge * pxPerFull);
  const needLarge =
    (detailOn && (D.clarity !== 0 || D.dehaze !== 0)) ||
    layers.some((l) => l.adjustments.clarity !== 0 || l.adjustments.dehaze !== 0);
  const bs = detailOn ? boxBlur3(lin, W, H, radius(BLUR_RADII.small, MIN_BLUR_PX.small)) : lin;
  const bm = detailOn ? boxBlur3(lin, W, H, radius(BLUR_RADII.medium, MIN_BLUR_PX.medium)) : lin;
  const bl = needLarge ? boxBlur3(lin, W, H, radius(BLUR_RADII.large, MIN_BLUR_PX.large)) : lin;
  if (input.shouldCancel?.()) throw new RenderCancelled();

  // Develop (display-encoded float RGB).
  const dev = new Float32Array(n * 3);
  const localParams = layers.map((l) => ({ layer: l, lp: deriveLocalParams(l.adjustments) }));
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    let x: RGB = [lin[o], lin[o + 1], lin[o + 2]];
    if (detailOn) {
      x = detailStage(
        x,
        [bs[o], bs[o + 1], bs[o + 2]],
        [bm[o], bm[o + 1], bm[o + 2]],
        [bl[o], bl[o + 1], bl[o + 2]],
        D,
      );
    }
    let disp: RGB;
    if (globalOn) {
      const y = developLinear(x, P);
      disp = displayStage([linearToSrgb(y[0]), linearToSrgb(y[1]), linearToSrgb(y[2])], P);
    } else {
      disp = [linearToSrgb(x[0]), linearToSrgb(x[1]), linearToSrgb(x[2])];
    }
    if (localParams.length) {
      const px = i % W;
      const py = (i / W) | 0;
      const s = (px + 0.5) / W;
      const t = (py + 0.5) / H;
      for (const { layer, lp } of localParams) {
        let m = sampleMask(input.layerMasks![layer.id], s, t);
        if (layer.invert) m = 1 - m;
        m *= layer.opacity / 100;
        if (m <= 0.0005) continue;
        const linPx: RGB = [
          SRGB8_TO_LINEAR[Math.round(Math.min(1, Math.max(0, disp[0])) * 255)],
          SRGB8_TO_LINEAR[Math.round(Math.min(1, Math.max(0, disp[1])) * 255)],
          SRGB8_TO_LINEAR[Math.round(Math.min(1, Math.max(0, disp[2])) * 255)],
        ];
        const adj = localAdjust(linPx, lp, needLarge ? [bl[o], bl[o + 1], bl[o + 2]] : null);
        const res: RGB = [linearToSrgb(adj[0]), linearToSrgb(adj[1]), linearToSrgb(adj[2])];
        disp = [disp[0] + (res[0] - disp[0]) * m, disp[1] + (res[1] - disp[1]) * m, disp[2] + (res[2] - disp[2]) * m];
      }
    }
    dev[o] = disp[0];
    dev[o + 1] = disp[1];
    dev[o + 2] = disp[2];
    if ((i & 0xffff) === 0 && input.shouldCancel?.()) throw new RenderCancelled();
  }

  // Output geometry, vignette, grain.
  const { out } = input;
  const result = new Uint8ClampedArray(out.width * out.height * 4);
  const mat = outputToSourceMatrix(input.fullSize, edit.geometry);
  const g = edit.geometry;
  const frameW = g.rotate90 % 2 ? input.fullSize.height : input.fullSize.width;
  const frameH = g.rotate90 % 2 ? input.fullSize.width : input.fullSize.height;
  const fullOutW = g.crop.w * frameW;
  const fullOutH = g.crop.h * frameH;
  const aspect = fullOutW / fullOutH;
  const scale = out.width / fullOutW;
  const effects = globalOn;
  for (let oy = 0; oy < out.height; oy++) {
    for (let ox = 0; ox < out.width; ox++) {
      const u = (ox + 0.5) / out.width;
      const v = (oy + 0.5) / out.height;
      const [s, t] = apply(mat, u, v);
      const di = (oy * out.width + ox) * 4;
      if (s < 0 || t < 0 || s > 1 || t > 1) {
        result[di + 3] = 255;
        continue;
      }
      // Bilinear sample of the developed image.
      const fx = s * W - 0.5;
      const fy = t * H - 0.5;
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
      const x1 = Math.min(W - 1, x0 + 1);
      const y1 = Math.min(H - 1, y0 + 1);
      const ax = Math.min(1, Math.max(0, fx - x0));
      const ay = Math.min(1, Math.max(0, fy - y0));
      let c: RGB = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const top = dev[(y0 * W + x0) * 3 + k] * (1 - ax) + dev[(y0 * W + x1) * 3 + k] * ax;
        const bot = dev[(y1 * W + x0) * 3 + k] * (1 - ax) + dev[(y1 * W + x1) * 3 + k] * ax;
        c[k] = top * (1 - ay) + bot * ay;
      }
      const alpha = source.data[(Math.round(Math.min(H - 1, Math.max(0, fy))) * W + Math.round(Math.min(W - 1, Math.max(0, fx)))) * 4 + 3];
      if (effects) {
        if (P.vignette.amount !== 0) {
          const wgt = vignetteWeight(u * 2 - 1, v * 2 - 1, aspect, P.vignette);
          const linC = applyVignette(
            [SRGB8_TO_LINEAR[Math.round(clamp01(c[0]) * 255)], SRGB8_TO_LINEAR[Math.round(clamp01(c[1]) * 255)], SRGB8_TO_LINEAR[Math.round(clamp01(c[2]) * 255)]],
            wgt,
            P.vignette.amount,
          );
          c = [linearToSrgb(linC[0]), linearToSrgb(linC[1]), linearToSrgb(linC[2])];
        }
        if (P.grain.amount > 0) {
          c = applyGrainSrgb(c, grainValue(u * fullOutW, v * fullOutH, P.grain, scale), P.grain.amount);
        }
      }
      result[di] = Math.round(clamp01(c[0]) * 255);
      result[di + 1] = Math.round(clamp01(c[1]) * 255);
      result[di + 2] = Math.round(clamp01(c[2]) * 255);
      result[di + 3] = alpha;
    }
  }
  return { width: out.width, height: out.height, data: result };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
