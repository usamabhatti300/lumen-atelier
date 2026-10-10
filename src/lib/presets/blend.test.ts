import { describe, expect, it } from 'vitest';
import { defaultAdjustments, PartialAdjustmentsSchema, leafPaths, type PartialAdjustments } from '../schema/adjustments';
import { blendPreset, blendWheel } from './blend';
import { BUILTIN_PRESETS, PRESET_CATEGORIES } from './library';
import { deriveDevelopParams } from '../engine/params';
import { developPixel } from '../engine/pixel';
import { mergeAdjustments } from '../schema/adjustments';

const preset: PartialAdjustments = {
  basic: { exposure: 1, contrast: 40 },
  curves: { master: [[0, 0.1], [1, 0.9]] },
  grading: { shadows: { hue: 200, saturation: 40 } },
};

describe('preset blending', () => {
  it('amount 0 leaves the baseline untouched', () => {
    const base = defaultAdjustments();
    expect(blendPreset(base, preset, 0)).toEqual(base);
  });

  it('amount 100 equals the preset values', () => {
    const out = blendPreset(defaultAdjustments(), preset, 100);
    expect(out.basic.exposure).toBe(1);
    expect(out.basic.contrast).toBe(40);
    expect(out.curves.master[0][1]).toBeCloseTo(0.1, 6);
    expect(out.grading.shadows.saturation).toBeCloseTo(40, 6);
    expect(out.grading.shadows.hue).toBeCloseTo(200, 1);
  });

  it('amount 50 interpolates numeric values and curves', () => {
    const out = blendPreset(defaultAdjustments(), preset, 50);
    expect(out.basic.exposure).toBeCloseTo(0.5, 6);
    const p0 = out.curves.master.find(([x]) => x === 0)!;
    expect(p0[1]).toBeCloseTo(0.05, 6);
  });

  it('keeps fields the preset does not define', () => {
    const base = defaultAdjustments();
    base.basic.saturation = 33;
    expect(blendPreset(base, preset, 100).basic.saturation).toBe(33);
  });

  it('keeps manual overrides when the amount changes', () => {
    const base = defaultAdjustments();
    const current = blendPreset(base, preset, 100);
    current.basic.contrast = -20;
    const out = blendPreset(base, preset, 30, current, ['basic.contrast']);
    expect(out.basic.contrast).toBe(-20);
    expect(out.basic.exposure).toBeCloseTo(0.3, 6);
  });

  it('wheel blending takes the short way around the hue circle', () => {
    const w = blendWheel({ hue: 350, saturation: 50, luminance: 0 }, { hue: 10, saturation: 50, luminance: 0 }, 0.5);
    expect(w.hue < 1 || w.hue > 359).toBe(true);
  });
});

describe('built-in preset library', () => {
  it('has 70 presets, 10 per category, unique ids and names', () => {
    expect(BUILTIN_PRESETS).toHaveLength(70);
    for (const c of PRESET_CATEGORIES) expect(BUILTIN_PRESETS.filter((p) => p.category === c)).toHaveLength(10);
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(70);
    expect(new Set(BUILTIN_PRESETS.map((p) => p.name)).size).toBe(70);
  });

  it('every preset is schema-valid without clamping', () => {
    for (const p of BUILTIN_PRESETS) {
      const parsed = PartialAdjustmentsSchema.parse(p.adjustments);
      expect(JSON.parse(JSON.stringify(parsed))).toEqual(JSON.parse(JSON.stringify(p.adjustments)));
    }
  });

  it('presets render meaningfully different results on a test palette', () => {
    const palette: [number, number, number][] = [
      [0.1, 0.1, 0.12], [0.45, 0.45, 0.45], [0.85, 0.85, 0.82], [0.8, 0.6, 0.48],
      [0.25, 0.5, 0.2], [0.2, 0.35, 0.7], [0.75, 0.2, 0.15], [0.95, 0.8, 0.3],
    ];
    const renders = BUILTIN_PRESETS.map((p) => {
      const P = deriveDevelopParams(mergeAdjustments(defaultAdjustments(), p.adjustments));
      return palette.flatMap((c) => developPixel(c, P));
    });
    let minDist = Infinity;
    let pair = '';
    for (let i = 0; i < renders.length; i++) {
      for (let j = i + 1; j < renders.length; j++) {
        const d = Math.sqrt(renders[i].reduce((s, v, k) => s + (v - renders[j][k]) ** 2, 0) / renders[i].length);
        if (d < minDist) {
          minDist = d;
          pair = `${BUILTIN_PRESETS[i].name} / ${BUILTIN_PRESETS[j].name}`;
        }
      }
    }
    // RMS difference of at least ~1% per channel between the two most similar presets.
    expect(minDist, `closest pair: ${pair}`).toBeGreaterThan(0.01);
  });

  it('every preset changes the image', () => {
    for (const p of BUILTIN_PRESETS) expect(leafPaths(p.adjustments).length).toBeGreaterThan(5);
  });
});
