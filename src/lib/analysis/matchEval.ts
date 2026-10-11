/**
 * Offline evaluation of reference matching: method-independent metrics on
 * the features matching is meant to reproduce, and the old (generic look +
 * exposure/cast adaptation) and new (target-aware) methods side by side.
 * Used by match.test.ts (thresholds) and match.eval.test.ts (report and
 * contact sheets on real photos).
 */
import {
  HSL_BANDS,
  HSL_BAND_HUES,
  defaultAdjustments,
  mergeAdjustments,
  type Adjustments,
  type PartialAdjustments,
} from '../schema/adjustments';
import { adaptToTarget, withAdaptation } from './adapt';
import {
  CHROMATIC_MIN,
  computeMatchFeatures,
  hueDiff,
  sampleFromDisplay,
  zoneTints,
  type MatchFeatures,
} from './features';
import { mapReferenceToPreset } from './mapping';
import { matchToTarget, renderPixels, type MatchResult, type TargetModel } from './match';
import { computeStats, type ImageStats, type PixelImage } from './stats';

export interface MatchMetrics {
  /** Mean absolute error of 11 luminance quantiles, in percentile points (0..100). */
  lum: number;
  /** |log2| of result/reference mean chroma (0 = same colour intensity). */
  chroma: number;
  /** Shared bands (>= 5% in both reference and target): mean |hue error| (degrees) and |log2 chroma ratio|. */
  bandHue: number;
  bandChroma: number;
  sharedBands: number;
  /** Mean zone tint error of the target's own neutral pixels vs the reference's near-neutral tints (OKLab a/b distance x 1000). */
  zone: number;
  /** Protected bands (in the target, none within 60 degrees in the reference): mean and max hue drift (degrees). */
  drift: number;
  driftMax: number;
  protectedBands: number;
}

const bandOfHue = (h: number) => {
  let best = 0;
  let bestD = Infinity;
  HSL_BANDS.forEach((b, i) => {
    const d = Math.abs(hueDiff(h, HSL_BAND_HUES[b]));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
};

/** Hard-membership band statistics of a sample (share of coloured pixels, circular-mean hue, mean chroma). */
function bandStats(s: ReturnType<typeof sampleFromDisplay>, member?: Int8Array) {
  const acc = HSL_BANDS.map(() => ({ n: 0, a: 0, b: 0, C: 0 }));
  let chromatic = 0;
  for (let i = 0; i < s.n; i++) {
    const m = member ? member[i] : s.C[i] >= CHROMATIC_MIN ? bandOfHue(s.h[i]) : -1;
    if (m < 0) continue;
    chromatic++;
    acc[m].n++;
    acc[m].a += s.a[i];
    acc[m].b += s.b[i];
    acc[m].C += s.C[i];
  }
  return acc.map((q) => {
    let h = (Math.atan2(q.b, q.a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { share: q.n / Math.max(1, chromatic), h, C: q.C / Math.max(1, q.n) };
  });
}

/** Reference band statistics from its hue bins. */
function refBands(ref: MatchFeatures) {
  const acc = HSL_BANDS.map(() => ({ w: 0, x: 0, y: 0, C: 0 }));
  for (const bin of ref.hues) {
    if (!bin.w) continue;
    const q = acc[bandOfHue(bin.h)];
    q.w += bin.w;
    q.x += bin.w * bin.C * Math.cos((bin.h * Math.PI) / 180);
    q.y += bin.w * bin.C * Math.sin((bin.h * Math.PI) / 180);
    q.C += bin.w * bin.C;
  }
  return acc.map((q) => {
    let h = (Math.atan2(q.y, q.x) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { share: q.w, h, C: q.w ? q.C / q.w : 0 };
  });
}

export function evaluateRender(
  ref: MatchFeatures,
  t: TargetModel,
  adj: Adjustments,
): { metrics: MatchMetrics; display: Float32Array } {
  const display = renderPixels(t.lin, adj);
  const s = sampleFromDisplay(display);
  const R = computeMatchFeatures(s);
  const lum = (100 * R.lum.reduce((acc, v, i) => acc + Math.abs(v - ref.lum[i]), 0)) / R.lum.length;
  const chroma = Math.abs(Math.log2((R.chroma.mean + 0.004) / (ref.chroma.mean + 0.004)));

  const rb = refBands(ref);
  const tb = bandStats(t.sample);
  const res = bandStats(s);
  let bandHue = 0;
  let bandChroma = 0;
  let wsum = 0;
  let shared = 0;
  if (!ref.mono)
    HSL_BANDS.forEach((_, i) => {
      if (rb[i].share < 0.05 || tb[i].share < 0.05 || res[i].share < 0.02) return;
      shared++;
      const w = rb[i].share;
      bandHue += w * Math.abs(hueDiff(res[i].h, rb[i].h));
      bandChroma += w * Math.abs(Math.log2(Math.max(1e-3, res[i].C) / Math.max(1e-3, rb[i].C)));
      wsum += w;
    });

  // Zone tints of the target's own neutral pixels (the same pixels for every method), against the reference's.
  const colouredInTarget = new Uint8Array(t.sample.n);
  for (let i = 0; i < t.sample.n; i++) if (t.member[i] >= 0) colouredInTarget[i] = 1;
  const RZ = zoneTints(s, colouredInTarget);
  let zone = 0;
  let zn = 0;
  if (!ref.mono)
    RZ.forEach((z, i) => {
      if (ref.zones[i].s < 0.03 || z.s < 0.01) return;
      zone += 1000 * Math.hypot(z.a - ref.zones[i].a, z.b - ref.zones[i].b);
      zn++;
    });

  // Protected: coloured in the target, with no reference colours within 60 degrees.
  const tracked = bandStats(s, t.member);
  let drift = 0;
  let driftMax = 0;
  let pn = 0;
  if (!ref.mono)
    HSL_BANDS.forEach((_, i) => {
      if (tb[i].share < 0.05) return;
      const near =
        ref.hues.reduce(
          (acc, bin) => acc + (Math.abs(hueDiff(bin.h, tb[i].h)) <= 60 ? bin.w : 0),
          0,
        ) * Math.min(1, ref.chromatic / 0.15);
      if (near >= 0.02) return;
      const d = Math.abs(hueDiff(tracked[i].h, tb[i].h));
      drift += d;
      driftMax = Math.max(driftMax, d);
      pn++;
    });

  return {
    metrics: {
      lum,
      chroma,
      bandHue: wsum ? bandHue / wsum : 0,
      bandChroma: wsum ? bandChroma / wsum : 0,
      sharedBands: shared,
      zone: zn ? zone / zn : 0,
      drift: pn ? drift / pn : 0,
      driftMax,
      protectedBands: pn,
    },
    display,
  };
}

/** Old method: generic look plus the exposure/cast adaptation, as the app applied it before. */
export function oldMethod(refStats: ImageStats, targetStats: ImageStats): Adjustments {
  const generic = mapReferenceToPreset(refStats, null).adjustments;
  const adaptation = adaptToTarget(refStats, targetStats, {
    matchBrightness: false,
    neutralizeCast: true,
  });
  return withAdaptation(mergeAdjustments(defaultAdjustments(), generic), adaptation.extras);
}

export function newMethod(
  refStats: ImageStats,
  t: TargetModel,
): { adjustments: Adjustments; result: MatchResult } {
  const generic = mapReferenceToPreset(refStats, null).adjustments;
  const result = matchToTarget(refStats.features, t, generic);
  return { adjustments: mergeAdjustments(defaultAdjustments(), result.adjustments), result };
}

/** Renders a whole image with a look (no spatial effects) back to 8-bit RGBA. */
export function renderImage(img: PixelImage, look: PartialAdjustments | Adjustments): PixelImage {
  const adj = mergeAdjustments(defaultAdjustments(), look as PartialAdjustments);
  const n = img.width * img.height;
  const lin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++) {
      const v = img.data[i * 4 + c] / 255;
      lin[i * 3 + c] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
  const disp = renderPixels(lin, adj);
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.round(Math.min(1, Math.max(0, disp[i * 3])) * 255);
    data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, disp[i * 3 + 1])) * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, disp[i * 3 + 2])) * 255);
    data[i * 4 + 3] = 255;
  }
  return { width: img.width, height: img.height, data };
}

export { computeStats };
