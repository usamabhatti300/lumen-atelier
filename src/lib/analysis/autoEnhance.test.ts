import { describe, expect, it } from 'vitest';
import { srgbToLinear } from '../color/srgb';
import { defaultAdjustments, type Adjustments } from '../schema/adjustments';
import { autoEnhance } from './autoEnhance';

/** Linear pixels with display lightness spread evenly over the ranges, and a colour multiplier. */
function scene(ranges: [lo: number, hi: number, share: number][], tint: [number, number, number] = [1, 1, 1], colour = 0.04, n = 2400): Float32Array {
  const out: number[] = [];
  for (const [lo, hi, share] of ranges) {
    const k = Math.round(n * share);
    for (let i = 0; i < k; i++) {
      const v = srgbToLinear(lo + ((hi - lo) * i) / Math.max(1, k - 1));
      const hue = (i % 7) / 7;
      out.push(v * tint[0] * (1 + colour * Math.sin(hue * 6.28)), v * tint[1], v * tint[2] * (1 + colour * Math.cos(hue * 6.28)));
    }
  }
  return Float32Array.from(out);
}

const apply = (a: Adjustments, patch: Record<string, number>): Adjustments => ({ ...a, basic: { ...a.basic, ...patch } });

describe('auto enhance', () => {
  it('brightens a dark photo and opens its shadows', () => {
    const out = autoEnhance(scene([[0.02, 0.3, 1]]), defaultAdjustments());
    expect(out.exposure).toBeGreaterThan(0.2);
    expect(out.highlights ?? 0).toBeLessThanOrEqual(0);
  });

  it('darkens a bright photo and pulls its highlights back', () => {
    const out = autoEnhance(scene([[0.6, 0.99, 1]]), defaultAdjustments());
    expect(out.exposure).toBeLessThan(-0.15);
    expect(out.highlights ?? 0).toBeLessThanOrEqual(0);
  });

  it('adds contrast and sets the black point on a flat, hazy photo', () => {
    const out = autoEnhance(scene([[0.3, 0.62, 1]]), defaultAdjustments());
    expect(out.contrast).toBeGreaterThan(5);
    expect(out.blacks).toBeLessThan(0);
  });

  it('removes part of a cast, never all of it', () => {
    const warm = autoEnhance(scene([[0.05, 0.95, 1]], [1.18, 1, 0.8]), defaultAdjustments());
    expect(warm.temperature).toBeLessThan(0);
    expect(warm.temperature).toBeGreaterThanOrEqual(-15);
    const cool = autoEnhance(scene([[0.05, 0.95, 1]], [0.85, 1, 1.2]), defaultAdjustments());
    expect(cool.temperature).toBeGreaterThan(0);
  });

  it('lifts dull colour, and leaves a black-and-white edit without colour changes', () => {
    const dull = scene([[0.05, 0.95, 1]], [1, 1, 1], 0.02);
    expect(autoEnhance(dull, defaultAdjustments()).vibrance).toBeGreaterThan(0);
    const mono = autoEnhance(scene([[0.05, 0.95, 1]], [1.18, 1, 0.8]), apply(defaultAdjustments(), { monochrome: 100 }));
    expect(mono.vibrance).toBeUndefined();
    expect(mono.temperature).toBeUndefined();
    expect(mono.tint).toBeUndefined();
  });

  it('settles: a second press changes nothing', () => {
    for (const lin of [scene([[0.02, 0.3, 1]]), scene([[0.6, 0.99, 1]]), scene([[0.3, 0.62, 1]]), scene([[0.05, 0.95, 1]], [1.18, 1, 0.8])]) {
      const first = autoEnhance(lin, defaultAdjustments());
      expect(Object.keys(first).length).toBeGreaterThan(0);
      expect(autoEnhance(lin, apply(defaultAdjustments(), first))).toEqual({});
    }
  });

  it('on top of a look it sets exposure and leaves the look’s contrast and colour alone', () => {
    const look = apply(defaultAdjustments(), { temperature: 12, contrast: 18, blacks: -8, vibrance: 20 });
    const out = autoEnhance(scene([[0.02, 0.3, 1]], [1.18, 1, 0.8], 0.02), look, false);
    expect(out.exposure).toBeGreaterThan(0.2);
    for (const k of ['temperature', 'tint', 'vibrance', 'contrast', 'blacks'] as const) expect(out[k], k).toBeUndefined();
    // Highlights only ever come down from the look's value, shadows only ever go up.
    const bright = autoEnhance(scene([[0.5, 1, 1]]), apply(defaultAdjustments(), { highlights: -20 }), false);
    expect(bright.highlights ?? -20).toBeLessThanOrEqual(-20);
  });

  it('stays inside the slider ranges and returns nothing for an empty sample', () => {
    expect(autoEnhance(new Float32Array(0), defaultAdjustments())).toEqual({});
    const out = autoEnhance(scene([[0.0, 0.05, 1]]), apply(defaultAdjustments(), { exposure: 4.6, shadows: 95 }));
    expect(out.exposure ?? 0).toBeLessThanOrEqual(5);
    expect(out.shadows ?? 0).toBeLessThanOrEqual(100);
  });
});
