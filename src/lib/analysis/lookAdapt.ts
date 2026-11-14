/**
 * Adaptive looks (roadmap 1.2): before a library look is applied, this photo's exposure and white
 * balance are evened out toward what the look was designed for, so a look reads as intended on a
 * bright, dark, backlit or colour-cast photo instead of washing out or tinting further.
 *
 * "The look's intent" is measured, not guessed: the look is rendered on a neutral grey ramp (a
 * well-exposed photo with no cast), and its output brightness (median perceptual lightness) and cast
 * are the targets. The same look is rendered on a small sample of this photo with the matcher's CPU
 * pipeline (`renderPixels`, identical maths to the GPU shader), and:
 *
 *  - an exposure offset moves the photo's output median `keep` of the way toward the intent (the rest
 *    is the scene's own exposure; a night shot stays a night shot), found by bisection, capped and
 *    with a dead band so well-exposed photos are left alone. It never pushes the brightest 0.5% of
 *    pixels past `highlightCeiling` (or past where they already were), nor the top 3% past
 *    `upperCeiling` (or more than `upperSlack` above where they were), nor the darkest 0.5% below
 *    `shadowFloor`, so a low-key, night or sun-and-shade photo isn't blown out to reach an average
 *    brightness;
 *  - a white-balance offset removes part of the photo's OWN cast: the mean colour of the least
 *    colourful quarter of its pixels with no edit at all, against neutral grey (so a strong cast that
 *    tints every grey still counts). It is kept only if a trial render shows the cast shrank.
 *    The look's colour is never part of this measurement: until 2026-11-14 the cast was measured
 *    through the look and compared with the look on a grey ramp, which read a photo's blue sky or
 *    warm walls under a graded look as an error and pulled the grade back out (Teal and Orange was
 *    "fitted" with temperature +15, tint +20 and ended up close to the original).
 *    Black-and-white looks get no white-balance change.
 *
 * Only numbers from measurements and fixed rules; no AI. The result is three ordinary slider offsets
 * (exposure, temperature, tint) added to the look's values, so they stay visible and editable and the
 * look's Amount scales them too. Matched looks (Match a look) are already fitted and are not adapted.
 */
import { linearSrgbToOklab } from '../color/oklab';
import { srgbToLinear } from '../color/srgb';
import { RANGES, defaultAdjustments, mergeAdjustments, type Adjustments, type PartialAdjustments } from '../schema/adjustments';
import { renderPixels } from './match';
import { inverseWhiteBalance } from './mapping';

export const LOOK_ADAPT = {
  /** Share of the gap to the look's intended brightness that is closed (the rest is the scene). */
  keep: 0.5,
  /** Largest exposure offset, in EV. */
  maxEv: 1.0,
  /** Brightening also stops before the top 3% of pixels pass this lightness, or rise more than
   *  `upperSlack` above where they already were. The 0.5% guard alone let a sunlit street with
   *  deep shade be pushed +1.2 EV: its few brightest pixels were already white, so that guard
   *  never engaged, and the sky blew out (second audit, 2026-11-14). */
  upperCeiling: 0.9,
  upperSlack: 0.03,
  /** Brightness moves smaller than this (perceptual lightness, 0..1) are skipped. */
  deadband: 0.025,
  /** Brightening stops before the top 0.5% of pixels pass this lightness (unless they already do). */
  highlightCeiling: 0.95,
  /** Darkening stops before the bottom 0.5% of pixels fall below this lightness (unless they already do). */
  shadowFloor: 0.03,
  /** Share of the photo's own cast removed, and the slider caps for it. */
  wbShare: 0.5,
  maxTemperature: 18,
  maxTint: 10,
  /** Cast differences smaller than this (OKLab a/b) are skipped. */
  minCast: 0.006,
  /** The least colourful pixels whose mean colour is the cast, and the chroma above which there is no grey to judge.
   *  A quarter, not half: with half, a large pale sky counted as "grey" and a daylight photo was warmed to the cap. */
  castShare: 0.25,
  maxCastChroma: 0.12,
  /** Pixels sampled from the photo (enough for a stable median and cast; keeps a tap under ~50 ms). */
  samplePixels: 2500,
};

export interface LookAdaptation {
  /** EV added to the look's exposure. */
  exposure: number;
  /** Added to the look's temperature and tint. */
  temperature: number;
  tint: number;
}

export const NO_ADAPTATION: LookAdaptation = { exposure: 0, temperature: 0, tint: 0 };

export function isAdapted(a: LookAdaptation | null | undefined): a is LookAdaptation {
  return !!a && (Math.abs(a.exposure) >= 0.01 || a.temperature !== 0 || a.tint !== 0);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A neutral, well-exposed "photo": grey from near black to near white, evenly spread in lightness. */
let neutral: Float32Array | null = null;
function neutralScene(): Float32Array {
  if (neutral) return neutral;
  const n = 256;
  neutral = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = srgbToLinear(0.03 + (0.94 * i) / (n - 1));
    neutral[i * 3] = neutral[i * 3 + 1] = neutral[i * 3 + 2] = y;
  }
  return neutral;
}

interface Out {
  /** Median display lightness (0..1), the 0.5% / 99.5% points, and the 97% point. */
  median: number;
  low: number;
  high: number;
  upper: number;
  /** Mean OKLab a/b of the least colourful pixels; null when even those are strongly coloured. */
  cast: { a: number; b: number } | null;
  mono: boolean;
}

/** Renders and measures only what adaptation needs (cheap: called ~15 times per tap). */
function measure(lin: Float32Array, adj: Adjustments, buf?: Float32Array): Out {
  const d = renderPixels(lin, adj, buf);
  const n = d.length / 3;
  const lum = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  const C = new Float32Array(n);
  let maxC = 0;
  for (let i = 0; i < n; i++) {
    const r = srgbToLinear(clamp(d[i * 3], 0, 1));
    const g = srgbToLinear(clamp(d[i * 3 + 1], 0, 1));
    const b = srgbToLinear(clamp(d[i * 3 + 2], 0, 1));
    lum[i] = 0.2126 * d[i * 3] + 0.7152 * d[i * 3 + 1] + 0.0722 * d[i * 3 + 2];
    const [, a, bb] = linearSrgbToOklab(r, g, b);
    A[i] = a;
    B[i] = bb;
    C[i] = Math.hypot(a, bb);
    if (C[i] > maxC) maxC = C[i];
  }
  const sorted = lum.slice().sort();
  const at = (q: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))] ?? 0;
  const median = at(0.5);
  const order = Array.from(C.keys()).sort((x, y) => C[x] - C[y]);
  const k = Math.max(1, Math.floor(n * LOOK_ADAPT.castShare));
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < k; i++) {
    sa += A[order[i]];
    sb += B[order[i]];
  }
  const cutoff = C[order[k - 1]] ?? 0;
  return {
    median,
    low: at(0.005),
    high: at(0.995),
    upper: at(0.97),
    cast: cutoff <= LOOK_ADAPT.maxCastChroma ? { a: sa / k, b: sb / k } : null,
    mono: maxC < 0.02,
  };
}

const withOffsets = (adj: Adjustments, exposure: number, temperature = 0, tint = 0): Adjustments => ({
  ...adj,
  basic: {
    ...adj.basic,
    exposure: clamp(adj.basic.exposure + exposure, RANGES.basic.exposure.min, RANGES.basic.exposure.max),
    temperature: clamp(adj.basic.temperature + temperature, RANGES.basic.temperature.min, RANGES.basic.temperature.max),
    tint: clamp(adj.basic.tint + tint, RANGES.basic.tint.min, RANGES.basic.tint.max),
  },
});

/**
 * @param targetLin  linear-RGB pixels of the photo (3 floats each), e.g. from `linearPixels`.
 * @param onPhoto    the look as it will be applied to this photo (baseline merged with the look).
 * @param intent     the look on default settings (what it was designed to do to a neutral photo).
 */
export function adaptLook(targetLin: Float32Array, onPhoto: Adjustments, intent: Adjustments): LookAdaptation {
  if (targetLin.length < 3) return { ...NO_ADAPTATION };
  const want = measure(neutralScene(), intent);
  const buf = new Float32Array(targetLin.length);
  const base = measure(targetLin, onPhoto, buf);

  // Exposure: bisection on the offset (the output median rises monotonically with exposure).
  let exposure = 0;
  const goal = base.median + (want.median - base.median) * LOOK_ADAPT.keep;
  if (Math.abs(goal - base.median) >= LOOK_ADAPT.deadband) {
    // Median, top and bottom all rise with exposure, so "reached the goal or clipped" is monotonic.
    const brighten = goal > base.median;
    const ceiling = Math.max(base.high, LOOK_ADAPT.highlightCeiling);
    const upperCeiling = Math.max(base.upper + LOOK_ADAPT.upperSlack, LOOK_ADAPT.upperCeiling);
    const floor = Math.min(base.low, LOOK_ADAPT.shadowFloor);
    let lo = brighten ? 0 : -LOOK_ADAPT.maxEv;
    let hi = brighten ? LOOK_ADAPT.maxEv : 0;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      const m = measure(targetLin, withOffsets(onPhoto, mid), buf);
      if (brighten) {
        if (m.median < goal && m.high <= ceiling && m.upper <= upperCeiling) lo = mid;
        else hi = mid;
      } else if (m.median > goal && m.low >= floor) hi = mid;
      else lo = mid;
    }
    // The safe end of the bracket, rounded toward zero.
    const safe = brighten ? lo : hi;
    exposure = Math.trunc(safe * 100) / 100;
  }

  // White balance: remove part of this photo's own cast (measured with no edit, against neutral).
  let temperature = 0;
  let tint = 0;
  // A black-and-white look leaves this photo without colour; it gets no white-balance change.
  if (!base.mono && !onPhoto.basic.monochrome) {
    const plain = defaultAdjustments();
    const own = measure(targetLin, plain, buf).cast;
    const grey = measure(neutralScene(), plain).cast;
    if (own && grey) {
      const da = own.a - grey.a;
      const db = own.b - grey.b;
      const off = Math.hypot(da, db);
      if (off >= LOOK_ADAPT.minCast) {
        const wb = inverseWhiteBalance(-da * LOOK_ADAPT.wbShare, -db * LOOK_ADAPT.wbShare);
        const t = Math.round(clamp(wb.temperature, -LOOK_ADAPT.maxTemperature, LOOK_ADAPT.maxTemperature));
        const g = Math.round(clamp(wb.tint, -LOOK_ADAPT.maxTint, LOOK_ADAPT.maxTint));
        if (t || g) {
          const trial = measure(targetLin, withOffsets(plain, 0, t, g), buf).cast;
          // Keep it only if the photo's cast really shrank.
          if (trial && Math.hypot(trial.a - grey.a, trial.b - grey.b) < off * 0.9) {
            temperature = t;
            tint = g;
          }
        }
      }
    }
  }
  return { exposure, temperature, tint };
}

/** The look's values with the adaptation added (relative to what the look or the baseline sets). */
export function withLookAdaptation(values: PartialAdjustments, baseline: Adjustments, a: LookAdaptation): PartialAdjustments {
  if (!isAdapted(a)) return values;
  const basic = values.basic ?? {};
  const from = (k: 'exposure' | 'temperature' | 'tint') => basic[k] ?? baseline.basic[k];
  const range = RANGES.basic;
  return {
    ...values,
    basic: {
      ...basic,
      ...(a.exposure ? { exposure: Math.round(clamp(from('exposure') + a.exposure, range.exposure.min, range.exposure.max) * 100) / 100 } : {}),
      ...(a.temperature ? { temperature: clamp(from('temperature') + a.temperature, range.temperature.min, range.temperature.max) } : {}),
      ...(a.tint ? { tint: clamp(from('tint') + a.tint, range.tint.min, range.tint.max) } : {}),
    },
  };
}

/** Convenience: adapt a look's partial values to a photo, given its pixels and the current baseline. */
export function adaptLookValues(targetLin: Float32Array, baseline: Adjustments, values: PartialAdjustments): LookAdaptation {
  return adaptLook(targetLin, mergeAdjustments(baseline, values), mergeAdjustments(defaultAdjustments(), values));
}

/** "exposure −0.40 · temperature −6": what was changed, for the applied look's note. */
export function describeAdaptation(a: LookAdaptation): string {
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const parts: string[] = [];
  if (Math.abs(a.exposure) >= 0.01) parts.push(`exposure ${sign(a.exposure)}${Math.abs(a.exposure).toFixed(2)}`);
  if (a.temperature) parts.push(`temperature ${sign(a.temperature)}${Math.abs(a.temperature)}`);
  if (a.tint) parts.push(`tint ${sign(a.tint)}${Math.abs(a.tint)}`);
  return parts.join(' · ');
}
