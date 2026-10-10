/**
 * "Select object" mask rasters (pure helpers, no DOM). A SAM selection is
 * stored in the edit state as clicked points only; the soft mask computed
 * from them is a cache keyed by photo + points, so it can be dropped and
 * recomputed at any time without changing the edit.
 *
 * Rasters are single-channel 0..255 coverage in normalized source-image
 * extent (the same space as every other mask component), at most
 * OBJECT_MASK_SIDE on the long edge. They are resampled bilinearly to
 * whatever size the preview or the export needs.
 */
import { OBJECT_MAX_POINTS, type ObjectComponent, type ObjectPoint } from '../schema/adjustments';

/** Long edge of cached object-mask rasters (SAM itself works at 1024; edges are refined at this size). */
export const OBJECT_MASK_SIDE = 2048;

export interface ObjectMaskRaster {
  width: number;
  height: number;
  /** Coverage 0..255, row-major, length width*height. */
  data: Uint8Array;
}

/** Cache key for a selection's raster: the photo and the exact prompt points. */
export function objectMaskKey(photoId: string, points: readonly ObjectPoint[]): string {
  const pts = points.map((p) => `${p.include ? '+' : '-'}${p.x.toFixed(5)},${p.y.toFixed(5)}`).join(';');
  return `${photoId}|${pts}`;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export type PointAction = 'replace' | 'include' | 'exclude';

/** Click modifiers: plain click starts a new selection, Shift adds to it, Alt subtracts from it. */
export function pointActionFor(e: { shiftKey: boolean; altKey: boolean }): PointAction {
  if (e.altKey) return 'exclude';
  if (e.shiftKey) return 'include';
  return 'replace';
}

/**
 * Applies a click to a selection's points. Returns the new point list, or
 * null when the click would leave no positive point (a selection needs at
 * least one "include" point).
 */
export function applyPoint(points: readonly ObjectPoint[], x: number, y: number, action: PointAction): ObjectPoint[] | null {
  const p: ObjectPoint = { x: clamp01(x), y: clamp01(y), include: action !== 'exclude' };
  if (action === 'replace') return [p];
  const next = [...points, p].slice(-OBJECT_MAX_POINTS);
  return next.some((q) => q.include) ? next : null;
}

/** Removes the point nearest to (x, y) within `radius` (normalized), keeping at least one positive point. */
export function removeNearestPoint(points: readonly ObjectPoint[], x: number, y: number, radius: number): ObjectPoint[] | null {
  let best = -1;
  let bestD = radius;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0) return null;
  const next = points.filter((_, i) => i !== best);
  return next.some((q) => q.include) ? next : null;
}

export function newObjectComponent(id: string, points: ObjectPoint[]): ObjectComponent {
  return { type: 'object', id, mode: 'add', points };
}

/** Size of the cached raster for a photo of the given size. */
export function objectMaskSize(full: { width: number; height: number }, maxSide = OBJECT_MASK_SIDE) {
  const k = Math.min(1, maxSide / Math.max(full.width, full.height));
  return { width: Math.max(1, Math.round(full.width * k)), height: Math.max(1, Math.round(full.height * k)) };
}

/**
 * Bilinear resample of a coverage raster to W x H (pixel-centre aligned), so
 * upsampled mask edges stay smooth at export resolution.
 */
export function resampleMask(src: ObjectMaskRaster, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H);
  const { width: w, height: h, data } = src;
  const sx = w / W;
  const sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    const r0 = y0 * w;
    const r1 = y1 * w;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const top = data[r0 + x0] + (data[r0 + x1] - data[r0 + x0]) * tx;
      const bot = data[r1 + x0] + (data[r1 + x1] - data[r1 + x0]) * tx;
      out[y * W + x] = Math.round(top + (bot - top) * ty);
    }
  }
  return out;
}

/** White RGBA pixels whose alpha is the coverage (the format every mask layer is drawn in). */
export function coverageToRgba(coverage: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(coverage.length * 4);
  for (let i = 0, j = 0; i < coverage.length; i++, j += 4) {
    out[j] = 255;
    out[j + 1] = 255;
    out[j + 2] = 255;
    out[j + 3] = coverage[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mask from SAM logits
// ---------------------------------------------------------------------------

/**
 * Soft coverage from mask logits: the decision boundary (logit 0) maps to
 * 50 %, with a narrow linear ramp so upsampled edges are anti-aliased.
 */
export function logitsToCoverage(logits: Float32Array, softness = 1): Float32Array {
  const out = new Float32Array(logits.length);
  const k = 0.5 / Math.max(1e-3, softness);
  for (let i = 0; i < logits.length; i++) out[i] = clamp01(0.5 + logits[i] * k);
  return out;
}

/**
 * SAM's low-resolution masks stop a few pixels short of the image border
 * (the sky never quite reaches the top edge). Where the mask is on just
 * inside the border, extend it out to the edge.
 */
export function fillBorderGaps(cov: Float32Array, w: number, h: number, depth: number): void {
  const d = Math.min(depth, Math.floor(w / 4), Math.floor(h / 4));
  if (d < 1) return;
  for (let x = 0; x < w; x++) {
    const top = cov[d * w + x];
    const bottom = cov[(h - 1 - d) * w + x];
    for (let y = 0; y < d; y++) {
      if (cov[y * w + x] < top) cov[y * w + x] = top;
      const yb = h - 1 - y;
      if (cov[yb * w + x] < bottom) cov[yb * w + x] = bottom;
    }
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const left = cov[row + d];
    const right = cov[row + w - 1 - d];
    for (let x = 0; x < d; x++) {
      if (cov[row + x] < left) cov[row + x] = left;
      if (cov[row + w - 1 - x] < right) cov[row + w - 1 - x] = right;
    }
  }
}

/**
 * Final coverage for a selection: SAM logits (already bilinearly upsampled
 * by post_process_masks) -> anti-aliased soft mask -> border gaps filled.
 *
 * A guided-filter edge refinement was tried and rejected: wherever the
 * photo has no strong edge it box-blurs the mask, which showed as a bright
 * halo along mountain ridges after darkening the sky. The SAM boundary
 * itself sits accurately on edges, so it is kept crisp.
 */
export function refineObjectMask(logits: Float32Array, w: number, h: number): Uint8Array {
  const cov = logitsToCoverage(logits);
  fillBorderGaps(cov, w, h, Math.max(2, Math.round(Math.max(w, h) / 170)));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(cov[i] * 255);
  return out;
}

/** Fraction of the raster that is selected (coverage >= 50 %). */
export function coverageFraction(r: ObjectMaskRaster): number {
  let n = 0;
  for (let i = 0; i < r.data.length; i++) if (r.data[i] >= 128) n++;
  return r.data.length ? n / r.data.length : 0;
}
