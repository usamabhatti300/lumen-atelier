/**
 * Small-face recovery. MediaPipe's face landmarker uses a short-range detector
 * that only finds faces filling a fair part of the image (selfie distance). A
 * person standing in a landscape has a face a few percent of the frame wide and
 * is missed. These helpers pick likely face areas (from the segmenter's
 * face-skin map, else the top of the person, else a grid of tiles) so the
 * landmarker can run again on crops where the face is large, and map the
 * results back to full-image coordinates.
 */
import type { Landmark } from './faceMask';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalised bounding box of a face's landmarks. */
export function landmarkBox(face: Landmark[]): Rect {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const p of face) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Connected regions of a 0..255 map above `threshold`, as normalised boxes,
 * largest first. The map is scanned on a grid of at most `grid` cells per side.
 */
export function blobs(map: ArrayLike<number>, width: number, height: number, threshold = 128, minFraction = 0.00004, grid = 160): Rect[] {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / grid));
  const gw = Math.ceil(width / step);
  const gh = Math.ceil(height / step);
  const on = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) on[gy * gw + gx] = map[Math.min(height - 1, gy * step) * width + Math.min(width - 1, gx * step)] >= threshold ? 1 : 0;
  const seen = new Uint8Array(gw * gh);
  const out: (Rect & { area: number })[] = [];
  const stack: number[] = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue;
    let area = 0;
    let x0 = gw;
    let y0 = gh;
    let x1 = 0;
    let y1 = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % gw;
      const y = (j - x) / gw;
      area++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const k = ny * gw + nx;
        if (on[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    if (area / (gw * gh) < minFraction) continue;
    out.push({ x: x0 / gw, y: y0 / gh, w: (x1 - x0 + 1) / gw, h: (y1 - y0 + 1) / gh, area });
  }
  return out.sort((a, b) => b.area - a.area).map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/** A square crop (in pixels) around a normalised box, `scale` times its longer side, kept inside the image. */
export function squareCrop(box: Rect, imgW: number, imgH: number, scale: number, minSide = 96): Rect {
  const cx = (box.x + box.w / 2) * imgW;
  const cy = (box.y + box.h / 2) * imgH;
  const side = Math.min(Math.max(imgW, imgH), Math.max(minSide, Math.max(box.w * imgW, box.h * imgH) * scale));
  const w = Math.min(imgW, side);
  const h = Math.min(imgH, side);
  return {
    x: Math.round(Math.min(imgW - w, Math.max(0, cx - w / 2))),
    y: Math.round(Math.min(imgH - h, Math.max(0, cy - h / 2))),
    w: Math.round(w),
    h: Math.round(h),
  };
}

/** Overlapping tiles (last resort when segmentation gives no hint). */
export function tiles(imgW: number, imgH: number, n = 3): Rect[] {
  const side = Math.round(Math.min(imgW, imgH) * (n === 2 ? 0.62 : 0.45));
  const out: Rect[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      out.push({
        x: Math.round(((imgW - side) * i) / Math.max(1, n - 1)),
        y: Math.round(((imgH - side) * j) / Math.max(1, n - 1)),
        w: side,
        h: side,
      });
    }
  return out;
}

/**
 * Where to look again for faces the full-frame pass missed: around face-skin
 * regions first; failing that, the head end of each person; failing that, tiles.
 * Areas already covered by a found face are skipped. At most `limit` crops.
 */
export function faceSearchCrops(
  seg: { width: number; height: number; faceSkin: ArrayLike<number>; subject: ArrayLike<number> } | null,
  imgW: number,
  imgH: number,
  found: Rect[],
  limit = 6,
): Rect[] {
  const covered = (b: Rect) => found.some((f) => overlap(f, b) > 0.3);
  let boxes: Rect[] = [];
  if (seg) {
    boxes = blobs(seg.faceSkin, seg.width, seg.height).filter((b) => !covered(b)).map((b) => squareCrop(b, imgW, imgH, 3.2));
    if (!boxes.length) {
      // No face skin (e.g. the face is too small or turned): try the top of each person.
      boxes = blobs(seg.subject, seg.width, seg.height, 128, 0.002)
        .slice(0, 4)
        .map((p) => ({ x: p.x, y: p.y, w: p.w, h: Math.min(p.h, p.w * 0.9) }))
        .filter((b) => !covered(b))
        .map((b) => squareCrop(b, imgW, imgH, 1.3));
    }
  }
  if (!boxes.length && !found.length) boxes = tiles(imgW, imgH, 3);
  return boxes.slice(0, limit);
}

/** Landmarks found in a crop, in full-image normalised coordinates. */
export function fromCrop(face: Landmark[], crop: Rect, imgW: number, imgH: number): Landmark[] {
  return face.map((p) => ({ x: (crop.x + p.x * crop.w) / imgW, y: (crop.y + p.y * crop.h) / imgH }));
}

/** Intersection over the smaller box (1 = one contains the other). */
export function overlap(a: Rect, b: Rect): number {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const small = Math.min(a.w * a.h, b.w * b.h);
  return small > 0 ? (iw * ih) / small : 0;
}

/** Adds faces that are not duplicates of ones already found (crops overlap). */
export function mergeFaces(found: Landmark[][], extra: Landmark[][]): Landmark[][] {
  const out = [...found];
  for (const f of extra) {
    const box = landmarkBox(f);
    if (box.w <= 0 || box.h <= 0) continue;
    if (!out.some((g) => overlap(landmarkBox(g), box) > 0.4)) out.push(f);
  }
  return out;
}
