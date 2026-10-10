/**
 * Tiled AI upscaling (Real-ESRGAN general x4v3). Pure maths with no imports,
 * so it can be unit-tested and run from Node against the real model.
 *
 * The model always enlarges 4×. The image is cut into overlapping tiles of
 * equal size (the last tile is shifted back instead of shrunk, so every tile
 * has the same shape). Each tile's result is blended into the output with
 * per-axis weights normalised so the weights of all tiles covering a pixel
 * sum to exactly 1. Across an overlap, the outer UPSCALE_MARGIN pixels of a
 * tile (where the model saw zero padding) get almost no weight and the rest
 * ramps linearly. Measured against a single-pass run of the real model, the
 * tiled result differs by at most 2/255 (mean ~0.01), so there are no seams.
 *
 * 2× is made by running 4× and averaging each 2×2 block in linear light
 * (an exact 2:1 area downscale), done per tile before blending, so the full
 * 4× image never has to exist in memory. Alpha is not sent to the model; it
 * is enlarged separately with a bicubic (Catmull-Rom) filter.
 *
 * Only one tile row of the output is held in a float accumulator at a time;
 * rows are written out as soon as no later tile can touch them.
 */

export const ESRGAN_SCALE = 4;
export const UPSCALE_TILE = 256;
export const UPSCALE_OVERLAP = 32;
/** Input pixels at each interior tile edge that get (almost) no weight: the model saw zero padding there. */
export const UPSCALE_MARGIN = 10;
/** Largest AI-upscaled output we attempt (pixels). Beyond this, memory use and run time are impractical in a browser. */
export const MAX_UPSCALE_PIXELS = 64_000_000;
export const MAX_UPSCALE_SIDE = 16_384;

export type UpscaleFactor = 2 | 4;

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Span {
  start: number;
  size: number;
}

/**
 * Tile positions along one axis: every tile is `min(tile, length)` long, the
 * first starts at 0, the last ends at `length`, and neighbours overlap by at
 * least `overlap` (start positions are spread evenly).
 */
export function tileSpans(length: number, tile = UPSCALE_TILE, overlap = UPSCALE_OVERLAP): Span[] {
  if (!(length >= 1) || !(tile >= 1)) throw new Error('Invalid tile layout.');
  if (overlap < 0 || overlap >= tile) throw new Error('Tile overlap must be smaller than the tile.');
  if (length <= tile) return [{ start: 0, size: length }];
  const n = Math.ceil((length - overlap) / (tile - overlap));
  const spans: Span[] = [];
  for (let i = 0; i < n; i++) spans.push({ start: Math.round((i * (length - tile)) / (n - 1)), size: tile });
  return spans;
}

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
  row: number;
}

export function tileGrid(width: number, height: number, tile = UPSCALE_TILE, overlap = UPSCALE_OVERLAP): Tile[] {
  const xs = tileSpans(width, tile, overlap);
  const ys = tileSpans(height, tile, overlap);
  const out: Tile[] = [];
  ys.forEach((y, row) => xs.forEach((x, col) => out.push({ x: x.start, y: y.start, w: x.size, h: y.size, col, row })));
  return out;
}

/**
 * Blending weights along one axis in output pixels (input × `scale`). For
 * tile i, `weights[i][p]` applies to output coordinate `spans[i].start *
 * scale + p`. Raw weights ramp linearly from ~0 to 1 across each overlap
 * with a neighbour (not at the image border), then are normalised so the
 * weights of all tiles covering a coordinate sum to 1.
 */
export function axisWeights(spans: readonly Span[], scale: number, margin = UPSCALE_MARGIN): Float32Array[] {
  // Weight across one overlap of `ov` output px: ~0 for the outer `dead` px
  // (where the model saw zero padding), then a linear ramp to 1.
  const edge = (p: number, ov: number) => {
    if (ov <= 0) return 1;
    const dead = Math.min(margin * scale, Math.floor((ov - 1) / 2));
    const ramp = ov - 2 * dead;
    return Math.max(1e-6, Math.min(1, (p + 0.5 - dead) / ramp));
  };
  const raw = spans.map((s, i) => {
    const len = s.size * scale;
    const ovIn = i > 0 ? (spans[i - 1].start + spans[i - 1].size - s.start) * scale : 0;
    const ovOut = i < spans.length - 1 ? (s.start + s.size - spans[i + 1].start) * scale : 0;
    const w = new Float32Array(len);
    for (let p = 0; p < len; p++) w[p] = Math.min(edge(p, ovIn), edge(len - 1 - p, ovOut));
    return w;
  });
  const last = spans[spans.length - 1];
  const sum = new Float64Array((last.start + last.size) * scale);
  spans.forEach((s, i) => raw[i].forEach((v, p) => (sum[s.start * scale + p] += v)));
  spans.forEach((s, i) => raw[i].forEach((v, p, arr) => (arr[p] = v / sum[s.start * scale + p])));
  return raw;
}

export function upscaledSize(size: { width: number; height: number }, factor: UpscaleFactor) {
  return { width: size.width * factor, height: size.height * factor };
}

/** Why an AI upscale of `size` (the rendered photo) by `factor` cannot run, or null if it can. */
export function upscaleSizeProblem(size: { width: number; height: number }, factor: UpscaleFactor): string | null {
  const out = upscaledSize(size, factor);
  const mp = (n: number) => `${(n / 1e6).toFixed(n < 10e6 ? 1 : 0)} MP`;
  if (out.width > MAX_UPSCALE_SIDE || out.height > MAX_UPSCALE_SIDE || out.width * out.height > MAX_UPSCALE_PIXELS) {
    const hint = factor === 4 ? 'Choose 2×, crop the photo, or export without AI upscale.' : 'Crop the photo or export without AI upscale.';
    return `AI upscale ${factor}× would make ${out.width} × ${out.height} px (${mp(out.width * out.height)}). The limit is ${mp(MAX_UPSCALE_PIXELS)} and ${MAX_UPSCALE_SIDE} px per side. ${hint}`;
  }
  return null;
}

/** Number of model runs an upscale of `size` needs. */
export function upscaleTileCount(size: { width: number; height: number }, tile = UPSCALE_TILE, overlap = UPSCALE_OVERLAP): number {
  return tileSpans(size.width, tile, overlap).length * tileSpans(size.height, tile, overlap).length;
}

// sRGB <-> linear lookup tables for the 2× downscale.
const DECODE_STEPS = 4095;
const ENCODE_STEPS = 16383;
let decodeLut: Float32Array | null = null;
let encodeLut: Float32Array | null = null;
function luts() {
  if (!decodeLut || !encodeLut) {
    decodeLut = new Float32Array(DECODE_STEPS + 1);
    for (let i = 0; i <= DECODE_STEPS; i++) {
      const c = i / DECODE_STEPS;
      decodeLut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    encodeLut = new Float32Array(ENCODE_STEPS + 1);
    for (let i = 0; i <= ENCODE_STEPS; i++) {
      const l = i / ENCODE_STEPS;
      encodeLut[i] = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    }
  }
  return { dec: decodeLut, enc: encodeLut };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface UpscaleOptions {
  factor: UpscaleFactor;
  /**
   * Runs the 4× model on one tile. Input is planar RGB float32 `[3, h, w]`
   * in 0–1 (sRGB values); the result must be planar `[3, 4h, 4w]`.
   */
  runTile: (input: Float32Array, w: number, h: number) => Promise<Float32Array>;
  tile?: number;
  overlap?: number;
  margin?: number;
  signal?: AbortSignal;
  onTile?: (done: number, total: number) => void;
}

export async function upscaleImage(src: RgbaImage, opts: UpscaleOptions): Promise<RgbaImage> {
  const { width: W, height: H, data } = src;
  const f = opts.factor;
  if (f !== 2 && f !== 4) throw new Error('AI upscale supports 2× and 4× only.');
  const problem = upscaleSizeProblem(src, f);
  if (problem) throw new Error(problem);
  const xs = tileSpans(W, opts.tile, opts.overlap);
  const ys = tileSpans(H, opts.tile, opts.overlap);
  const wx = axisWeights(xs, f, opts.margin);
  const wy = axisWeights(ys, f, opts.margin);
  const OW = W * f;
  const OH = H * f;
  const out = new Uint8ClampedArray(OW * OH * 4);
  const linear = f !== ESRGAN_SCALE;
  const { dec, enc } = luts();
  const accRows = ys[0].size * f;
  const acc = new Float32Array(OW * accRows * 3);
  const total = xs.length * ys.length;
  let done = 0;
  let accY0 = 0;

  for (let r = 0; r < ys.length; r++) {
    const ty = ys[r];
    for (let c = 0; c < xs.length; c++) {
      opts.signal?.throwIfAborted();
      const tx = xs[c];
      const tw = tx.size;
      const th = ty.size;
      const plane = tw * th;
      const input = new Float32Array(plane * 3);
      for (let y = 0; y < th; y++) {
        let si = ((ty.start + y) * W + tx.start) * 4;
        let di = y * tw;
        for (let x = 0; x < tw; x++, si += 4, di++) {
          input[di] = data[si] / 255;
          input[plane + di] = data[si + 1] / 255;
          input[2 * plane + di] = data[si + 2] / 255;
        }
      }
      const res = await opts.runTile(input, tw, th);
      const MW = tw * ESRGAN_SCALE;
      const MH = th * ESRGAN_SCALE;
      const mplane = MW * MH;
      if (res.length !== mplane * 3) throw new Error(`The upscaling model returned ${res.length} values; expected ${mplane * 3}.`);
      const ow = tw * f;
      const oh = th * f;
      const wxs = wx[c];
      const wys = wy[r];
      const ox0 = tx.start * f;
      const rowBase = ty.start * f - accY0;
      for (let oy = 0; oy < oh; oy++) {
        const wyv = wys[oy];
        let ai = ((rowBase + oy) * OW + ox0) * 3;
        for (let ox = 0; ox < ow; ox++, ai += 3) {
          const w = wyv * wxs[ox];
          for (let ch = 0; ch < 3; ch++) {
            const base = ch * mplane;
            let v: number;
            if (linear) {
              // Exact 2:1 area downscale of the 4× result, averaged in linear light.
              const i0 = base + oy * 2 * MW + ox * 2;
              const i1 = i0 + MW;
              v =
                (dec[Math.round(clamp01(res[i0]) * DECODE_STEPS)] +
                  dec[Math.round(clamp01(res[i0 + 1]) * DECODE_STEPS)] +
                  dec[Math.round(clamp01(res[i1]) * DECODE_STEPS)] +
                  dec[Math.round(clamp01(res[i1 + 1]) * DECODE_STEPS)]) *
                0.25;
            } else {
              v = clamp01(res[base + oy * MW + ox]);
            }
            acc[ai + ch] += w * v;
          }
        }
      }
      done++;
      opts.onTile?.(done, total);
    }

    // Rows above the next tile row are final: write them out and slide the rest up.
    const flushEnd = r + 1 < ys.length ? ys[r + 1].start * f : OH;
    const flushRows = flushEnd - accY0;
    for (let y = 0; y < flushRows; y++) {
      let ai = y * OW * 3;
      let oi = (accY0 + y) * OW * 4;
      for (let x = 0; x < OW; x++, ai += 3, oi += 4) {
        for (let ch = 0; ch < 3; ch++) {
          const v = clamp01(acc[ai + ch]);
          out[oi + ch] = Math.round((linear ? enc[Math.round(v * ENCODE_STEPS)] : v) * 255);
        }
        out[oi + 3] = 255;
      }
    }
    const keepEnd = (ty.start + ty.size) * f - accY0;
    acc.copyWithin(0, flushRows * OW * 3, keepEnd * OW * 3);
    acc.fill(0, (keepEnd - flushRows) * OW * 3);
    accY0 = flushEnd;
  }

  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  if (!opaque) {
    const alpha = new Uint8Array(W * H);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    const big = resizeChannelCubic(alpha, W, H, OW, OH);
    for (let i = 0; i < big.length; i++) out[i * 4 + 3] = big[i];
  }
  return { width: OW, height: OH, data: out };
}

function cubic(t: number): number {
  // Catmull-Rom (a = -0.5).
  const x = Math.abs(t);
  if (x < 1) return 1.5 * x * x * x - 2.5 * x * x + 1;
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
  return 0;
}

function cubicTaps(src: number, dst: number) {
  const idx = new Int32Array(dst * 4);
  const wts = new Float32Array(dst * 4);
  const s = src / dst;
  for (let o = 0; o < dst; o++) {
    const c = (o + 0.5) * s - 0.5;
    const i0 = Math.floor(c) - 1;
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const w = cubic(c - (i0 + k));
      idx[o * 4 + k] = Math.min(src - 1, Math.max(0, i0 + k));
      wts[o * 4 + k] = w;
      sum += w;
    }
    for (let k = 0; k < 4; k++) wts[o * 4 + k] /= sum;
  }
  return { idx, wts };
}

/** Enlarges one 8-bit channel with a separable Catmull-Rom filter (edge pixels clamp). */
export function resizeChannelCubic(src: Uint8Array, w: number, h: number, ow: number, oh: number): Uint8ClampedArray {
  const tx = cubicTaps(w, ow);
  const ty = cubicTaps(h, oh);
  const mid = new Float32Array(ow * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < ow; x++) {
      const k = x * 4;
      mid[y * ow + x] =
        src[row + tx.idx[k]] * tx.wts[k] +
        src[row + tx.idx[k + 1]] * tx.wts[k + 1] +
        src[row + tx.idx[k + 2]] * tx.wts[k + 2] +
        src[row + tx.idx[k + 3]] * tx.wts[k + 3];
    }
  }
  const out = new Uint8ClampedArray(ow * oh);
  for (let y = 0; y < oh; y++) {
    const k = y * 4;
    const r0 = ty.idx[k] * ow;
    const r1 = ty.idx[k + 1] * ow;
    const r2 = ty.idx[k + 2] * ow;
    const r3 = ty.idx[k + 3] * ow;
    const w0 = ty.wts[k];
    const w1 = ty.wts[k + 1];
    const w2 = ty.wts[k + 2];
    const w3 = ty.wts[k + 3];
    for (let x = 0; x < ow; x++) out[y * ow + x] = Math.round(mid[r0 + x] * w0 + mid[r1 + x] * w1 + mid[r2 + x] * w2 + mid[r3 + x] * w3);
  }
  return out;
}
