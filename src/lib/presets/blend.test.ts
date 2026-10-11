import { describe, expect, it } from 'vitest';
import { defaultAdjustments, defaultEditState, PartialAdjustmentsSchema, leafPaths, type Adjustments, type PartialAdjustments } from '../schema/adjustments';
import { cpuRender } from '../engine/cpu/cpuRender';
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
  it('has 111 presets: 41 in the Signature Collection, 10 per other category, unique ids and names', () => {
    expect(BUILTIN_PRESETS).toHaveLength(111);
    expect(PRESET_CATEGORIES[0]).toBe('signature');
    expect(BUILTIN_PRESETS.filter((p) => p.category === 'signature')).toHaveLength(41);
    for (const c of PRESET_CATEGORIES.filter((c) => c !== 'signature')) {
      expect(BUILTIN_PRESETS.filter((p) => p.category === c)).toHaveLength(10);
    }
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(111);
    expect(new Set(BUILTIN_PRESETS.map((p) => p.name)).size).toBe(111);
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

  it('Signature Collection presets do not clip a bright sky more than the untouched render', () => {
    // Pale hazy sky (blue at the top to near-white at the horizon), a sun disc with a glow, and sand.
    const W = 120;
    const H = 90;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = y / (H - 1);
        let rgb = [150 + 105 * t, 190 + 65 * t, 235 + 20 * t];
        const d = Math.hypot(x - 82, y - 30);
        if (d < 23) rgb = rgb.map((v) => v + (255 - v) * Math.min(1, (23 - d) / 12));
        if (y > H * 0.7) rgb = [225, 205, 170];
        data.set([...rgb, 255], (y * W + x) * 4);
      }
    }
    const source = { data, width: W, height: H, colorSpace: 'srgb' } as ImageData;
    const whiteFraction = (adjustments: Adjustments) => {
      const out = cpuRender({ source, fullSize: { width: W, height: H }, edit: { ...defaultEditState(), adjustments }, out: { width: W, height: H } });
      let n = 0;
      for (let i = 0; i < out.data.length; i += 4) if (out.data[i] === 255 && out.data[i + 1] === 255 && out.data[i + 2] === 255) n++;
      return n / (W * H);
    };
    const untouched = whiteFraction(defaultAdjustments());
    expect(untouched).toBeGreaterThan(0.01); // the fixture really has clipped highlights to protect
    for (const p of BUILTIN_PRESETS.filter((p) => p.category === 'signature')) {
      expect(whiteFraction(blendPreset(defaultAdjustments(), p.adjustments, 100)), p.name).toBeLessThanOrEqual(untouched);
    }
  }, 60_000);
});
