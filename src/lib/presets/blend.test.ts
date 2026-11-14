import { describe, expect, it } from 'vitest';
import { defaultAdjustments, defaultEditState, AdjustmentsSchema, PartialAdjustmentsSchema, leafPaths, type Adjustments, type PartialAdjustments } from '../schema/adjustments';
import { cpuRender } from '../engine/cpu/cpuRender';
import { blendPreset, blendWheel } from './blend';
import { BUILTIN_PRESETS, CATEGORY_LABELS, LOOK_ALIASES, PRESET_CATEGORIES, migrateLookIds } from './library';
import { TRAITS } from './recommend';
import { ROLLS } from './rolls';
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

describe('built-in look library', () => {
  const ids = new Set(BUILTIN_PRESETS.map((p) => p.id));
  const palette: [number, number, number][] = [
    [0.1, 0.1, 0.12], [0.45, 0.45, 0.45], [0.85, 0.85, 0.82], [0.8, 0.6, 0.48],
    [0.25, 0.5, 0.2], [0.2, 0.35, 0.7], [0.75, 0.2, 0.15], [0.95, 0.8, 0.3],
  ];
  const onPalette = (adjustments: Adjustments) => {
    const P = deriveDevelopParams(adjustments);
    return palette.flatMap((c) => developPixel(c, P));
  };
  const rms = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0) / a.length);

  it('is a curated set: 54 looks in 12 rolls, with unique ids and names', () => {
    expect(BUILTIN_PRESETS).toHaveLength(54);
    expect(PRESET_CATEGORIES).toHaveLength(12);
    expect(PRESET_CATEGORIES[0]).toBe('signature');
    for (const c of PRESET_CATEGORIES) {
      const n = BUILTIN_PRESETS.filter((p) => p.category === c).length;
      expect(n, c).toBeGreaterThanOrEqual(3);
      expect(n, c).toBeLessThanOrEqual(6);
      expect(ROLLS[c].no, c).toMatch(/^(0[1-9]|1[0-2])$/);
    }
    expect(new Set(PRESET_CATEGORIES.map((c) => ROLLS[c].no)).size).toBe(12);
    expect(ids.size).toBe(BUILTIN_PRESETS.length);
    expect(new Set(BUILTIN_PRESETS.map((p) => p.name.toLowerCase())).size).toBe(BUILTIN_PRESETS.length);
  });

  it('looks are listed roll by roll, and each roll has its cover look', () => {
    const order = BUILTIN_PRESETS.map((p) => PRESET_CATEGORIES.indexOf(p.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const c of PRESET_CATEGORIES) {
      const cover = ROLLS[c].cover;
      if (cover) expect(BUILTIN_PRESETS.some((p) => p.category === c && p.name === cover), cover).toBe(true);
    }
  });

  it('every look has a label, a description, 2-5 tags and the photos it suits', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(CATEGORY_LABELS[p.category], p.name).toBeTruthy();
      expect(p.description.length, p.name).toBeGreaterThan(20);
      expect(p.description.length, p.name).toBeLessThanOrEqual(400);
      expect(p.tags.length, p.name).toBeGreaterThanOrEqual(2);
      expect(p.tags.length, p.name).toBeLessThanOrEqual(5);
      expect(p.suits.length, p.name).toBeGreaterThanOrEqual(2);
      for (const t of p.suits) expect(TRAITS, p.name).toContain(t);
      expect(p.name, p.name).not.toMatch(/inspired/i);
    }
  });

  it('every look at amount 0 leaves the photo untouched', () => {
    const base = defaultAdjustments();
    for (const p of BUILTIN_PRESETS) expect(blendPreset(base, p.adjustments, 0), p.name).toEqual(base);
  });

  it('every look is schema-valid without clamping', () => {
    for (const p of BUILTIN_PRESETS) {
      const parsed = PartialAdjustmentsSchema.parse(p.adjustments);
      expect(JSON.parse(JSON.stringify(parsed))).toEqual(JSON.parse(JSON.stringify(p.adjustments)));
    }
  });

  it('follows the house rules that keep highlights, shadows and corners safe', () => {
    for (const p of BUILTIN_PRESETS) {
      const a = p.adjustments;
      expect(a.basic?.whites ?? 0, `${p.name}: whites`).toBeLessThanOrEqual(4);
      expect(a.basic?.exposure ?? 0, `${p.name}: exposure`).toBeLessThanOrEqual(0.25);
      expect(a.basic?.blacks ?? 0, `${p.name}: blacks`).toBeGreaterThanOrEqual(-15);
      expect(a.effects?.vignette ?? 0, `${p.name}: vignette`).toBeGreaterThanOrEqual(-22);
      expect(a.detail, `${p.name}: looks never set detail`).toBeUndefined();
    }
  });

  it('every look changes a photo visibly', () => {
    const untouched = onPalette(defaultAdjustments());
    for (const p of BUILTIN_PRESETS) {
      expect(leafPaths(p.adjustments).length, p.name).toBeGreaterThan(5);
      // At least ~2% RMS per channel away from the untouched render (the old library had looks at 0.4%).
      expect(rms(onPalette(mergeAdjustments(defaultAdjustments(), p.adjustments)), untouched), p.name).toBeGreaterThan(0.02);
    }
  });

  it('no two looks render alike on a test palette', () => {
    const renders = BUILTIN_PRESETS.map((p) => onPalette(mergeAdjustments(defaultAdjustments(), p.adjustments)));
    let minDist = Infinity;
    let pair = '';
    for (let i = 0; i < renders.length; i++) {
      for (let j = i + 1; j < renders.length; j++) {
        const d = rms(renders[i], renders[j]);
        if (d < minDist) {
          minDist = d;
          pair = `${BUILTIN_PRESETS[i].name} / ${BUILTIN_PRESETS[j].name}`;
        }
      }
    }
    expect(minDist, `closest pair: ${pair}`).toBeGreaterThan(0.015);
  });

  it('no look clips a bright sky more than the untouched render', () => {
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
    for (const p of BUILTIN_PRESETS) {
      expect(whiteFraction(blendPreset(defaultAdjustments(), p.adjustments, 100)), p.name).toBeLessThanOrEqual(untouched);
    }
  }, 120_000);

  it('a look can be pushed to 150%: values carry on past the look, inside their ranges', () => {
    const base = defaultAdjustments();
    const look = { basic: { contrast: 20, saturation: -80, highlights: -90 }, curves: { master: [[0, 0.1], [1, 0.9]] as [number, number][] }, grading: { shadows: { hue: 200, saturation: 80 } } };
    const full = blendPreset(base, look, 100);
    const pushed = blendPreset(base, look, 150);
    expect(full.basic.contrast).toBe(20);
    expect(pushed.basic.contrast).toBe(30);
    // Clamped to the control's range rather than running past it.
    expect(pushed.basic.saturation).toBe(-100);
    expect(pushed.basic.highlights).toBe(-100);
    expect(pushed.grading.shadows.saturation).toBe(100);
    expect(pushed.grading.shadows.hue).toBeCloseTo(200, 0);
    // The fade deepens, and the curve stays inside 0..1.
    expect(pushed.curves.master[0][1]).toBeCloseTo(0.15, 2);
    for (const [x, y] of pushed.curves.master) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
    // Amounts past the limit are held at it, and every built-in survives it schema-valid.
    expect(blendPreset(base, look, 400)).toEqual(pushed);
    for (const p of BUILTIN_PRESETS) expect(() => AdjustmentsSchema.parse(blendPreset(base, p.adjustments, 150)), p.name).not.toThrow();
  });

  it('old look ids carry over to their replacement, and unknown ones are dropped', () => {
    for (const [from, to] of Object.entries(LOOK_ALIASES)) {
      expect(ids.has(from), from).toBe(false);
      expect(ids.has(to), `${from} -> ${to}`).toBe(true);
    }
    const known = new Set([...ids, 'u_mine']);
    expect(
      migrateLookIds(['builtin:golden-portrait-negative', 'builtin:velvet-slide', 'builtin:creator-clean-pop', 'u_mine', 'builtin:warm-grain', 'u_gone'], known),
    ).toEqual(['builtin:sunday-negative', 'builtin:velvet-slide', 'u_mine']);
  });
});
