/**
 * Pure maths for the Remove tool (no DOM, no model): which pixels a removal
 * covers, the crop sent to the inpainting model, the model's mask encoding,
 * and the feathered composite that writes the filled pixels back.
 *
 * Coordinates: removal strokes are normalized source-image coordinates. A
 * removal is evaluated against a "working image" of W×H pixels (the preview
 * copy, or the full-resolution original on export), so the same strokes give
 * the same region at any resolution.
 *
 * Region model, per stroke of radius r (px):
 *   d        = distance from the pixel to the stroke path minus r (≤ 0 inside the brush)
 *   fill     d ≤ dilate          → the model regenerates it, alpha 255
 *   feather  dilate < d < dilate+feather → alpha ramps 255 → 0 (blends the model output,
 *            which reproduces kept pixels almost exactly, into the original)
 *   outside  alpha 0             → the original pixel is left byte-identical
 */
import type { Removal, RemovalStroke } from '@/lib/schema/adjustments';

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const REMOVAL_TUNING = {
  /** Grow the painted area slightly so object edges and halos are covered (fraction of r). */
  dilate: 0.12,
  minDilatePx: 1.5,
  /** Width of the soft blend band outside the filled area (fraction of r). */
  feather: 0.22,
  minFeatherPx: 2,
  /** Context around the affected area given to the model (fraction of its larger side). */
  context: 0.75,
  /** Minimum context, as a fraction of the image's long edge. */
  minContext: 0.03,
  /** Larger crops are downscaled before inference (MI-GAN works at 512 px internally anyway). */
  maxInferSide: 2048,
} as const;

interface StrokePx {
  r: number;
  dilate: number;
  feather: number;
  pts: [number, number][];
}

function strokePx(s: RemovalStroke, W: number, H: number): StrokePx {
  const r = Math.max(0.5, (s.size * Math.max(W, H)) / 2);
  return {
    r,
    dilate: Math.max(REMOVAL_TUNING.minDilatePx, r * REMOVAL_TUNING.dilate),
    feather: Math.max(REMOVAL_TUNING.minFeatherPx, r * REMOVAL_TUNING.feather),
    pts: s.points.map(([x, y]) => [x * W, y * H]),
  };
}

const reach = (s: StrokePx) => s.r + s.dilate + s.feather;

/** Pixel area a removal can change (fill + feather), clamped to the image; null if it misses the image. */
export function removalBounds(removal: Removal, W: number, H: number): PxRect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const st of removal.strokes) {
    const s = strokePx(st, W, H);
    const k = reach(s);
    for (const [x, y] of s.pts) {
      x0 = Math.min(x0, x - k);
      y0 = Math.min(y0, y - k);
      x1 = Math.max(x1, x + k);
      y1 = Math.max(y1, y + k);
    }
  }
  return clampRect(x0, y0, x1, y1, W, H);
}

function clampRect(x0: number, y0: number, x1: number, y1: number, W: number, H: number): PxRect | null {
  const ix0 = Math.max(0, Math.floor(x0));
  const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(W, Math.ceil(x1));
  const iy1 = Math.min(H, Math.ceil(y1));
  if (ix1 <= ix0 || iy1 <= iy0) return null;
  return { x: ix0, y: iy0, w: ix1 - ix0, h: iy1 - iy0 };
}

/** The crop given to the model: the affected area plus surrounding context, clamped to the image. */
export function removalCrop(removal: Removal, W: number, H: number): PxRect | null {
  const b = removalBounds(removal, W, H);
  if (!b) return null;
  const m = Math.max(Math.max(b.w, b.h) * REMOVAL_TUNING.context, Math.max(W, H) * REMOVAL_TUNING.minContext);
  return clampRect(b.x - m, b.y - m, b.x + b.w + m, b.y + b.h + m, W, H);
}

/** Scale (≤ 1) at which a crop is sent to the model. */
export function inferenceScale(crop: PxRect, maxSide: number = REMOVAL_TUNING.maxInferSide): number {
  return Math.min(1, maxSide / Math.max(crop.w, crop.h));
}

export interface RemovalRaster {
  width: number;
  height: number;
  /** Model mask: 255 = keep, 0 = fill (MI-GAN's convention; it treats any non-zero value as partly known). */
  keep: Uint8Array;
  /** Composite weight: 255 = use the filled pixel, 0 = leave the original untouched. */
  alpha: Uint8Array;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Rasterizes a removal over `crop` (pixels of the W×H working image), sampled
 * on a grid of round(crop * scale) pixels. `extraFillPx` grows the fill area
 * (used for the downscaled model mask so it fully covers the full-res fill).
 */
export function rasterizeRemoval(removal: Removal, W: number, H: number, crop: PxRect, scale = 1, extraFillPx = 0): RemovalRaster {
  const gw = Math.max(1, Math.round(crop.w * scale));
  const gh = Math.max(1, Math.round(crop.h * scale));
  const sx = gw / crop.w;
  const sy = gh / crop.h;
  const n = gw * gh;
  const keep = new Uint8Array(n).fill(255);
  const alpha = new Uint8Array(n);
  for (const st of removal.strokes) {
    const s = strokePx(st, W, H);
    const fillAt = s.dilate + extraFillPx;
    const k = reach(s) + extraFillPx;
    const pts = s.pts.length === 1 ? [s.pts[0], s.pts[0]] : s.pts;
    for (let p = 0; p < pts.length - 1; p++) {
      const [ax, ay] = pts[p];
      const [bx, by] = pts[p + 1];
      // Grid cells whose centres can be within reach of this segment.
      const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - k - crop.x) * sx));
      const gx1 = Math.min(gw - 1, Math.ceil((Math.max(ax, bx) + k - crop.x) * sx));
      const gy0 = Math.max(0, Math.floor((Math.min(ay, by) - k - crop.y) * sy));
      const gy1 = Math.min(gh - 1, Math.ceil((Math.max(ay, by) + k - crop.y) * sy));
      for (let gy = gy0; gy <= gy1; gy++) {
        const py = crop.y + (gy + 0.5) / sy;
        const row = gy * gw;
        for (let gx = gx0; gx <= gx1; gx++) {
          const i = row + gx;
          if (keep[i] === 0 && alpha[i] === 255) continue;
          const d = segDist(crop.x + (gx + 0.5) / sx, py, ax, ay, bx, by) - s.r;
          if (d <= fillAt) keep[i] = 0;
          if (d <= s.dilate) alpha[i] = 255;
          else if (d < s.dilate + s.feather) {
            const t = 1 - (d - s.dilate) / s.feather;
            const a = Math.min(254, Math.round(255 * t * t * (3 - 2 * t)));
            if (a > alpha[i]) alpha[i] = a;
          }
        }
      }
    }
  }
  return { width: gw, height: gh, keep, alpha };
}

/** RGBA (canvas order) → planar uint8 RGB [1,3,H,W], the model's image layout. */
export function rgbaToNchw(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(3 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = rgba[j];
    out[n + i] = rgba[j + 1];
    out[2 * n + i] = rgba[j + 2];
  }
  return out;
}

/** Planar uint8 RGB [1,3,H,W] → opaque RGBA. */
export function nchwToRgba(planar: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const n = w * h;
  const out = new Uint8ClampedArray(4 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[j] = planar[i];
    out[j + 1] = planar[n + i];
    out[j + 2] = planar[2 * n + i];
    out[j + 3] = 255;
  }
  return out;
}

/** A filled region ready to composite: RGB from the model, A = blend weight. */
export interface RemovalPatch {
  /** Rectangle in working-image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

/** Combines the model's filled RGB (RGBA, crop size) with the composite weights. */
export function buildPatch(crop: PxRect, filled: Uint8ClampedArray, alpha: Uint8Array): RemovalPatch {
  const data = new Uint8ClampedArray(filled.length);
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    data[j] = filled[j];
    data[j + 1] = filled[j + 1];
    data[j + 2] = filled[j + 2];
    data[j + 3] = alpha[i];
  }
  return { ...crop, data };
}

/**
 * Blends `patch` into `dst` (RGBA pixels of the same rectangle). Pixels with
 * weight 0 are not written, so they stay byte-identical; weight 255 copies the
 * filled pixel exactly. Destination alpha is kept.
 */
export function compositePatch(dst: Uint8ClampedArray, patch: RemovalPatch): void {
  const src = patch.data;
  for (let j = 0; j < src.length; j += 4) {
    const a = src[j + 3];
    if (a === 0) continue;
    if (a === 255) {
      dst[j] = src[j];
      dst[j + 1] = src[j + 1];
      dst[j + 2] = src[j + 2];
      continue;
    }
    // Uint8ClampedArray rounds to nearest on assignment.
    for (let c = 0; c < 3; c++) dst[j + c] = dst[j + c] + ((src[j + c] - dst[j + c]) * a) / 255;
  }
}

/** Removals that take part in rendering, in order. */
export function activeRemovals(removals: readonly Removal[] | undefined): Removal[] {
  return (removals ?? []).filter((r) => r.visible && r.strokes.length > 0);
}

/** 53-bit string hash (cyrb53), hex. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * Cache keys, one per active removal. Each removal is filled from the image
 * left by the removals before it, so its key covers that whole prefix plus the
 * working size. Ids are not part of the key, so undo/redo reuses results.
 */
export function removalChainKeys(removals: readonly Removal[], W: number, H: number): string[] {
  const keys: string[] = [];
  let acc = `${W}x${H}`;
  for (const r of removals) {
    acc = hashString(`${acc}|${JSON.stringify(r.strokes)}`);
    keys.push(`${W}x${H}-${acc}`);
  }
  return keys;
}

/** Drops points closer than `minStep` (normalized long-edge units) to the previous kept point. */
export function simplifyStroke(points: [number, number][], W: number, H: number, minStep: number): [number, number][] {
  if (points.length <= 2) return points;
  const long = Math.max(W, H);
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [lx, ly] = out[out.length - 1];
    if (Math.hypot((points[i][0] - lx) * W, (points[i][1] - ly) * H) / long >= minStep) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}
