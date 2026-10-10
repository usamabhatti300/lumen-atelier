/**
 * CPU fallback renderer (used when WebGL2 is unavailable, runs in a Web Worker).
 *
 * Implements the same stages as the GPU path using pixel.ts, with box-blur
 * approximations of the Gaussian pyramid. Portrait retouching and layer blur
 * are GPU-only; the UI discloses this when the CPU path is active.
 */
import { SRGB8_TO_LINEAR, linearToSrgb } from '../../color/srgb';
import type { EditState } from '../../schema/adjustments';
import { apply, outputToSourceMatrix, type Size } from '../geometry';
import {
  BLUR_RADII,
  MIN_BLUR_PX,
  deriveDevelopParams,
  deriveLocalParams,
  type DevelopParams,
} from '../params';
import {
  applyGrainSrgb,
  applyVignette,
  detailStage,
  developLinear,
  displayStage,
  grainValue,
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
  const lin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    lin[i * 3] = SRGB8_TO_LINEAR[source.data[i * 4]];
    lin[i * 3 + 1] = SRGB8_TO_LINEAR[source.data[i * 4 + 1]];
    lin[i * 3 + 2] = SRGB8_TO_LINEAR[source.data[i * 4 + 2]];
  }

  const D = P.detail;
  const detailOn =
    globalOn && (D.sharpen > 0 || D.noise > 0 || D.colorNoise > 0 || D.texture !== 0 || D.clarity !== 0 || D.dehaze !== 0);
  const layers = neutral
    ? []
    : edit.layers.filter((l) => l.visible && l.opacity > 0 && input.layerMasks?.[l.id]);
  const pxPerFull = W / input.fullSize.width;
  const longEdge = Math.max(input.fullSize.width, input.fullSize.height);
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
