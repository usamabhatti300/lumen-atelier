/**
 * Target adaptation and result comparison.
 *
 * Adaptation separates scene-specific corrections from the transferable look:
 * the preset is applied as-is, and these optional extras (exposure and
 * white-balance compensation) are added on top for this target only.
 *
 * Comparison looks at the rendered result versus the reference and proposes
 * small, explained corrections. It never matches histograms blindly and caps
 * every suggestion so the target's own lighting is respected.
 */
import { srgbToLinear } from '../color/srgb';
import type { Adjustments, PartialAdjustments } from '../schema/adjustments';
import { inverseWhiteBalance } from './mapping';
import type { ImageStats } from './stats';

export interface AdaptOptions {
  matchBrightness: boolean;
  neutralizeCast: boolean;
}

export interface Adaptation {
  extras: { exposure: number; temperature: number; tint: number };
  notes: string[];
  mismatch: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const Y = (p: number) => Math.max(1e-4, srgbToLinear(clamp(p, 0, 1)));

export function adaptToTarget(ref: ImageStats, target: ImageStats, opts: AdaptOptions): Adaptation {
  const notes: string[] = [];
  const mismatch: string[] = [];
  let exposure = 0;
  let temperature = 0;
  let tint = 0;

  if (opts.matchBrightness) {
    const stops = Math.log2(Y(ref.percentiles.p50) / Y(target.percentiles.p50));
    exposure = Math.round(clamp(stops * 0.7, -1.5, 1.5) * 100) / 100;
    if (Math.abs(exposure) >= 0.05) notes.push(`Exposure ${exposure > 0 ? '+' : ''}${exposure.toFixed(2)} EV moves the photo toward the reference's brightness.`);
  }
  if (opts.neutralizeCast) {
    const castC = Math.hypot(target.cast.a, target.cast.b);
    if (target.cast.support > 0.05 && castC > 0.005) {
      // Partial and capped: a strong "cast" is often scene colour (sky, walls), not lighting.
      const wb = inverseWhiteBalance(-target.cast.a * 0.6, -target.cast.b * 0.6);
      temperature = Math.round(clamp(wb.temperature, -30, 30));
      tint = Math.round(clamp(wb.tint, -20, 20));
      notes.push(`Neutralised the photo's own ${target.cast.b > 0 ? 'warm' : 'cool'} cast first (temperature ${temperature > 0 ? '+' : ''}${temperature}, tint ${tint > 0 ? '+' : ''}${tint}), so the reference's colour grade reads the same.`);
    }
  }

  const dBright = ref.percentiles.p50 - target.percentiles.p50;
  if (Math.abs(dBright) > 0.28) mismatch.push(`The reference is much ${dBright > 0 ? 'brighter' : 'darker'} than this photo. The colour grade transfers, but the overall brightness will differ unless you turn on brightness matching.`);
  if (ref.flags.nightLikely !== target.flags.nightLikely) mismatch.push('One image is a night or neon scene and the other is not, so a close match is unlikely.');
  if (ref.monochrome && !target.monochrome) notes.push('The reference is black and white; the preset converts this photo to monochrome.');
  if (ref.skin.fraction > 0.04 && target.skin.fraction < 0.01) mismatch.push('The reference features skin tones that this photo does not have; skin-related colour choices will not show.');
  if (target.skin.fraction > 0.04 && ref.skin.fraction < 0.01) notes.push('This photo has skin tones the reference lacks. Skin hues were protected from large shifts.');
  if (target.flags.overexposed) mismatch.push('This photo has large clipped highlights; detail lost there cannot be recovered by a preset.');
  if (target.flags.underexposed) notes.push('This photo is very dark; consider raising exposure before judging the look.');
  return { extras: { exposure, temperature, tint }, notes, mismatch };
}

/** Applies adaptation extras on top of adjustments (additive, clamped). */
export function withAdaptation(a: Adjustments, extras: Adaptation['extras']): Adjustments {
  return {
    ...a,
    basic: {
      ...a.basic,
      exposure: clamp(a.basic.exposure + extras.exposure, -5, 5),
      temperature: clamp(a.basic.temperature + extras.temperature, -100, 100),
      tint: clamp(a.basic.tint + extras.tint, -100, 100),
    },
  };
}

export interface Suggestion {
  id: string;
  title: string;
  detail: string;
  /** Returns adjusted settings when the user accepts. */
  apply: (a: Adjustments) => Adjustments;
}

/** Compares the rendered result with the reference and proposes capped corrections. */
export function suggestRefinements(ref: ImageStats, result: ImageStats): Suggestion[] {
  const out: Suggestion[] = [];
  const stops = Math.log2(Y(ref.percentiles.p50) / Y(result.percentiles.p50));
  // Beyond ~2 stops the difference is the scene, not the style: don't push exposure.
  if (Math.abs(stops) > 0.35 && Math.abs(stops) <= 2) {
    const delta = Math.round(clamp(stops * 0.5, -1, 1) * 100) / 100;
    out.push({
      id: 'exposure',
      title: delta > 0 ? 'Brighten slightly' : 'Darken slightly',
      detail: `The result's midtones are about ${Math.abs(stops).toFixed(1)} stops ${stops > 0 ? 'darker' : 'brighter'} than the reference. Exposure ${delta > 0 ? '+' : ''}${delta.toFixed(2)} closes half the gap.`,
      apply: (a) => ({ ...a, basic: { ...a.basic, exposure: clamp(a.basic.exposure + delta, -5, 5) } }),
    });
  }
  const refSpread = ref.percentiles.p95 - ref.percentiles.p5;
  const resSpread = result.percentiles.p95 - result.percentiles.p5;
  if (Math.abs(refSpread - resSpread) > 0.1) {
    const delta = Math.round(clamp((refSpread - resSpread) * 120, -30, 30));
    out.push({
      id: 'contrast',
      title: delta > 0 ? 'Add contrast' : 'Soften contrast',
      detail: `The result's tonal range is ${resSpread < refSpread ? 'narrower' : 'wider'} than the reference's.`,
      apply: (a) => ({ ...a, basic: { ...a.basic, contrast: clamp(a.basic.contrast + delta, -100, 100) } }),
    });
  }
  const satRatio = Math.max(0.01, ref.chroma.p50) / Math.max(0.01, result.chroma.p50);
  if (!ref.monochrome && (satRatio < 0.8 || satRatio > 1.25)) {
    const delta = Math.round(clamp(Math.log2(satRatio) * 35, -25, 25));
    out.push({
      id: 'saturation',
      title: delta > 0 ? 'Increase saturation' : 'Reduce saturation',
      detail: `Colour intensity differs from the reference by about ${Math.round(Math.abs(1 - satRatio) * 100)}%.`,
      apply: (a) => ({ ...a, basic: { ...a.basic, saturation: clamp(a.basic.saturation + delta, -100, 100) } }),
    });
  }
  const shadowDelta = { a: ref.shadows.a - result.shadows.a, b: ref.shadows.b - result.shadows.b };
  const sC = Math.hypot(shadowDelta.a, shadowDelta.b);
  if (ref.shadows.support > 0.03 && result.shadows.support > 0.03 && sC > 0.01 && !ref.monochrome) {
    let hue = (Math.atan2(shadowDelta.b, shadowDelta.a) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    const addSat = clamp((sC / 0.11) * 100 * 0.5, 2, 15);
    out.push({
      id: 'shadow-tint',
      title: 'Match shadow colour',
      detail: 'The shadows are tinted differently from the reference. This adds a little of the reference\'s shadow tint.',
      apply: (a) => {
        const w = a.grading.shadows;
        const x = Math.cos((w.hue * Math.PI) / 180) * w.saturation + Math.cos((hue * Math.PI) / 180) * addSat;
        const y = Math.sin((w.hue * Math.PI) / 180) * w.saturation + Math.sin((hue * Math.PI) / 180) * addSat;
        let h = (Math.atan2(y, x) * 180) / Math.PI;
        if (h < 0) h += 360;
        return { ...a, grading: { ...a.grading, shadows: { ...w, hue: Math.round(h), saturation: clamp(Math.hypot(x, y), 0, 100) } } };
      },
    });
  }
  return out;
}

export type { PartialAdjustments };
