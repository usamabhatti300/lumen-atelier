import { describe, expect, it } from 'vitest';
import { computeStats, kmeansPalette } from './stats';
import { mapReferenceToPreset, inverseWhiteBalance, describeStyle } from './mapping';
import { adaptToTarget, suggestRefinements } from './adapt';
import { whiteBalanceMultipliers } from '../color/whiteBalance';
import { linearSrgbToOklab } from '../color/oklab';
import { linearToSrgb, srgbToLinear } from '../color/srgb';
import { PartialAdjustmentsSchema, defaultAdjustments as defaultAdjustmentsForTest } from '../schema/adjustments';
import type { StyleInterpretation } from '@shared/ai-schema';

/** Synthetic image from a per-pixel function returning linear RGB. */
function synth(w: number, h: number, f: (u: number, v: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x / (w - 1), y / (h - 1));
      const i = (y * w + x) * 4;
      data[i] = Math.round(linearToSrgb(Math.min(1, Math.max(0, r))) * 255);
      data[i + 1] = Math.round(linearToSrgb(Math.min(1, Math.max(0, g))) * 255);
      data[i + 2] = Math.round(linearToSrgb(Math.min(1, Math.max(0, b))) * 255);
      data[i + 3] = 255;
    }
  return { width: w, height: h, data };
}

/** A neutral grey ramp (no cast) with some coloured patches. */
const neutralScene = (u: number, v: number): [number, number, number] => {
  const y = Math.pow(u, 2.2);
  if (v > 0.8) return u < 0.33 ? [0.35, 0.08, 0.05] : u < 0.66 ? [0.08, 0.3, 0.06] : [0.05, 0.1, 0.4];
  return [y, y, y];
};

/** Teal shadows, orange highlights, lifted blacks. */
const tealOrangeScene = (u: number, v: number): [number, number, number] => {
  const y = 0.02 + Math.pow(u, 2.2) * 0.9;
  const shadowW = Math.max(0, 1 - u * 2);
  const highW = Math.max(0, u * 2 - 1);
  let r = y * (1 - 0.35 * shadowW + 0.25 * highW);
  let g = y * (1 + 0.05 * shadowW + 0.02 * highW);
  const b = y * (1 + 0.3 * shadowW - 0.3 * highW);
  if (v > 0.85) {
    r *= 1.1;
    g *= 0.95;
  }
  return [r, g, b];
};

describe('reference statistics', () => {
  it('measures a neutral ramp as neutral', () => {
    const s = computeStats(synth(200, 120, neutralScene));
    expect(Math.hypot(s.cast.a, s.cast.b)).toBeLessThan(0.004);
    expect(s.monochrome).toBe(false);
    expect(s.zones.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('detects a monochrome image', () => {
    const s = computeStats(synth(120, 80, (u) => [u, u, u]));
    expect(s.monochrome).toBe(true);
  });

  it('detects teal shadows and warm highlights', () => {
    const s = computeStats(synth(240, 160, tealOrangeScene));
    expect(s.shadows.b).toBeLessThan(s.highlights.b);
    expect(s.blackFloor).toBeGreaterThan(0.08);
  });

  it('finds a two-colour palette', () => {
    const img = synth(100, 100, (u) => (u < 0.5 ? [0.6, 0.05, 0.05] : [0.05, 0.1, 0.6]));
    const s = computeStats(img);
    expect(s.palette.length).toBeGreaterThanOrEqual(2);
    expect(s.palette[0].weight + s.palette[1].weight).toBeGreaterThan(0.9);
    expect(kmeansPalette([], 4)).toEqual([]);
  });

  it('suggests trimming uniform UI bars', () => {
    const img = synth(120, 260, (u, v) => (v < 0.12 || v > 0.86 ? [0.95, 0.95, 0.95] : [u * 0.6, 0.3, 0.5 * v]));
    const s = computeStats(img);
    expect(s.suggestedCrop).not.toBeNull();
    expect(s.suggestedCrop!.y).toBeGreaterThan(0.08);
    expect(s.flags.screenshotLikely).toBe(true);
  });
});

describe('preset mapping', () => {
  it('inverse white balance recovers known settings', () => {
    for (const [t, g] of [[30, 0], [-40, 10], [0, -20]]) {
      const [r, gg, b] = whiteBalanceMultipliers(t, g);
      const [, a, bb] = linearSrgbToOklab(0.18 * r, 0.18 * gg, 0.18 * b);
      const inv = inverseWhiteBalance(a, bb);
      expect(Math.abs(inv.temperature - t)).toBeLessThanOrEqual(2);
      expect(Math.abs(inv.tint - g)).toBeLessThanOrEqual(2);
    }
  });

  it('maps a neutral reference to a near-empty preset', () => {
    const r = mapReferenceToPreset(computeStats(synth(200, 120, neutralScene)), null);
    expect(r.adjustments.grading).toBeUndefined();
    expect(r.adjustments.basic?.monochrome).toBeUndefined();
    expect(r.descriptionSource).toBe('measured');
  });

  it('maps teal/orange into cool shadow and warm highlight grading with lifted blacks', () => {
    const r = mapReferenceToPreset(computeStats(synth(240, 160, tealOrangeScene)), null);
    const sh = r.adjustments.grading?.shadows;
    const hi = r.adjustments.grading?.highlights;
    expect(sh?.saturation ?? 0).toBeGreaterThan(5);
    // Teal/blue hues sit roughly between 160 and 280 degrees in OKLCh.
    expect(sh!.hue!).toBeGreaterThan(150);
    expect(sh!.hue!).toBeLessThan(290);
    expect(hi?.hue ?? 0).toBeLessThan(110);
    expect(r.adjustments.curves?.master?.[0][1]).toBeGreaterThan(0.02);
    expect(PartialAdjustmentsSchema.safeParse(r.adjustments).success).toBe(true);
    expect(r.explanations.length).toBeGreaterThan(1);
  });

  it('maps monochrome references to black and white', () => {
    const r = mapReferenceToPreset(computeStats(synth(120, 80, (u) => [u, u, u])), null);
    expect(r.adjustments.basic?.monochrome).toBe(100);
  });

  it('uses the AI description and lowers confidence on screenshots', () => {
    const ai: StyleInterpretation = {
      styleSummary: 'Muted cinematic editorial with cool shadows.',
      moodTags: ['cinematic'],
      sceneType: 'portrait',
      contentWarnings: ['screenshot_ui'],
      tone: { contrast: 'medium', blacks: 'lifted', highlights: 'controlled', exposureIntent: 'balanced' },
      color: {
        temperatureFeel: 'cool',
        saturationFeel: 'muted',
        shadowTint: { hue: 'teal', strength: 'moderate' },
        midtoneTint: { hue: 'none', strength: 'none' },
        highlightTint: { hue: 'amber', strength: 'subtle' },
        greens: 'subdued',
        blues: 'natural',
        skin: 'natural',
      },
      texture: { grain: 'uncertain', vignette: 'none', softness: 'natural' },
      confidence: 'high',
      notes: [],
    };
    const r = mapReferenceToPreset(computeStats(synth(240, 160, tealOrangeScene)), ai);
    expect(r.description).toBe(ai.styleSummary);
    expect(r.confidence).toBe('low');
    expect(r.warnings.join(' ')).toMatch(/screenshot/);
    // The model never sets grain when it is uncertain.
    expect(r.adjustments.effects?.grain).toBeUndefined();
  });

  it('describes style from measurements without AI', () => {
    const d = describeStyle(computeStats(synth(240, 160, tealOrangeScene)));
    expect(d).toMatch(/look|image/);
    expect(d.endsWith('.')).toBe(true);
  });
});

describe('target adaptation', () => {
  it('proposes exposure toward the reference only when asked', () => {
    const bright = computeStats(synth(100, 60, (u) => [0.3 + u * 0.6, 0.3 + u * 0.6, 0.3 + u * 0.6]));
    const dark = computeStats(synth(100, 60, (u) => [u * 0.08, u * 0.08, u * 0.08]));
    expect(adaptToTarget(bright, dark, { matchBrightness: false, neutralizeCast: false }).extras.exposure).toBe(0);
    const a = adaptToTarget(bright, dark, { matchBrightness: true, neutralizeCast: false });
    expect(a.extras.exposure).toBeGreaterThan(0.5);
    expect(a.mismatch.length).toBeGreaterThan(0);
  });

  it('neutralizes a warm target cast with a cooling white balance', () => {
    const neutral = computeStats(synth(100, 60, neutralScene));
    const warm = computeStats(synth(100, 60, (u) => {
      const y = Math.pow(u, 2.2);
      return [y * 1.25, y, y * 0.7];
    }));
    const a = adaptToTarget(neutral, warm, { matchBrightness: false, neutralizeCast: true });
    expect(a.extras.temperature).toBeLessThan(0);
  });

  it('suggests capped refinements when the result differs from the reference', () => {
    const ref = computeStats(synth(100, 60, (u) => {
      const y = srgbToLinear(0.2 + u * 0.7);
      return [y, y, y];
    }));
    const res = computeStats(synth(100, 60, (u) => {
      const y = srgbToLinear(0.1 + u * 0.55);
      return [y, y, y];
    }));
    const s = suggestRefinements(ref, res);
    expect(s.map((x) => x.id)).toContain('exposure');
    // Every suggestion stays within its cap.
    const out = s.find((x) => x.id === 'exposure')!.apply(defaultAdjustmentsForTest());
    expect(Math.abs(out.basic.exposure)).toBeLessThanOrEqual(1);
  });

  it('does not push exposure when the gap is a scene difference (> 2 stops)', () => {
    const ref = computeStats(synth(100, 60, (u) => {
      const y = srgbToLinear(0.02 + u * 0.08);
      return [y, y, y];
    }));
    const res = computeStats(synth(100, 60, (u) => {
      const y = srgbToLinear(0.5 + u * 0.45);
      return [y, y, y];
    }));
    expect(suggestRefinements(ref, res).map((x) => x.id)).not.toContain('exposure');
  });
});
