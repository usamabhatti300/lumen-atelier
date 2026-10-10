import { describe, expect, it } from 'vitest';
import { EditStateSchema, defaultEditState, type Removal } from '@/lib/schema/adjustments';
import { reviveEdit } from '@/lib/storage/db';
import {
  REMOVAL_TUNING,
  activeRemovals,
  buildPatch,
  compositePatch,
  inferenceScale,
  nchwToRgba,
  rasterizeRemoval,
  removalBounds,
  removalChainKeys,
  removalCrop,
  rgbaToNchw,
  simplifyStroke,
} from './removal';

const dot = (x: number, y: number, size = 0.05, id = 'r1'): Removal => ({ id, visible: true, strokes: [{ size, points: [[x, y]] }] });

describe('removal crop and margin', () => {
  it('bounds cover the brush, dilation and feather, in working pixels', () => {
    const W = 1000;
    const H = 500;
    const b = removalBounds(dot(0.5, 0.5, 0.04), W, H)!;
    // r = 0.04 * 1000 / 2 = 20 px; dilate 2.4 px; feather 4.4 px → reach 26.8 px.
    expect(b.x).toBe(Math.floor(500 - 26.8));
    expect(b.x + b.w).toBe(Math.ceil(500 + 26.8));
    expect(b.y).toBe(Math.floor(250 - 26.8));
  });

  it('adds context around the affected area and clamps to the image', () => {
    const W = 1000;
    const H = 500;
    const b = removalBounds(dot(0.5, 0.5, 0.04), W, H)!;
    const c = removalCrop(dot(0.5, 0.5, 0.04), W, H)!;
    const m = Math.max(Math.max(b.w, b.h) * REMOVAL_TUNING.context, 1000 * REMOVAL_TUNING.minContext);
    expect(c.x).toBe(Math.max(0, Math.floor(b.x - m)));
    expect(c.w).toBeGreaterThan(b.w);
    // Near a corner the crop is clamped.
    const corner = removalCrop(dot(0.01, 0.02, 0.04), W, H)!;
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);
    expect(corner.x + corner.w).toBeLessThanOrEqual(W);
  });

  it('is resolution independent (same normalized crop at preview and full size)', () => {
    const r: Removal = { id: 'a', visible: true, strokes: [{ size: 0.03, points: [[0.3, 0.4], [0.45, 0.42]] }] };
    const p = removalCrop(r, 2048, 1365)!;
    const f = removalCrop(r, 6000, 4000)!;
    expect(p.x / 2048).toBeCloseTo(f.x / 6000, 2);
    expect(p.w / 2048).toBeCloseTo(f.w / 6000, 2);
    expect(p.h / 1365).toBeCloseTo(f.h / 4000, 2);
  });

  it('returns null for strokes entirely outside the image', () => {
    expect(removalBounds(dot(1.8, 1.8, 0.01), 100, 100)).toBeNull();
    expect(removalCrop(dot(-0.9, 0.5, 0.01), 100, 100)).toBeNull();
  });

  it('downscales only crops larger than the inference limit', () => {
    expect(inferenceScale({ x: 0, y: 0, w: 800, h: 600 })).toBe(1);
    expect(inferenceScale({ x: 0, y: 0, w: 4096, h: 1000 })).toBe(0.5);
  });
});

describe('removal mask encoding', () => {
  const W = 200;
  const H = 100;
  const r = dot(0.5, 0.5, 0.1); // r = 10 px at (100, 50)
  const crop = removalCrop(r, W, H)!;
  const ras = rasterizeRemoval(r, W, H, crop);
  const at = (x: number, y: number) => (y - crop.y) * ras.width + (x - crop.x);

  it('is binary 255 (keep) / 0 (fill), as MI-GAN requires', () => {
    expect(ras.width).toBe(crop.w);
    expect(ras.height).toBe(crop.h);
    expect([...new Set(ras.keep)].sort()).toEqual([0, 255]);
  });

  it('fills the brush area (grown slightly) and keeps everything else', () => {
    expect(ras.keep[at(100, 50)]).toBe(0);
    expect(ras.keep[at(109, 50)]).toBe(0); // inside r
    expect(ras.keep[at(110, 50)]).toBe(0); // outside r, within the dilation
    expect(ras.keep[at(115, 50)]).toBe(255);
    expect(ras.keep[at(crop.x, crop.y)]).toBe(255);
  });

  it('weights are 255 where filled, ramp in the feather band, 0 beyond', () => {
    expect(ras.alpha[at(100, 50)]).toBe(255);
    const band = ras.alpha[at(113, 50)];
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(255);
    expect(ras.alpha[at(118, 50)]).toBe(0);
    // Every filled pixel is fully composited.
    for (let i = 0; i < ras.keep.length; i++) if (ras.alpha[i] === 255) expect(ras.keep[i]).toBe(0);
  });

  it('follows the whole stroke path', () => {
    const line: Removal = { id: 'l', visible: true, strokes: [{ size: 0.05, points: [[0.2, 0.5], [0.8, 0.5]] }] };
    const c = removalCrop(line, W, H)!;
    const lr = rasterizeRemoval(line, W, H, c);
    for (const x of [45, 100, 155]) expect(lr.keep[(50 - c.y) * lr.width + (x - c.x)]).toBe(0);
    expect(lr.keep[(50 - c.y) * lr.width + (10 - c.x)]).toBe(255);
  });

  it('samples a downscaled grid and can grow the fill for it', () => {
    const half = rasterizeRemoval(r, W, H, crop, 0.5);
    expect(half.width).toBe(Math.round(crop.w * 0.5));
    const filled = (m: Uint8Array) => m.filter((v) => v === 0).length;
    const grown = rasterizeRemoval(r, W, H, crop, 0.5, 3);
    expect(filled(grown.keep)).toBeGreaterThan(filled(half.keep));
  });
});

describe('tensor layout', () => {
  it('converts RGBA to planar RGB and back', () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]);
    const nchw = rgbaToNchw(rgba, 2, 1);
    expect([...nchw]).toEqual([1, 4, 2, 5, 3, 6]);
    expect([...nchwToRgba(nchw, 2, 1)]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });
});

describe('compositing', () => {
  it('leaves zero-weight pixels byte-identical and copies full-weight pixels exactly', () => {
    const dst = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255, 100, 100, 100, 77]);
    const filled = new Uint8ClampedArray([200, 201, 202, 255, 50, 60, 70, 255, 0, 0, 0, 255]);
    const patch = buildPatch({ x: 0, y: 0, w: 3, h: 1 }, filled, new Uint8Array([0, 255, 128]));
    compositePatch(dst, patch);
    expect([...dst.slice(0, 4)]).toEqual([10, 20, 30, 255]);
    expect([...dst.slice(4, 8)]).toEqual([50, 60, 70, 255]);
    // 100 + (0 - 100) * 128/255 = 49.8 → 50; destination alpha untouched.
    expect([...dst.slice(8, 12)]).toEqual([50, 50, 50, 77]);
  });

  it('a full raster composite changes only the removal region', () => {
    const W = 64;
    const H = 64;
    const r = dot(0.5, 0.5, 0.2);
    const crop = removalCrop(r, W, H)!;
    const ras = rasterizeRemoval(r, W, H, crop);
    const before = new Uint8ClampedArray(crop.w * crop.h * 4).map((_, i) => (i * 7) % 251);
    const dst = before.slice();
    const fill = new Uint8ClampedArray(crop.w * crop.h * 4).fill(255);
    compositePatch(dst, buildPatch(crop, fill, ras.alpha));
    for (let i = 0; i < ras.alpha.length; i++) {
      const same = [0, 1, 2, 3].every((c) => dst[i * 4 + c] === before[i * 4 + c]);
      if (ras.alpha[i] === 0) expect(same).toBe(true);
      if (ras.alpha[i] === 255) expect(dst[i * 4]).toBe(255);
    }
  });
});

describe('cache keys and helpers', () => {
  it('depend on the strokes of the removal and of every earlier one, not on ids', () => {
    const a = dot(0.2, 0.2, 0.05, 'a');
    const b = dot(0.6, 0.6, 0.05, 'b');
    const [ka, kb] = removalChainKeys([a, b], 100, 80);
    expect(removalChainKeys([{ ...a, id: 'other' }], 100, 80)[0]).toBe(ka);
    expect(removalChainKeys([b], 100, 80)[0]).not.toBe(kb);
    expect(removalChainKeys([a, b], 200, 160)[1]).not.toBe(kb);
    expect(removalChainKeys([a, { ...b, strokes: [{ size: 0.06, points: [[0.6, 0.6]] }] }], 100, 80)[1]).not.toBe(kb);
  });

  it('ignores hidden and empty removals', () => {
    const list = [dot(0.1, 0.1, 0.05, 'a'), { ...dot(0.2, 0.2, 0.05, 'b'), visible: false }, { id: 'c', visible: true, strokes: [] }];
    expect(activeRemovals(list).map((r) => r.id)).toEqual(['a']);
    expect(activeRemovals(undefined)).toEqual([]);
  });

  it('simplifies dense strokes but keeps the end points', () => {
    const pts: [number, number][] = Array.from({ length: 101 }, (_, i) => [i / 100, 0.5]);
    const s = simplifyStroke(pts, 1000, 1000, 0.05);
    expect(s[0]).toEqual([0, 0.5]);
    expect(s[s.length - 1]).toEqual([1, 0.5]);
    expect(s.length).toBeLessThan(25);
  });
});

describe('removal schema', () => {
  const valid = { ...defaultEditState(), removals: [{ id: 'r1', visible: true, strokes: [{ size: 0.05, points: [[0.5, 0.5]] }] }] };

  it('keeps removals and accepts older edits without them', () => {
    expect(EditStateSchema.parse(valid).removals).toEqual(valid.removals);
    const old = EditStateSchema.parse(defaultEditState());
    expect(old.removals).toBeUndefined();
  });

  it('clamps brush sizes into range', () => {
    const big = { ...valid, removals: [{ id: 'r', visible: true, strokes: [{ size: 3, points: [[0.5, 0.5]] }] }] };
    expect(EditStateSchema.parse(big).removals![0].strokes[0].size).toBe(0.4);
  });

  it('drops a damaged removals list without losing the rest of the edit', () => {
    const bad = { ...valid, adjustments: { ...valid.adjustments, basic: { ...valid.adjustments.basic, exposure: 1.5 } }, removals: [{ id: 'r', visible: 'yes', strokes: 'x' }] };
    const { edit, repaired } = reviveEdit(bad);
    expect(repaired).toBe(false);
    expect(edit.removals).toBeUndefined();
    expect(edit.adjustments.basic.exposure).toBe(1.5);
  });

  it('rejects empty strokes inside a removal', () => {
    const empty = { ...valid, removals: [{ id: 'r', visible: true, strokes: [{ size: 0.05, points: [] }] }] };
    expect(EditStateSchema.parse(empty).removals).toBeUndefined();
  });
});
