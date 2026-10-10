import { describe, expect, it } from 'vitest';
import { autoFocus, boxMean, composeDepthRaster, depthAt, flattenSubjects, focusFromNearness, guidedFilter, type DepthMap } from './raster';
import { normalizeNearness } from '../ml/depth';

describe('depth raster', { timeout: 60_000 }, () => {
  it('box mean and guided filter keep flat maps flat', () => {
    const w = 20;
    const h = 10;
    const flat = new Float32Array(w * h).fill(0.4);
    for (const v of boxMean(flat, w, h, 3)) expect(v).toBeCloseTo(0.4, 6);
    const I = new Float32Array(w * h).map((_, i) => (i % 7) / 7);
    for (const v of guidedFilter(I, flat, w, h, 3, 1e-3)) expect(v).toBeCloseTo(0.4, 5);
  });

  it('snaps a soft depth edge onto the photo edge', () => {
    const w = 600;
    const h = 520;
    // Photo: bright object on the left half, dark background on the right.
    const guide = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    for (let i = 0; i < w * h; i++) {
      const v = i % w < w / 2 ? 230 : 20;
      guide.data.set([v, v * 0.8, v * 0.5, 255], i * 4);
    }
    // Model depth: a soft 20 px ramp across the edge (near 1 -> far 0).
    const depth: DepthMap = { width: w, height: h, data: new Uint16Array(w * h) };
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      depth.data[i] = Math.round(Math.min(1, Math.max(0, (w / 2 + 10 - x) / 20)) * 65535);
    }
    const t0 = performance.now();
    const r = composeDepthRaster(depth, guide, { subject: null });
    expect(performance.now() - t0).toBeLessThan(5000);
    const at = (x: number) => r.data[260 * w + x] / 255;
    // Just inside and just outside the object: much closer to the true depths (1 / 0) than the ramp (0.65 / 0.4).
    expect(at(w / 2 - 3)).toBeGreaterThan(0.78);
    expect(at(w / 2 + 2)).toBeLessThan(0.25);
  });

  it('flattens each person to their own depth', () => {
    const w = 40;
    const h = 20;
    const n = new Float32Array(w * h);
    const m = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        n[i] = x / w;
        if (x >= 2 && x < 10) m[i] = 1; // person A
        if (x >= 30 && x < 38) m[i] = 1; // person B
      }
    const out = flattenSubjects(n, m, w, h);
    const a = out[5 * w + 2];
    expect(out[5 * w + 9]).toBeCloseTo(a, 6);
    expect(out[5 * w + 31]).toBeCloseTo(out[5 * w + 37], 6);
    expect(out[5 * w + 31]).toBeGreaterThan(a + 0.5); // separate people keep separate depths
    expect(out[5 * w + 20]).toBe(n[5 * w + 20]); // background untouched
  });

  it('auto-focuses on the subject, or on the nearest central area', () => {
    const w = 50;
    const h = 40;
    const data = new Uint8Array(w * h).fill(40);
    const subject = new Float32Array(w * h);
    for (let y = 10; y < 30; y++)
      for (let x = 30; x < 45; x++) {
        data[y * w + x] = 200;
        subject[y * w + x] = 1;
      }
    const f = autoFocus({ width: w, height: h, data }, subject);
    expect(f.nearness).toBeCloseTo(200 / 255, 6);
    expect(f.x).toBeGreaterThan(0.6);
    expect(focusFromNearness(f.nearness)).toBe(22);
    const g = autoFocus({ width: w, height: h, data }, null);
    expect(g.nearness).toBeCloseTo(200 / 255, 6);
    expect(depthAt({ width: w, height: h, data }, 37 / w, 20 / h)).toBeCloseTo(200 / 255, 6);
  });

  it('normalizes model output robustly to 16-bit nearness', () => {
    const pred = Float32Array.from({ length: 1000 }, (_, i) => i / 999);
    pred[0] = -50; // outliers do not stretch the range
    pred[999] = 80;
    const n = normalizeNearness(pred);
    expect(n[500]).toBeGreaterThan(30000);
    expect(n[500]).toBeLessThan(36000);
    expect(n[0]).toBe(0);
    expect(n[999]).toBe(65535);
    expect(Array.from(normalizeNearness(new Float32Array(4).fill(2)))).toEqual([0, 0, 0, 0]);
  });
});
