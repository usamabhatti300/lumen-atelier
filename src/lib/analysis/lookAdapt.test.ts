import { describe, expect, it } from 'vitest';
import { srgbToLinear } from '../color/srgb';
import { defaultAdjustments, mergeAdjustments, type PartialAdjustments } from '../schema/adjustments';
import { BUILTIN_PRESETS } from '../presets/library';
import { computeMatchFeatures, sampleFromDisplay } from './features';
import { renderPixels } from './match';
import { adaptLook, adaptLookValues, describeAdaptation, isAdapted, LOOK_ADAPT, withLookAdaptation } from './lookAdapt';

/** Linear pixels whose display lightness is spread evenly over the given ranges, with a colour multiplier. */
function scene(ranges: [lo: number, hi: number, share: number][], tint: [number, number, number] = [1, 1, 1], n = 3000): Float32Array {
  const out: number[] = [];
  for (const [lo, hi, share] of ranges) {
    const k = Math.round(n * share);
    for (let i = 0; i < k; i++) {
      const v = srgbToLinear(lo + ((hi - lo) * i) / Math.max(1, k - 1));
      // A little colour variety so it reads like a photo, not a grey card.
      const hue = (i % 7) / 7;
      out.push(v * tint[0] * (1 + 0.04 * Math.sin(hue * 6.28)), v * tint[1], v * tint[2] * (1 + 0.04 * Math.cos(hue * 6.28)));
    }
  }
  return Float32Array.from(out);
}

const NORMAL = scene([[0.04, 0.96, 1]]);
const BRIGHT = scene([[0.6, 0.98, 1]]);
const DARK = scene([[0.02, 0.32, 1]]);
const BACKLIT = scene([
  [0.82, 0.99, 0.65],
  [0.08, 0.3, 0.35],
]);

const look = (values: PartialAdjustments) => ({ onPhoto: mergeAdjustments(defaultAdjustments(), values), intent: mergeAdjustments(defaultAdjustments(), values) });
const golden = BUILTIN_PRESETS.find((p) => p.name === 'Sunday Negative')!.adjustments;

function outMedian(lin: Float32Array, values: PartialAdjustments) {
  return computeMatchFeatures(sampleFromDisplay(renderPixels(lin, mergeAdjustments(defaultAdjustments(), values)))).lum[5];
}
function intentMedian(values: PartialAdjustments) {
  return outMedian(scene([[0.03, 0.97, 1]], [1, 1, 1], 256), values);
}

describe('adaptive looks', () => {
  it('leaves a well-exposed, neutral photo alone', () => {
    const { onPhoto, intent } = look(golden);
    const a = adaptLook(NORMAL, onPhoto, intent);
    expect(Math.abs(a.exposure)).toBeLessThan(0.1);
    expect(Math.abs(a.temperature)).toBeLessThanOrEqual(3);
    expect(Math.abs(a.tint)).toBeLessThanOrEqual(3);
  });

  it('darkens a bright photo and brightens a dark one, within the cap', () => {
    const { onPhoto, intent } = look(golden);
    const bright = adaptLook(BRIGHT, onPhoto, intent);
    const dark = adaptLook(DARK, onPhoto, intent);
    expect(bright.exposure).toBeLessThan(-0.2);
    expect(dark.exposure).toBeGreaterThan(0.2);
    for (const a of [bright, dark]) expect(Math.abs(a.exposure)).toBeLessThanOrEqual(LOOK_ADAPT.maxEv);
  });

  it('keeps a backlit portrait from washing out: half way to the look’s intended brightness', () => {
    const adapted = adaptLookValues(BACKLIT, defaultAdjustments(), golden);
    expect(adapted.exposure).toBeLessThan(0);
    const want = intentMedian(golden);
    const before = outMedian(BACKLIT, golden);
    const after = outMedian(BACKLIT, withLookAdaptation(golden, defaultAdjustments(), adapted));
    expect(Math.abs(after - want)).toBeLessThan(Math.abs(before - want));
    // Roughly half the gap is closed (the scene keeps the rest).
    expect(Math.abs(after - want) / Math.abs(before - want)).toBeGreaterThan(0.35);
    expect(Math.abs(after - want) / Math.abs(before - want)).toBeLessThan(0.65);
  });

  it('does not blow out a low-key photo with a bright highlight to reach an average brightness', () => {
    const lowKey = scene([
      [0.02, 0.25, 0.94],
      [0.85, 0.97, 0.06],
    ]);
    const { onPhoto, intent } = look(golden);
    const before = renderPixels(lowKey, onPhoto);
    const a = adaptLook(lowKey, onPhoto, intent);
    const after = renderPixels(lowKey, mergeAdjustments(onPhoto, { basic: { exposure: onPhoto.basic.exposure + a.exposure } }));
    const top = (d: Float32Array) => {
      const l = Array.from({ length: d.length / 3 }, (_, i) => 0.2126 * d[i * 3] + 0.7152 * d[i * 3 + 1] + 0.0722 * d[i * 3 + 2]).sort((x, y) => x - y);
      return l[Math.floor(0.995 * (l.length - 1))];
    };
    expect(top(after)).toBeLessThanOrEqual(Math.max(top(before), LOOK_ADAPT.highlightCeiling) + 0.01);
    // It may still lift the photo a little, but well short of the cap.
    expect(a.exposure).toBeLessThan(LOOK_ADAPT.maxEv);
  });

  it('neutralises part of a colour cast so the look’s own colour reads the same', () => {
    const warm = scene([[0.04, 0.96, 1]], [1.18, 1, 0.78]);
    const cool = scene([[0.04, 0.96, 1]], [0.82, 1, 1.2]);
    const { onPhoto, intent } = look({});
    const w = adaptLook(warm, onPhoto, intent);
    const c = adaptLook(cool, onPhoto, intent);
    expect(w.temperature).toBeLessThan(0);
    expect(c.temperature).toBeGreaterThan(0);
    for (const a of [w, c]) {
      expect(Math.abs(a.temperature)).toBeLessThanOrEqual(LOOK_ADAPT.maxTemperature);
      expect(Math.abs(a.tint)).toBeLessThanOrEqual(LOOK_ADAPT.maxTint);
    }
    // The warm look's own warmth is the intent: a neutral photo gets no correction against it.
    const warmLook = look({ basic: { temperature: 35 } });
    expect(adaptLook(NORMAL, warmLook.onPhoto, warmLook.intent).temperature).toBe(0);
  });

  it('never changes white balance for a black-and-white look', () => {
    const warm = scene([[0.04, 0.96, 1]], [1.2, 1, 0.75]);
    const { onPhoto, intent } = look({ basic: { monochrome: 100 } });
    const a = adaptLook(warm, onPhoto, intent);
    expect([a.temperature, a.tint]).toEqual([0, 0]);
  });

  it('adds the offsets on top of the look, or of the baseline when the look leaves a slider alone', () => {
    const baseline = mergeAdjustments(defaultAdjustments(), { basic: { exposure: 0.3, tint: 4 } });
    const v = withLookAdaptation({ basic: { exposure: 0.1, contrast: 10 } }, baseline, { exposure: -0.4, temperature: -6, tint: 2 });
    expect(v.basic).toEqual({ exposure: -0.3, contrast: 10, temperature: -6, tint: 6 });
    const same = { basic: { exposure: 0.1 } };
    expect(withLookAdaptation(same, baseline, { exposure: 0, temperature: 0, tint: 0 })).toBe(same);
  });

  it('describes what it changed', () => {
    expect(describeAdaptation({ exposure: -0.4, temperature: -6, tint: 0 })).toBe('exposure −0.40 · temperature −6');
    expect(isAdapted({ exposure: 0, temperature: 0, tint: 0 })).toBe(false);
    expect(isAdapted({ exposure: 0.004, temperature: 0, tint: 1 })).toBe(true);
  });

  it('is fast enough to run when a look is tapped', () => {
    const { onPhoto, intent } = look(golden);
    const t = performance.now();
    adaptLook(scene([[0.6, 0.98, 1]], [1.1, 1, 0.9], LOOK_ADAPT.samplePixels), onPhoto, intent);
    // Generous for slow CI; measured ~30 ms on the owner's laptop class of CPU.
    expect(performance.now() - t).toBeLessThan(400);
  });
});
