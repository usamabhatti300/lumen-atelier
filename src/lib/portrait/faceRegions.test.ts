import { describe, expect, it } from 'vitest';
import { blobs, faceSearchCrops, fromCrop, mergeFaces, squareCrop, tiles } from './faceRegions';

/** A w×h map with filled rectangles (pixel coordinates). */
function map(w: number, h: number, rects: [number, number, number, number][]) {
  const m = new Uint8ClampedArray(w * h);
  for (const [x, y, rw, rh] of rects) for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) m[j * w + i] = 255;
  return m;
}

describe('small-face search', () => {
  it('finds separate regions, largest first', () => {
    const b = blobs(map(200, 100, [[10, 10, 10, 10], [100, 40, 30, 30]]), 200, 100);
    expect(b).toHaveLength(2);
    expect(b[0].x).toBeCloseTo(0.5, 1);
    expect(b[0].w).toBeCloseTo(0.15, 1);
    expect(b[1].x).toBeCloseTo(0.05, 1);
  });

  it('makes square crops around a small face, inside the image', () => {
    const c = squareCrop({ x: 0.45, y: 0.2, w: 0.05, h: 0.06 }, 1000, 1400, 3.2);
    expect(c.w).toBe(c.h);
    expect(c.w).toBeGreaterThan(0.06 * 1400 * 3);
    expect(c.x + c.w / 2).toBeCloseTo(475, -1);
    const edge = squareCrop({ x: 0.98, y: 0.98, w: 0.02, h: 0.02 }, 500, 500, 4);
    expect(edge.x + edge.w).toBeLessThanOrEqual(500);
    expect(edge.y + edge.h).toBeLessThanOrEqual(500);
  });

  it('searches around face skin first, then the top of the person, then tiles', () => {
    const w = 100;
    const h = 140;
    const empty = new Uint8ClampedArray(w * h);
    const faceSkin = map(w, h, [[45, 30, 6, 7]]);
    const subject = map(w, h, [[35, 25, 30, 100]]);
    const byFace = faceSearchCrops({ width: w, height: h, faceSkin, subject }, 1000, 1400, []);
    expect(byFace).toHaveLength(1);
    expect(byFace[0].y).toBeLessThan(330);
    const byPerson = faceSearchCrops({ width: w, height: h, faceSkin: empty, subject }, 1000, 1400, []);
    expect(byPerson).toHaveLength(1);
    expect(byPerson[0].y).toBeLessThan(300); // the head end
    // No segmentation: the top two rows of a 3×3 grid (capped at 6 crops; faces are rarely in the bottom third).
    const grid = faceSearchCrops(null, 1000, 1400, []);
    expect(grid).toHaveLength(6);
    expect(Math.max(...grid.map((c) => c.y))).toBeLessThan(1400 / 2);
    expect(tiles(1000, 1400, 2)).toHaveLength(4);
  });

  it('skips regions where a face was already found', () => {
    const w = 100;
    const h = 100;
    const faceSkin = map(w, h, [[40, 40, 10, 10]]);
    const crops = faceSearchCrops({ width: w, height: h, faceSkin, subject: faceSkin }, 100, 100, [{ x: 0.38, y: 0.38, w: 0.15, h: 0.15 }]);
    expect(crops).toHaveLength(0);
  });

  it('maps crop landmarks back to the image and drops duplicates', () => {
    const crop = { x: 400, y: 200, w: 200, h: 200 };
    const [p] = fromCrop([{ x: 0.5, y: 0.25 }], crop, 1000, 1000);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.25);
    const face = [
      { x: 0.4, y: 0.2 },
      { x: 0.5, y: 0.3 },
    ];
    const same = face.map((q) => ({ x: q.x + 0.005, y: q.y }));
    const other = face.map((q) => ({ x: q.x + 0.3, y: q.y }));
    expect(mergeFaces([face], [same, other])).toHaveLength(2);
  });
});
