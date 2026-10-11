import { describe, expect, it } from 'vitest';
import { MatchFeaturesSchema, LUM_QUANTILES } from '../schema/matchFeatures';
import { PresetSchema } from '../schema/preset';
import {
  PartialAdjustmentsSchema,
  defaultAdjustments,
  mergeAdjustments,
} from '../schema/adjustments';
import { toneShape } from '../engine/pixel';
import {
  EVAL_LOOKS,
  forestScene,
  jungleScene,
  portraitScene,
  streetScene,
  synth,
} from './evalScenes';
import { featuresFromImage } from './features';
import { MATCH, fitToneSliders, matchToTarget, planBands, targetModel, toneGoals } from './match';
import { computeStats, evaluateRender, newMethod, oldMethod, renderImage } from './matchEval';

const W = 200;
const H = 140;
const jungle = synth(W, H, jungleScene);
const forestRef = renderImage(synth(W, H, forestScene), EVAL_LOOKS['muted teal forest']);
const forestStats = computeStats(forestRef);

describe('match features', () => {
  it('are compact and pass the preset schema', () => {
    const f = featuresFromImage(jungle);
    expect(MatchFeaturesSchema.safeParse(f).success).toBe(true);
    expect(f.lum).toHaveLength(LUM_QUANTILES.length);
    expect(f.hues.reduce((s, b) => s + b.w, 0)).toBeCloseTo(1, 5);
    expect(JSON.stringify(f).length).toBeLessThan(4000);
  });

  it('are stored in reference presets (optional, validated)', () => {
    const base = {
      id: 'p',
      name: 'Ref',
      category: 'reference',
      origin: 'reference',
      adjustments: {},
      createdAt: 1,
      updatedAt: 1,
    };
    const reference = {
      styleSummary: 's',
      palette: [],
      confidence: 'medium',
      notes: [],
      aiInterpretation: false,
    };
    expect(PresetSchema.safeParse({ ...base, reference }).success).toBe(true);
    expect(
      PresetSchema.safeParse({
        ...base,
        reference: { ...reference, features: forestStats.features },
      }).success,
    ).toBe(true);
    const broken = { ...forestStats.features, lum: [0.1, 0.2] };
    expect(
      PresetSchema.safeParse({ ...base, reference: { ...reference, features: broken } }).success,
    ).toBe(false);
  });
});

describe('relative tone transfer', () => {
  it('keeps the target when reference and target match', () => {
    const f = featuresFromImage(jungle);
    const g = toneGoals(f, f, MATCH.keepExposure);
    g.lum.forEach((v, i) => expect(v).toBeCloseTo(f.lum[i], 2));
    const tone = fitToneSliders(f.lum, f.lum);
    for (const v of Object.values(tone)) expect(Math.abs(v)).toBeLessThan(0.02);
  });

  it('keeps part of the scene exposure and caps large moves', () => {
    const dark = featuresFromImage(
      synth(W, H, (u) => [0.02 + 0.05 * u, 0.02 + 0.05 * u, 0.02 + 0.05 * u]),
    );
    const bright = featuresFromImage(
      synth(W, H, (u) => [0.5 + 0.4 * u, 0.5 + 0.4 * u, 0.5 + 0.4 * u]),
    );
    const i50 = LUM_QUANTILES.indexOf(0.5);
    const g = toneGoals(bright, dark, MATCH.keepExposure);
    expect(g.capped).toBe(true);
    expect(g.lum[i50] - dark.lum[i50]).toBeLessThanOrEqual(MATCH.maxMedianShift + 1e-6);
    const full = toneGoals(
      featuresFromImage(jungle),
      featuresFromImage(synth(W, H, streetScene)),
      0,
    );
    const half = toneGoals(
      featuresFromImage(jungle),
      featuresFromImage(synth(W, H, streetScene)),
      0.5,
    );
    expect(Math.abs(full.lum[i50] - featuresFromImage(jungle).lum[i50])).toBeLessThan(
      Math.abs(half.lum[i50] - featuresFromImage(jungle).lum[i50]) + 1e-6,
    );
  });

  it('fits hue-preserving tone sliders to a darker, softer target', () => {
    const from = [0.02, 0.06, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.95, 0.99];
    const to = from.map((p) => 0.1 + p * 0.7);
    const tone = fitToneSliders(from, to);
    expect(tone.contrast).toBeLessThan(0);
    expect(tone.blacks).toBeLessThanOrEqual(0); // fades come from the curve's black point
    const err = from.reduce((s, p, i) => s + Math.abs(toneShape(p, tone) - to[i]), 0) / from.length;
    expect(err).toBeLessThan(0.05);
  });
});

describe('band planning and protection', () => {
  it('follows the reference for greens and protects browns the reference lacks', () => {
    const plans = planBands(forestStats.features, targetModel(jungle));
    const green = plans.find((p) => p.band === 'green')!;
    const orange = plans.find((p) => p.band === 'orange')!;
    expect(green.protected).toBe(false);
    expect(green.goalH).toBeGreaterThan(green.hT + 15); // toward teal
    expect(green.goalC).toBeLessThan(green.CT * 0.5); // muted
    expect(orange.protected).toBe(true);
    expect(orange.goalH).toBeCloseTo(orange.hT, 5);
  });
});

describe('closed-loop matching', () => {
  it('reproduces the reported case: vivid foliage + brown leaves to a muted teal forest', () => {
    const t = targetModel(jungle);
    const progress: number[] = [];
    const generic = {};
    const r = matchToTarget(forestStats.features, t, generic, {
      onProgress: (i) => progress.push(i),
    });
    expect(PartialAdjustmentsSchema.safeParse(r.adjustments).success).toBe(true);
    expect(r.error.final).toBeLessThanOrEqual(r.error.initial);
    expect(progress).toEqual(progress.map((_, i) => i + 1)); // honest pass count, increasing
    expect(r.iterations).toBeLessThanOrEqual(MATCH.iterations);

    const m = evaluateRender(
      forestStats.features,
      t,
      mergeAdjustments(defaultAdjustments(), r.adjustments),
    ).metrics;
    expect(m.chroma).toBeLessThan(0.4); // muted like the reference (|log2| ratio)
    expect(m.zone).toBeLessThan(20);
    // Browns keep their hue: no pink/mauve leaves.
    expect(m.protectedBands).toBeGreaterThan(0);
    expect(m.driftMax).toBeLessThan(8);
    // Greens end up near the reference's grey-teal hue.
    const plans = planBands(forestStats.features, t);
    const green = plans.find((p) => p.band === 'green')!;
    expect(
      Math.abs(
        green.goalH - forestStats.features.hues.reduce((best, b) => (b.w > best.w ? b : best)).h,
      ),
    ).toBeLessThan(25);
    expect(r.notes.join(' ')).toMatch(/oranges and browns/);
  });

  it('beats the old method on the reported case', () => {
    const t = targetModel(jungle);
    const old = evaluateRender(
      forestStats.features,
      t,
      oldMethod(forestStats, computeStats(jungle)),
    ).metrics;
    const neu = evaluateRender(
      forestStats.features,
      t,
      newMethod(forestStats, t).adjustments,
    ).metrics;
    expect(neu.chroma).toBeLessThan(old.chroma * 0.5);
    expect(neu.bandHue).toBeLessThan(old.bandHue);
    expect(neu.drift).toBeLessThan(old.drift);
  });

  it('is close to neutral when a photo is matched to itself', () => {
    const r = matchToTarget(featuresFromImage(jungle), targetModel(jungle), {});
    const b = r.adjustments.basic!;
    expect(Math.abs(b.saturation ?? 0)).toBeLessThanOrEqual(5);
    expect(Math.abs(b.temperature ?? 0)).toBeLessThanOrEqual(3);
    expect(Math.abs(b.contrast ?? 0)).toBeLessThanOrEqual(8);
    expect(r.error.final).toBeLessThan(3);
  });

  it('converts to monochrome for a black-and-white reference and matches tones', () => {
    const bw = renderImage(synth(W, H, forestScene), EVAL_LOOKS['black and white']);
    const r = matchToTarget(featuresFromImage(bw), targetModel(synth(W, H, portraitScene)), {});
    expect(r.adjustments.basic?.monochrome).toBe(100);
    expect(r.explanations.some((e) => /black and white/.test(e.text))).toBe(true);
  });

  it("keeps the generic look's texture settings and degrades gracefully on extreme mismatches", () => {
    const night = synth(W, H, (u, v) =>
      Math.hypot(u - 0.5, v - 0.5) < 0.1 ? [0.9, 0.2, 0.6] : [0.004, 0.003, 0.01],
    );
    const r = matchToTarget(featuresFromImage(night), targetModel(synth(W, H, streetScene)), {
      effects: { grain: 20 },
    });
    expect(r.adjustments.effects?.grain).toBe(20);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('is fast enough for the UI', () => {
    const big = synth(360, 240, jungleScene);
    const t0 = performance.now();
    matchToTarget(forestStats.features, big, {});
    // Generous bound for slow CI machines; typically ~0.3 s.
    expect(performance.now() - t0).toBeLessThan(4000);
  });
});

describe('evaluation thresholds (generated scenes, old vs new)', () => {
  it('the new method has lower match error without protected-colour drift', () => {
    const sources = {
      forest: synth(W, H, forestScene),
      street: synth(W, H, streetScene),
      portrait: synth(W, H, portraitScene),
    };
    const pairs: [
      string,
      keyof typeof sources,
      (u: number, v: number) => [number, number, number],
    ][] = [
      ['muted teal forest', 'forest', jungleScene],
      ['warm golden hour', 'street', jungleScene],
      ['faded matte film', 'street', portraitScene],
      ['orange-teal', 'forest', streetScene],
      ['desaturated pastel', 'portrait', streetScene],
      ['high-contrast cool', 'portrait', jungleScene],
    ];
    const sum = {
      old: { lum: 0, chroma: 0, band: 0, drift: 0 },
      neu: { lum: 0, chroma: 0, band: 0, drift: 0 },
    };
    for (const [look, src, scene] of pairs) {
      const refStats = computeStats(renderImage(sources[src], EVAL_LOOKS[look]));
      const img = synth(W, H, scene);
      const t = targetModel(img);
      const o = evaluateRender(
        refStats.features,
        t,
        oldMethod(refStats, computeStats(img)),
      ).metrics;
      const n = evaluateRender(refStats.features, t, newMethod(refStats, t).adjustments).metrics;
      sum.old.lum += o.lum;
      sum.old.chroma += o.chroma;
      sum.old.band += o.bandHue / 10 + o.bandChroma;
      sum.old.drift += o.drift;
      sum.neu.lum += n.lum;
      sum.neu.chroma += n.chroma;
      sum.neu.band += n.bandHue / 10 + n.bandChroma;
      sum.neu.drift += n.drift;
      expect(n.driftMax).toBeLessThan(10);
    }
    expect(sum.neu.lum).toBeLessThan(sum.old.lum * 0.8);
    expect(sum.neu.chroma).toBeLessThan(sum.old.chroma * 0.7);
    expect(sum.neu.band).toBeLessThanOrEqual(sum.old.band);
    expect(sum.neu.drift).toBeLessThanOrEqual(sum.old.drift + 1);
  });
});
