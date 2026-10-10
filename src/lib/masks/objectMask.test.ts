import { describe, expect, it } from 'vitest';
import { EditStateSchema, MaskComponentSchema, OBJECT_MAX_POINTS, defaultEditState, defaultLocalAdjustments } from '../schema/adjustments';
import {
  applyPoint,
  coverageFraction,
  coverageToRgba,
  fillBorderGaps,
  logitsToCoverage,
  newObjectComponent,
  objectMaskKey,
  objectMaskSize,
  pointActionFor,
  refineObjectMask,
  removeNearestPoint,
  resampleMask,
} from './objectMask';

describe('object mask component schema', () => {
  const comp = newObjectComponent('c_1', [
    { x: 0.5, y: 0.2, include: true },
    { x: 0.1, y: 0.9, include: false },
  ]);

  it('round-trips through the edit-state schema without a version change', () => {
    const e = defaultEditState();
    const layer = { id: 'l1', name: 'Sky', visible: true, opacity: 100, invert: false, components: [comp], adjustments: { ...defaultLocalAdjustments(), exposure: -1 } };
    const parsed = EditStateSchema.parse(JSON.parse(JSON.stringify({ ...e, layers: [layer] })));
    expect(parsed.layers[0].components[0]).toEqual(comp);
    expect(parsed.version).toBe(1);
  });

  it('rejects malformed selections', () => {
    expect(MaskComponentSchema.safeParse({ ...comp, points: [] }).success).toBe(false);
    expect(MaskComponentSchema.safeParse({ ...comp, points: [{ x: 1.5, y: 0, include: true }] }).success).toBe(false);
    expect(MaskComponentSchema.safeParse({ ...comp, points: [{ x: 0.5, y: 0.5 }] }).success).toBe(false);
    const many = Array.from({ length: OBJECT_MAX_POINTS + 1 }, () => ({ x: 0.5, y: 0.5, include: true }));
    expect(MaskComponentSchema.safeParse({ ...comp, points: many }).success).toBe(false);
    expect(MaskComponentSchema.safeParse({ ...comp, mode: 'xor' }).success).toBe(false);
  });

  it('keeps older edits (without object components) valid', () => {
    expect(EditStateSchema.safeParse(JSON.parse(JSON.stringify(defaultEditState()))).success).toBe(true);
  });
});

describe('click handling', () => {
  const p = (x: number, y: number, include = true) => ({ x, y, include });

  it('maps modifiers to actions', () => {
    expect(pointActionFor({ shiftKey: false, altKey: false })).toBe('replace');
    expect(pointActionFor({ shiftKey: true, altKey: false })).toBe('include');
    expect(pointActionFor({ shiftKey: false, altKey: true })).toBe('exclude');
    expect(pointActionFor({ shiftKey: true, altKey: true })).toBe('exclude');
  });

  it('plain click replaces, shift adds, alt subtracts', () => {
    const start = [p(0.1, 0.1), p(0.2, 0.2, false)];
    expect(applyPoint(start, 0.5, 0.5, 'replace')).toEqual([p(0.5, 0.5)]);
    expect(applyPoint(start, 0.5, 0.5, 'include')).toEqual([...start, p(0.5, 0.5)]);
    expect(applyPoint(start, 0.5, 0.5, 'exclude')).toEqual([...start, p(0.5, 0.5, false)]);
  });

  it('clamps to the image and caps the number of points', () => {
    expect(applyPoint([], 1.4, -0.2, 'replace')).toEqual([p(1, 0)]);
    let pts = [p(0.5, 0.5)];
    for (let i = 0; i < OBJECT_MAX_POINTS + 5; i++) pts = applyPoint(pts, i / 100, 0.3, 'include')!;
    expect(pts).toHaveLength(OBJECT_MAX_POINTS);
  });

  it('never leaves a selection without a positive point', () => {
    expect(applyPoint([], 0.5, 0.5, 'exclude')).toBeNull();
    expect(removeNearestPoint([p(0.5, 0.5), p(0.6, 0.6, false)], 0.5, 0.5, 0.05)).toBeNull();
    expect(removeNearestPoint([p(0.5, 0.5), p(0.6, 0.6, false)], 0.6, 0.61, 0.05)).toEqual([p(0.5, 0.5)]);
    expect(removeNearestPoint([p(0.5, 0.5)], 0.9, 0.9, 0.05)).toBeNull();
  });

  it('cache keys depend on the photo and the exact points only', () => {
    const a = objectMaskKey('ph1', [p(0.5, 0.25)]);
    expect(objectMaskKey('ph1', [p(0.5, 0.25)])).toBe(a);
    expect(objectMaskKey('ph2', [p(0.5, 0.25)])).not.toBe(a);
    expect(objectMaskKey('ph1', [p(0.5, 0.25, false)])).not.toBe(a);
    expect(objectMaskKey('ph1', [p(0.5, 0.25), p(0.1, 0.1)])).not.toBe(a);
  });
});

describe('rasterization', () => {
  it('sizes the cached raster to the photo aspect, capped at the long edge', () => {
    expect(objectMaskSize({ width: 3840, height: 2400 })).toEqual({ width: 2048, height: 1280 });
    expect(objectMaskSize({ width: 600, height: 900 })).toEqual({ width: 600, height: 900 });
  });

  it('maps logits to anti-aliased coverage around the decision boundary', () => {
    const c = logitsToCoverage(Float32Array.from([-10, -1, 0, 1, 10]));
    expect([...c]).toEqual([0, 0, 0.5, 1, 1]);
  });

  it('fills the gap SAM leaves at the image border only where the mask continues', () => {
    const w = 10;
    const h = 10;
    const cov = new Float32Array(w * h);
    // Selected rows 2..4 across the width (the "sky"), unselected border rows 0..1.
    for (let y = 2; y < 5; y++) for (let x = 0; x < w; x++) cov[y * w + x] = 1;
    fillBorderGaps(cov, w, h, 2);
    expect(cov[0]).toBe(1);
    expect(cov[1 * w + 5]).toBe(1);
    expect(cov[9 * w + 5]).toBe(0); // bottom border: nothing selected inside, stays empty
  });

  it('refines logits into 8-bit coverage', () => {
    const w = 40;
    const h = 40;
    const logits = new Float32Array(w * h).fill(-20);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) logits[y * w + x] = 20;
    const m = refineObjectMask(logits, w, h);
    expect(m[15 * w + 15]).toBe(255);
    expect(m[0]).toBe(0);
    expect(coverageFraction({ width: w, height: h, data: m })).toBeCloseTo(400 / 1600);
  });

  it('upsamples bilinearly with exact interiors and a smooth edge', () => {
    const src = { width: 4, height: 1, data: Uint8Array.from([0, 0, 255, 255]) };
    const up = resampleMask(src, 16, 4);
    expect(up[0]).toBe(0);
    expect(up[15]).toBe(255);
    const row = [...up.slice(0, 16)];
    for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThanOrEqual(row[i - 1]);
    expect(row.some((v) => v > 0 && v < 255)).toBe(true);
    expect([...up.slice(16, 32)]).toEqual(row); // rows identical for a 1-row source
  });

  it('identity resample returns the same data', () => {
    const src = { width: 3, height: 2, data: Uint8Array.from([0, 50, 100, 150, 200, 250]) };
    expect([...resampleMask(src, 3, 2)]).toEqual([...src.data]);
  });

  it('encodes coverage as white RGBA with alpha = coverage', () => {
    expect([...coverageToRgba(Uint8Array.from([0, 128]))]).toEqual([255, 255, 255, 0, 255, 255, 255, 128]);
  });
});
