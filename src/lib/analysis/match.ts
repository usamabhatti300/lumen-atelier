/**
 * Target-aware reference matching.
 *
 * The generic look (mapping.ts) describes how the reference departs from a
 * canonical neutral photo. That is reusable, but it ignores the photo it is
 * applied to: a vivid target stays vivid. This module instead compares the
 * reference's measured features with the target's own and derives ordinary,
 * editable slider values that move THIS photo toward the reference:
 *
 *  1. Relative transfer (closed form): the target's luminance quantiles move
 *     toward the reference's (hue-preserving basic tone sliders, plus a gentle
 *     master curve for the black point, roll-off and residual), keeping part
 *     of the target's own exposure; white balance neutralises the target's
 *     cast and applies part of the reference's; global saturation scales by
 *     the chroma ratio; each HSL band present in the target moves toward the
 *     reference's colours of a similar hue (hue, chroma, relative lightness);
 *     zone grades bring the target's neutral pixels to the reference's tints.
 *  2. Protection: target colours with no counterpart in the reference
 *     (e.g. brown leaves against a teal forest, or skin) keep their own hue
 *     and receive only a softened version of the global saturation change.
 *  3. Closed loop: the target sample is rendered with the candidate settings
 *     using the CPU reference pipeline (pixel.ts, identical maths to the GPU
 *     shader), re-measured with the same feature extractor, and each slider
 *     group is corrected in proportion to its own feature error (damped and
 *     bounded). This catches interactions such as a cool white balance
 *     turning browns pink. The best iterate is kept, so refinement never
 *     makes the match worse than the closed-form estimate.
 *
 * All numbers come from measurements and fixed rules; nothing here uses the
 * AI interpretation. See docs/AI_ARCHITECTURE.md ("Target-aware matching").
 */
import { linearToSrgb } from '../color/srgb';
import { deriveDevelopParams } from '../engine/params';
import { developLinear, displayStage, toneShape } from '../engine/pixel';
import {
  HSL_BANDS,
  HSL_BAND_HUES,
  PartialAdjustmentsSchema,
  defaultAdjustments,
  mergeAdjustments,
  normalizeCurve,
  type Adjustments,
  type CurvePoint,
  type HslBandName,
  type PartialAdjustments,
} from '../schema/adjustments';
import {
  CHROMATIC_MIN,
  LUM_QUANTILES,
  allocSample,
  computeMatchFeatures,
  hueDiff,
  linearPixels,
  quantilesOf,
  sampleFromDisplay,
  sampleFromLinear,
  zoneTints,
  type LabSample,
  type MatchFeatures,
  type ZoneTint,
} from './features';
import { inverseWhiteBalance, type Explanation } from './mapping';
import type { PixelImage } from './stats';

export const MATCH = {
  /** Share of the median brightness difference that stays with the target (scene exposure). */
  keepExposure: 0.5,
  /** Largest median brightness move (perceptual units); beyond it the difference is the scene. */
  maxMedianShift: 0.2,
  /** Limits for scaling the target's lower/upper tonal spread toward the reference's. */
  minSpreadRatio: 0.45,
  maxSpreadRatio: 1.4,
  /** Largest pull of a single quantile toward the reference beyond the target's re-centred shape. */
  maxEndMove: 0.15,
  /** Curve anchors: indices into LUM_QUANTILES (p5, p10, p25, p50, p75, p90, p95). */
  anchors: [1, 2, 3, 5, 7, 8, 9],
  /** Minimum and maximum local slope of the matched curve (avoids inversions and posterisation). */
  minSlope: 0.35,
  maxSlope: 2.2,
  /** White balance: share of the reference cast applied and of the target cast removed. */
  refCast: 0.6,
  targetCast: 0.7,
  minCastSupport: 0.03,
  fullCastSupport: 0.15,
  /**
   * When almost every reference pixel is near-neutral (support above `castContentFrom`), its "cast" is the
   * scene itself (a muted, tinted image), not lighting; it is then carried by the zone grades instead.
   */
  castContentFrom: 0.6,
  castContentTo: 0.98,
  maxTemperature: 35,
  maxTint: 12,
  /** Global chroma ratio limits. */
  minChromaRatio: 0.12,
  maxChromaRatio: 2.2,
  /** A target band takes part when it holds this share of the coloured pixels. */
  bandMinShare: 0.025,
  bandMinPixels: 40,
  /** Hue correspondence window (Gaussian sigma / hard limit, degrees); tighter for skin-like hues. */
  hueSigma: 38,
  hueMaxDist: 60,
  skinHueSigma: 22,
  skinHueMaxDist: 40,
  /** Correspondence mass below `protectBelow` protects a band; above `shareAbove` it fully follows the reference. */
  protectBelow: 0.03,
  shareAbove: 0.12,
  /** A protected band within this hue distance of a band that follows the reference moves along with it. */
  neighbourDist: 30,
  /** Largest hue move for a band (degrees); skin-like bands move less. */
  maxHueMove: 30,
  maxSkinHueMove: 8,
  /** Largest chroma increase for a band following the reference (skin-like bands less). */
  maxChromaGain: 1.6,
  maxSkinChromaGain: 1.3,
  /** Protected colours follow the global chroma change softened by this exponent, within limits. */
  protectExponent: 0.6,
  protectMin: 0.4,
  protectSkinMin: 0.6,
  protectMax: 1.5,
  /** Shared bands: weight of the lightness match (tone does most of the work). */
  bandLumWeight: 0.5,
  /** Largest grading offset per zone (OKLab a/b), i.e. wheel saturation ~36. */
  maxZoneOffset: 0.04,
  /**
   * With protected colours present, a zone tint may not exceed this share of their (goal) chroma, so a
   * tint cannot overpower them (e.g. a magenta shadow correction turning brown leaves pink).
   */
  protectedTintShare: 0.45,
  minZoneOffset: 0.012,
  /** Protected bands: limits of the counter-correction (hue +-24 degrees, saturation). */
  protectHue: 0.8,
  protectSatMin: -0.9,
  protectSatMax: 0.5,
  /** Closed loop. */
  iterations: 8,
  gain: 0.7,
  /** Pixels rendered per iteration. */
  samplePixels: 24_000,
} as const;

const SKIN_BANDS: HslBandName[] = ['red', 'orange'];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const GRADE_CHROMA = 0.11;

/** Nearest HSL band index for a hue. */
function bandIndex(h: number): number {
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
}

// ---------------------------------------------------------------------------
// Band planning (shared vs protected), also used by the evaluation metrics
// ---------------------------------------------------------------------------

export interface BandPlan {
  band: HslBandName;
  /** Share of the target's coloured pixels. */
  share: number;
  count: number;
  /** Target's own mean hue / chroma / lightness for this band. */
  hT: number;
  CT: number;
  LT: number;
  /** Reference colours of a similar hue: weight (0 = none) and their mean. goalL is relative to the image's mean lightness. */
  mass: number;
  refH: number;
  refC: number;
  refL: number;
  /** 0 = fully protected (keep hue), 1 = fully follows the reference. */
  k: number;
  goalH: number;
  goalC: number;
  goalL: number;
  protected: boolean;
}

export interface TargetModel {
  lin: Float32Array;
  sample: LabSample;
  features: MatchFeatures;
  /** Band index per pixel (by the target's original hue), -1 for near-neutral pixels. */
  member: Int8Array;
}

export function targetModel(img: PixelImage, maxPixels: number = MATCH.samplePixels): TargetModel {
  const lin = linearPixels(img, maxPixels);
  const sample = sampleFromLinear(lin);
  const member = new Int8Array(sample.n).fill(-1);
  for (let i = 0; i < sample.n; i++)
    if (sample.C[i] >= CHROMATIC_MIN) member[i] = bandIndex(sample.h[i]);
  return { lin, sample, features: computeMatchFeatures(sample), member };
}

/** Reference colours near hue `h`: Gaussian-weighted over the reference's hue bins. */
export function correspondence(ref: MatchFeatures, h: number, sigma: number, maxDist: number) {
  let W = 0;
  let x = 0;
  let y = 0;
  let C = 0;
  let L = 0;
  for (const bin of ref.hues) {
    if (bin.w <= 0) continue;
    const d = Math.abs(hueDiff(bin.h, h));
    if (d > maxDist) continue;
    const w = bin.w * Math.exp(-((d / sigma) ** 2));
    W += w;
    x += w * Math.cos((bin.h * Math.PI) / 180);
    y += w * Math.sin((bin.h * Math.PI) / 180);
    C += w * bin.C;
    L += w * bin.L;
  }
  // A reference with almost no coloured pixels offers no colours to follow.
  const colourful = Math.min(1, ref.chromatic / 0.15);
  if (W <= 1e-9 || ref.mono) return { mass: 0, h, C: 0, L: 0 };
  let hh = (Math.atan2(y, x) * 180) / Math.PI;
  if (hh < 0) hh += 360;
  return { mass: W * colourful, h: hh, C: C / W, L: L / W };
}

export function globalChromaRatio(ref: MatchFeatures, tgt: MatchFeatures): number {
  if (ref.mono) return 0;
  return clamp(
    ref.chroma.mean / Math.max(0.004, tgt.chroma.mean),
    MATCH.minChromaRatio,
    MATCH.maxChromaRatio,
  );
}

export function planBands(ref: MatchFeatures, t: TargetModel): BandPlan[] {
  const acc = HSL_BANDS.map(() => ({ n: 0, x: 0, y: 0, C: 0, L: 0 }));
  let chromatic = 0;
  const s = t.sample;
  for (let i = 0; i < s.n; i++) {
    const m = t.member[i];
    if (m < 0) continue;
    chromatic++;
    const q = acc[m];
    q.n++;
    q.x += s.a[i] / s.C[i];
    q.y += s.b[i] / s.C[i];
    q.C += s.C[i];
    q.L += s.L[i];
  }
  const g = globalChromaRatio(ref, t.features);
  const protectRatio = ref.mono
    ? 0
    : clamp(Math.pow(g, MATCH.protectExponent), MATCH.protectMin, MATCH.protectMax);
  const plans: BandPlan[] = [];
  HSL_BANDS.forEach((band, bi) => {
    const q = acc[bi];
    const share = q.n / Math.max(1, chromatic);
    if (q.n < MATCH.bandMinPixels || share < MATCH.bandMinShare) return;
    let hT = (Math.atan2(q.y, q.x) * 180) / Math.PI;
    if (hT < 0) hT += 360;
    const CT = q.C / q.n;
    const LT = q.L / q.n;
    const skin = SKIN_BANDS.includes(band);
    const c = correspondence(
      ref,
      hT,
      skin ? MATCH.skinHueSigma : MATCH.hueSigma,
      skin ? MATCH.skinHueMaxDist : MATCH.hueMaxDist,
    );
    const k = smoothstep(MATCH.protectBelow, MATCH.shareAbove, c.mass);
    const cap = skin ? MATCH.maxSkinHueMove : MATCH.maxHueMove;
    const goalH = (hT + clamp(hueDiff(c.h, hT), -cap, cap) * k + 360) % 360;
    const sharedC = clamp(
      c.C,
      CT * (skin ? 0.5 : 0.12),
      CT * (skin ? MATCH.maxSkinChromaGain : MATCH.maxChromaGain),
    );
    // Skin-like colours keep more of their intensity, so faces stay natural in muted looks.
    const protC =
      CT * (skin ? clamp(protectRatio, MATCH.protectSkinMin, MATCH.protectMax) : protectRatio);
    const goalC =
      k > 0
        ? Math.exp(
            Math.log(Math.max(1e-4, protC)) * (1 - k) + Math.log(Math.max(1e-4, sharedC)) * k,
          )
        : protC;
    plans.push({
      band,
      share,
      count: q.n,
      hT,
      CT,
      LT,
      mass: c.mass,
      refH: c.h,
      refC: c.C,
      refL: c.L,
      k,
      goalH,
      goalC: ref.mono ? 0 : goalC,
      goalL: c.L - ref.Lmean,
      protected: k < 0.5,
    });
  });
  // A protected band sitting right next to a band that follows the reference (e.g. blue water next to
  // aqua water) moves with it, scaled by hue distance, so one surface does not tear into two hues.
  // Skin-like bands never inherit a shift.
  const shared = plans.filter((p) => !p.protected);
  for (const p of plans) {
    if (!p.protected || SKIN_BANDS.includes(p.band)) continue;
    let q: BandPlan | null = null;
    let qd = Infinity;
    for (const c of shared) {
      const d = Math.abs(hueDiff(p.hT, c.hT));
      if (d < qd) {
        qd = d;
        q = c;
      }
    }
    if (!q || qd >= MATCH.neighbourDist) continue;
    const w = (1 - qd / MATCH.neighbourDist) * q.k;
    p.goalH = (p.hT + w * hueDiff(q.goalH, q.hT) + 360) % 360;
    const inherited = (p.CT * q.goalC) / Math.max(1e-4, q.CT);
    p.goalC = Math.exp(
      Math.log(Math.max(1e-4, p.goalC)) * (1 - w) + Math.log(Math.max(1e-4, inherited)) * w,
    );
    p.k = Math.max(p.k, w);
    p.protected = p.k < 0.5;
  }
  return plans;
}

// ---------------------------------------------------------------------------
// Parameters <-> adjustments
// ---------------------------------------------------------------------------

/** Hue-preserving tone sliders (basic panel) as fractions -1..1. */
export interface ToneSliders {
  blacks: number;
  whites: number;
  shadows: number;
  highlights: number;
  contrast: number;
  brightness: number;
}
const TONE_KEYS: (keyof ToneSliders)[] = [
  'blacks',
  'whites',
  'shadows',
  'highlights',
  'contrast',
  'brightness',
];

/**
 * Fits the basic tone sliders so the target's luminance quantiles land on the goals.
 * These act on luminance only (hue-preserving), unlike an RGB curve, which pushes
 * light blues toward purple when it compresses highlights. Levenberg-Marquardt on
 * the 1D tone function with a small pull toward zero, so sliders stay moderate.
 */
export function fitToneSliders(from: number[], to: number[]): ToneSliders {
  const x = TONE_KEYS.map(() => 0);
  // Blacks only darken here: lifting near-black pixels multiplies their (noise) chroma, so fades are
  // done with the curve's black point instead, which adds the same amount to every channel.
  // Strong negative contrast and positive brightness also lift near-blacks multiplicatively; keep them moderate.
  const lo = [-1, -1, -1, -1, -0.35, -1];
  const hi = [0, 1, 0.6, 1, 1, 0.5];
  const lambda = 0.004;
  const toTone = (v: number[]) =>
    Object.fromEntries(TONE_KEYS.map((k, i) => [k, v[i]])) as unknown as ToneSliders;
  const resid = (v: number[]) => from.map((p, i) => toneShape(p, toTone(v)) - to[i]);
  const cost = (v: number[]) =>
    resid(v).reduce((s, r) => s + r * r, 0) + lambda * v.reduce((s, q) => s + q * q, 0);
  let mu = 1e-3;
  let c0 = cost(x);
  for (let it = 0; it < 40; it++) {
    const r = resid(x);
    const J = TONE_KEYS.map((_, j) => {
      const xp = [...x];
      xp[j] += 1e-3;
      const rp = resid(xp);
      return rp.map((v, i) => (v - r[i]) / 1e-3);
    });
    const n = x.length;
    const A = Array.from({ length: n }, (_, a) =>
      Array.from(
        { length: n },
        (_, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0) + (a === b ? lambda + mu : 0),
      ),
    );
    const g = Array.from(
      { length: n },
      (_, a) => -(J[a].reduce((s, v, i) => s + v * r[i], 0) + lambda * x[a]),
    );
    const d = solve(A, g);
    const xn = x.map((v, i) => clamp(v + d[i], lo[i], hi[i]));
    const c1 = cost(xn);
    if (c1 < c0) {
      for (let i = 0; i < n; i++) x[i] = xn[i];
      if (c0 - c1 < 1e-9) break;
      c0 = c1;
      mu *= 0.5;
    } else mu *= 4;
  }
  return toTone(x.map((v) => Math.round(v * 100) / 100));
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

export interface MatchParams {
  tone: ToneSliders;
  /** Residual master curve (display space), close to identity. */
  curve: CurvePoint[];
  temperature: number;
  tint: number;
  /** Global saturation as a fraction (-1..1). */
  saturation: number;
  /** Per-band hue/saturation/luminance as fractions (-1..1), in HSL_BANDS order. */
  hsl: { h: number; s: number; l: number }[];
  /** Grading offsets (OKLab a, b) for shadows, midtones, highlights. */
  zones: [number, number][];
  mono: boolean;
}

function wheel(o: [number, number]) {
  const C = Math.hypot(o[0], o[1]);
  let hue = (Math.atan2(o[1], o[0]) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return {
    hue: C > 1e-6 ? round(hue) : 0,
    saturation: round(clamp((C / GRADE_CHROMA) * 100, 0, 100), 1),
    luminance: 0,
  };
}

/** The colour/tone values this module owns, rounded to what the sliders store. */
export function paramsToPartial(p: MatchParams): PartialAdjustments {
  const hsl: NonNullable<PartialAdjustments['hsl']> = {};
  HSL_BANDS.forEach((b, i) => {
    hsl[b] = {
      hue: round(p.hsl[i].h * 100),
      saturation: round(p.hsl[i].s * 100),
      luminance: round(p.hsl[i].l * 100),
    };
  });
  return {
    basic: {
      ...Object.fromEntries(TONE_KEYS.map((k) => [k, round(p.tone[k] * 100)])),
      temperature: round(p.temperature),
      tint: round(p.tint),
      saturation: round(p.saturation * 100),
      monochrome: p.mono ? 100 : 0,
    },
    curves: {
      master: normalizeCurve(p.curve.map(([x, y]) => [round(x, 3), round(y, 3)] as CurvePoint)),
    },
    hsl,
    grading: {
      shadows: wheel(p.zones[0]),
      midtones: wheel(p.zones[1]),
      highlights: wheel(p.zones[2]),
      blending: 50,
      balance: 0,
    },
  };
}

/** Renders linear-RGB pixels (3 floats each) with the non-spatial develop pipeline; returns display RGB floats. */
export function renderPixels(
  lin: Float32Array,
  adj: Adjustments,
  out?: Float32Array,
): Float32Array {
  const P = deriveDevelopParams(adj);
  const o = out ?? new Float32Array(lin.length);
  const n = lin.length / 3;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const y = developLinear([lin[k], lin[k + 1], lin[k + 2]], P);
    const d = displayStage([linearToSrgb(y[0]), linearToSrgb(y[1]), linearToSrgb(y[2])], P);
    o[k] = d[0];
    o[k + 1] = d[1];
    o[k + 2] = d[2];
  }
  return o;
}

// ---------------------------------------------------------------------------
// Measurement of a trial render
// ---------------------------------------------------------------------------

interface Measured {
  lum: number[];
  Lmean: number;
  chromaMean: number;
  bands: { h: number; C: number; L: number }[];
  zones: [ZoneTint, ZoneTint, ZoneTint];
}

function measure(s: LabSample, t: TargetModel, plans: BandPlan[], exclude: Uint8Array): Measured {
  const lum = quantilesOf(s.p, LUM_QUANTILES);
  let sumC = 0;
  let sumL = 0;
  const acc = HSL_BANDS.map(() => ({ n: 0, a: 0, b: 0, C: 0, L: 0 }));
  for (let i = 0; i < s.n; i++) {
    sumC += s.C[i];
    sumL += s.L[i];
    const m = t.member[i];
    if (m < 0) continue;
    const q = acc[m];
    q.n++;
    q.a += s.a[i];
    q.b += s.b[i];
    q.C += s.C[i];
    q.L += s.L[i];
  }
  const bands = plans.map((p) => {
    const q = acc[HSL_BANDS.indexOf(p.band)];
    let h = (Math.atan2(q.b, q.a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { h, C: q.C / Math.max(1, q.n), L: q.L / Math.max(1, q.n) };
  });
  const Lmean = sumL / Math.max(1, s.n);
  return {
    lum,
    Lmean,
    chromaMean: sumC / Math.max(1, s.n),
    bands: bands.map((b) => ({ ...b, L: b.L - Lmean })),
    zones: zoneTints(s, exclude),
  };
}

export interface MatchGoals {
  lum: number[];
  chromaMean: number;
  zones: [ZoneTint, ZoneTint, ZoneTint];
  /** True when the brightness move was capped (scene difference). */
  shiftCapped: boolean;
}

/**
 * Tone goals. A full histogram match would copy the reference SCENE (a big bright sky, a dark
 * background) onto the target, so the goals combine two parts:
 *  - shape: the target's own distribution, re-centred on the goal median and with its lower and
 *    upper spreads scaled to the reference's (contrast), within limits;
 *  - the reference's quantiles themselves, weighted most at the ends (black point / fade,
 *    highlight roll-off are style) and least in the mid-tones (scene content).
 * The median keeps `keepExposure` of the target's own brightness and moves at most `maxMedianShift`.
 */
export function toneGoals(
  ref: MatchFeatures,
  tgt: MatchFeatures,
  keepExposure: number,
): { lum: number[]; capped: boolean } {
  const i50 = LUM_QUANTILES.indexOf(0.5);
  const i5 = LUM_QUANTILES.indexOf(0.05);
  const i95 = LUM_QUANTILES.indexOf(0.95);
  const T = tgt.lum;
  const R = ref.lum;
  let med = R[i50] + keepExposure * (T[i50] - R[i50]);
  let capped = false;
  if (Math.abs(med - T[i50]) > MATCH.maxMedianShift) {
    capped = true;
    med = T[i50] + Math.sign(med - T[i50]) * MATCH.maxMedianShift;
  }
  const lowRatio = clamp(
    (R[i50] - R[i5]) / Math.max(0.03, T[i50] - T[i5]),
    MATCH.minSpreadRatio,
    MATCH.maxSpreadRatio,
  );
  const highRatio = clamp(
    (R[i95] - R[i50]) / Math.max(0.03, T[i95] - T[i50]),
    MATCH.minSpreadRatio,
    MATCH.maxSpreadRatio,
  );
  const shift = med - R[i50];
  let lum = T.map((tv, i) => {
    const shape = med + (tv - T[i50]) * (tv < T[i50] ? lowRatio : highRatio);
    const q = LUM_QUANTILES[i];
    const ends = Math.max(q, 1 - q);
    // Reference weight: 0.75 at p1/p99, 0.5 at p5/p95, 0.25 in the mid-tones.
    const w = ends >= 0.99 ? 0.75 : ends >= 0.95 ? 0.5 : ends >= 0.9 ? 0.35 : 0.25;
    // The reference's own quantile, carrying the same exposure decision as the median (tapered at the ends).
    const taper = Math.min(1, 4 * q * (1 - q) + 0.15);
    const refQ = R[i] + shift * taper;
    // Never let the reference's end points drag a quantile far from the target's own shape.
    return shape + clamp(w * (refQ - shape), -MATCH.maxEndMove, MATCH.maxEndMove);
  });
  lum = lum.map((v) => clamp(v, 0, 1));
  // Monotone outward from the median, so the median goal (the exposure decision) is never moved.
  for (let i = i50 - 1; i >= 0; i--) lum[i] = Math.min(lum[i], lum[i + 1]);
  for (let i = i50 + 1; i < lum.length; i++) lum[i] = Math.max(lum[i], lum[i - 1]);
  return { lum, capped };
}

interface ErrorParts {
  tone: number;
  chroma: number;
  bands: number;
  zones: number;
  total: number;
}

function errorOf(
  m: Measured,
  goals: MatchGoals,
  plans: BandPlan[],
  zoneOk: boolean[],
  mono: boolean,
  zoneMin: number,
): ErrorParts {
  const tone = (100 * m.lum.reduce((s, v, i) => s + Math.abs(v - goals.lum[i]), 0)) / m.lum.length;
  const chroma = mono
    ? 0
    : 20 * Math.abs(Math.log2(Math.max(1e-3, m.chromaMean) / Math.max(1e-3, goals.chromaMean)));
  let bands = 0;
  if (!mono)
    plans.forEach((p, i) => {
      const r = m.bands[i];
      bands +=
        p.share *
        (Math.abs(hueDiff(r.h, p.goalH)) / 5 +
          10 * Math.abs(Math.log2(Math.max(1e-3, r.C) / Math.max(1e-3, p.goalC))) +
          100 * MATCH.bandLumWeight * p.k * Math.abs(r.L - p.goalL));
    });
  let zones = 0;
  if (!mono)
    m.zones.forEach((z, i) => {
      if (zoneOk[i] && z.s >= zoneMin)
        zones += 400 * Math.hypot(z.a - goals.zones[i].a, z.b - goals.zones[i].b);
    });
  return { tone, chroma, bands, zones, total: tone + chroma * 0.5 + bands + zones };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface MatchOptions {
  /** Share of the target's own median brightness kept (0 = match the reference fully). */
  keepExposure?: number;
  maxIterations?: number;
  /** Called after each render-and-measure pass (iteration count, never a fake percentage). */
  onProgress?: (iteration: number, max: number) => void;
  shouldCancel?: () => boolean;
}

export interface MatchResult {
  /** Full colour/tone values for this photo, plus the generic look's non-colour settings. */
  adjustments: PartialAdjustments;
  explanations: Explanation[];
  warnings: string[];
  notes: string[];
  plans: BandPlan[];
  iterations: number;
  converged: boolean;
  error: { initial: number; final: number };
}

export class MatchCancelled extends Error {}

/** Non-colour parts of the generic look that matching keeps as they are (texture, vignette, grain). */
function nonColour(generic: PartialAdjustments): PartialAdjustments {
  const out: PartialAdjustments = {};
  if (generic.effects) out.effects = structuredClone(generic.effects);
  if (generic.presence) out.presence = structuredClone(generic.presence);
  return out;
}

const BAND_LABEL: Record<HslBandName, string> = {
  red: 'Reds',
  orange: 'Oranges and browns',
  yellow: 'Yellows',
  green: 'Greens',
  aqua: 'Aquas',
  blue: 'Blues',
  purple: 'Purples',
  magenta: 'Magentas',
};

function hueWord(h: number): string {
  const names: [number, string][] = [
    [20, 'red'],
    [45, 'orange'],
    [75, 'amber'],
    [105, 'yellow'],
    [150, 'green'],
    [185, 'teal'],
    [215, 'cyan'],
    [265, 'blue'],
    [300, 'purple'],
    [335, 'magenta'],
    [360, 'pink'],
  ];
  for (const [limit, name] of names) if (h <= limit) return name;
  return 'red';
}

function enforceCurve(pts: CurvePoint[]) {
  // Light smoothing of the interior deviation from identity (keeps the curve gentle and editable).
  const r = pts.map(([x, y]) => y - x);
  for (let i = 1; i < pts.length - 1; i++)
    pts[i][1] = pts[i][0] + 0.7 * r[i] + 0.15 * (r[i - 1] + r[i + 1]);
  pts[0][1] = clamp(pts[0][1], 0, 0.35);
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    pts[i][1] = clamp(
      pts[i][1],
      pts[i - 1][1] + MATCH.minSlope * dx,
      pts[i - 1][1] + MATCH.maxSlope * dx,
    );
    pts[i][1] = clamp(pts[i][1], 0, 1);
  }
  pts[pts.length - 1][1] = clamp(pts[pts.length - 1][1], 0.5, 1);
}

export function matchToTarget(
  ref: MatchFeatures,
  target: PixelImage | TargetModel,
  generic: PartialAdjustments,
  opts: MatchOptions = {},
): MatchResult {
  const t = 'lin' in target ? target : targetModel(target);
  const T = t.features;
  const keep = clamp(opts.keepExposure ?? MATCH.keepExposure, 0, 1);
  const maxIter = opts.maxIterations ?? MATCH.iterations;
  const warnings: string[] = [];
  const notes: string[] = [];
  const mono = ref.mono;
  const targetMono = T.mono;

  // --- Goals ---------------------------------------------------------------
  const tone = toneGoals(ref, T, keep);
  const plans = mono || targetMono ? [] : planBands(ref, t);
  const goals: MatchGoals = {
    lum: tone.lum,
    chromaMean: ref.chroma.mean,
    zones: ref.zones,
    shiftCapped: tone.capped,
  };
  const zoneOk = ref.zones.map((z) => !mono && z.s >= 0.02);
  // Zone tints steer only the target's originally neutral pixels; coloured pixels belong to the band
  // controls (and protected colours must not be "corrected" toward the reference's neutrals).
  const exclude = new Uint8Array(t.sample.n);
  let neutralCount = 0;
  for (let i = 0; i < t.sample.n; i++) {
    if (t.member[i] >= 0) exclude[i] = 1;
    else neutralCount++;
  }
  const zoneMinSupport = Math.max(0.01, (neutralCount / Math.max(1, t.sample.n)) * 0.05);
  const protGoal = plans.filter((p) => p.protected && p.share >= 0.05).map((p) => p.goalC);
  const zoneCap = protGoal.length
    ? clamp(
        MATCH.protectedTintShare * Math.min(...protGoal),
        MATCH.minZoneOffset,
        MATCH.maxZoneOffset,
      )
    : MATCH.maxZoneOffset;

  // --- Closed-form initial estimate ----------------------------------------
  // Tone: hue-preserving basic sliders take the bulk of the move; a gentle master curve takes the rest
  // (black lift beyond the Blacks slider's reach, exact quantiles) and is what the loop refines.
  const toneSliders = fitToneSliders(T.lum, tone.lum);
  const afterTone = T.lum.map((p) => toneShape(p, toneSliders));
  const anchorX: number[] = [];
  const anchorQ: number[] = [];
  for (const qi of MATCH.anchors) {
    const x = afterTone[qi];
    if (x <= 0.015 || x >= 0.985) continue;
    if (anchorX.length && x - anchorX[anchorX.length - 1] < 0.025) continue;
    anchorX.push(x);
    anchorQ.push(qi);
  }
  const A0 = clamp(afterTone[0], 0, 1);
  const A1 = clamp(afterTone[1], 0, 1);
  const A9 = clamp(afterTone[9], 0, 1);
  const A10 = clamp(afterTone[10], 0, 1);
  const lowSlope = clamp((tone.lum[1] - tone.lum[0]) / Math.max(0.02, A1 - A0), 0.2, 3);
  const highSlope = clamp((tone.lum[10] - tone.lum[9]) / Math.max(0.02, A10 - A9), 0.2, 3);
  const curve: CurvePoint[] = [
    [0, clamp(tone.lum[0] - A0 * lowSlope, 0, 0.35)],
    ...anchorX.map((x, i) => [x, tone.lum[anchorQ[i]]] as CurvePoint),
    [1, clamp(tone.lum[10] + (1 - A10) * highSlope, 0.5, 1)],
  ];
  enforceCurve(curve);

  let temperature = 0;
  let tint = 0;
  if (!mono && !targetMono) {
    const refK =
      MATCH.refCast *
      smoothstep(MATCH.minCastSupport, MATCH.fullCastSupport, ref.cast.s) *
      (1 - smoothstep(MATCH.castContentFrom, MATCH.castContentTo, ref.cast.s));
    // A cast measured on few pixels (e.g. dark hair in a portrait) is weak evidence: scale by support.
    const tgtK =
      MATCH.targetCast * smoothstep(MATCH.minCastSupport, MATCH.fullCastSupport, T.cast.s);
    const da = ref.cast.a * refK - T.cast.a * tgtK;
    const db = ref.cast.b * refK - T.cast.b * tgtK;
    if (Math.hypot(da, db) > 0.003) {
      const wb = inverseWhiteBalance(da, db);
      temperature = clamp(wb.temperature, -MATCH.maxTemperature, MATCH.maxTemperature);
      tint = clamp(wb.tint, -MATCH.maxTint, MATCH.maxTint);
    }
  }

  const g = mono ? 0 : targetMono ? 1 : globalChromaRatio(ref, T);
  // Global saturation carries the common part of the band changes (share-weighted geometric mean),
  // so band sliders hold only each colour's own difference and stay readable.
  const shareSum = plans.reduce((s, p) => s + p.share, 0);
  const gBands =
    shareSum > 0.4
      ? Math.exp(
          plans.reduce(
            (s, p) => s + p.share * Math.log(Math.max(1e-3, p.goalC) / Math.max(1e-3, p.CT)),
            0,
          ) / shareSum,
        )
      : g;
  const params: MatchParams = {
    tone: toneSliders,
    curve,
    temperature,
    tint,
    saturation: mono || targetMono ? 0 : clamp(gBands - 1, -0.9, 1),
    hsl: HSL_BANDS.map(() => ({ h: 0, s: 0, l: 0 })),
    zones: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    mono,
  };
  for (const p of plans) {
    const i = HSL_BANDS.indexOf(p.band);
    params.hsl[i].h = clamp((hueDiff(p.goalH, p.hT) / 30) * 0.9, -1, 1);
    params.hsl[i].s = clamp(
      p.goalC / Math.max(1e-4, p.CT) / Math.max(0.1, 1 + params.saturation) - 1,
      -1,
      1,
    );
  }

  // --- Closed loop -----------------------------------------------------------
  const base = mergeAdjustments(defaultAdjustments(), nonColour(generic));
  // Spatial effects do not change these statistics; leave them out of the trial renders.
  base.effects = defaultAdjustments().effects;
  base.presence = defaultAdjustments().presence;
  const full = (p: MatchParams) => mergeAdjustments(base, paramsToPartial(p));
  const disp = new Float32Array(t.lin.length);
  const res = allocSample(t.sample.n);
  const evaluate = (p: MatchParams) => {
    renderPixels(t.lin, full(p), disp);
    sampleFromDisplay(disp, res);
    const m = measure(res, t, plans, exclude);
    return { m, e: errorOf(m, goals, plans, zoneOk, mono, zoneMinSupport) };
  };

  const banded = plans.reduce((s, p) => s + p.count, 0) / Math.max(1, t.sample.n);
  let cur = evaluate(params);
  const initial = cur.e.total;
  let best = { params: structuredClone(params), e: cur.e };
  let iterations = 0;
  let converged = false;
  let stall = 0;
  const gain = MATCH.gain;
  for (let it = 0; it < maxIter; it++) {
    if (opts.shouldCancel?.()) throw new MatchCancelled('Cancelled');
    const m = cur.m;
    // Tone: move each curve anchor by its quantile error; endpoints by p1/p99.
    // Smoothed across neighbouring anchors, so the curve stays free of flat/steep wiggles (posterisation).
    const deltas = anchorQ.map((qi) => gain * (goals.lum[qi] - m.lum[qi]));
    deltas.forEach((_, j) => {
      const prev = deltas[Math.max(0, j - 1)];
      const next = deltas[Math.min(deltas.length - 1, j + 1)];
      params.curve[j + 1][1] += 0.25 * prev + 0.5 * deltas[j] + 0.25 * next;
    });
    params.curve[0][1] += gain * (goals.lum[0] - m.lum[0]);
    params.curve[params.curve.length - 1][1] += gain * (goals.lum[10] - m.lum[10]);
    enforceCurve(params.curve);
    if (!mono) {
      // Global chroma: only drives saturation when few pixels are covered by band controls.
      if (banded < 0.4 && !targetMono) {
        const r = Math.max(1e-3, goals.chromaMean) / Math.max(1e-3, m.chromaMean);
        params.saturation = clamp((1 + params.saturation) * Math.pow(r, gain * 0.7) - 1, -0.95, 1);
      }
      plans.forEach((p, k) => {
        const i = HSL_BANDS.indexOf(p.band);
        const r = m.bands[k];
        const hLim = p.protected ? MATCH.protectHue : 1;
        params.hsl[i].h = clamp(params.hsl[i].h + (gain * hueDiff(p.goalH, r.h)) / 30, -hLim, hLim);
        const ratio = Math.max(1e-3, p.goalC) / Math.max(1e-3, r.C);
        params.hsl[i].s = clamp(
          (1 + params.hsl[i].s) * Math.pow(ratio, gain) - 1,
          p.protected ? MATCH.protectSatMin : -1,
          p.protected ? MATCH.protectSatMax : 1,
        );
        if (p.k > 0)
          params.hsl[i].l = clamp(
            params.hsl[i].l + (gain * MATCH.bandLumWeight * p.k * (p.goalL - r.L)) / 0.16,
            -0.3,
            0.3,
          );
      });
      m.zones.forEach((z, i) => {
        if (!zoneOk[i] || z.s < zoneMinSupport) return;
        const o = params.zones[i];
        o[0] += gain * (goals.zones[i].a - z.a);
        o[1] += gain * (goals.zones[i].b - z.b);
        const c = Math.hypot(o[0], o[1]);
        if (c > zoneCap) {
          o[0] *= zoneCap / c;
          o[1] *= zoneCap / c;
        }
      });
    }
    cur = evaluate(params);
    iterations = it + 1;
    opts.onProgress?.(iterations, maxIter);
    const improved = cur.e.total < best.e.total;
    if (improved) {
      const rel = (best.e.total - cur.e.total) / Math.max(1e-6, best.e.total);
      best = { params: structuredClone(params), e: cur.e };
      stall = rel < 0.01 ? stall + 1 : 0;
    } else stall++;
    if (best.e.total < 0.6 || stall >= 2) {
      converged = true;
      break;
    }
  }

  // --- Explanations, notes and limits ----------------------------------------
  const final = best.params;
  const ex: Explanation[] = [];
  const i50 = LUM_QUANTILES.indexOf(0.5);
  const dMed = goals.lum[i50] - T.lum[i50];
  const spreadT = T.lum[9] - T.lum[1];
  const spreadR = goals.lum[9] - goals.lum[1];
  const toneBits: string[] = [];
  if (Math.abs(dMed) > 0.02)
    toneBits.push(
      `mid-tones ${dMed < 0 ? 'darker' : 'brighter'} (median ${Math.round(T.lum[i50] * 100)} → ${Math.round(goals.lum[i50] * 100)})`,
    );
  if (spreadR < spreadT - 0.05) toneBits.push('a softer, lower-contrast range');
  else if (spreadR > spreadT + 0.05) toneBits.push('more contrast');
  if (final.curve[0][1] > 0.02)
    toneBits.push(`blacks lifted to ${Math.round(final.curve[0][1] * 255)}/255`);
  if (final.curve[final.curve.length - 1][1] < 0.97) toneBits.push('highlights rolled off');
  const toneSet = TONE_KEYS.filter((k) => Math.abs(final.tone[k]) >= 0.05).map(
    (k) => `${k} ${final.tone[k] > 0 ? '+' : ''}${Math.round(final.tone[k] * 100)}`,
  );
  ex.push({
    area: 'Tone',
    text: `This photo's tonal distribution was moved toward the reference's: ${toneBits.join(', ') || 'only small changes'}. ${toneSet.length ? `Basic tone sliders (${toneSet.join(', ')}) do most of it without shifting hues; the tone curve fine-tunes the rest.` : 'The tone curve makes the change.'} ${keep > 0 ? `${Math.round(keep * 100)}% of the photo's own brightness difference was kept, since part of it belongs to the scene.` : 'Brightness follows the reference fully.'}`,
    basis: 'measured',
  });
  if (final.temperature !== 0 || final.tint !== 0) {
    ex.push({
      area: 'White balance',
      text: `Neutralised this photo's own ${T.cast.b > 0.004 ? 'warm' : T.cast.b < -0.004 ? 'cool' : 'neutral'} cast and applied the reference's ${ref.cast.b > 0.004 ? 'warm' : ref.cast.b < -0.004 ? 'cool' : 'neutral'} one: temperature ${final.temperature > 0 ? '+' : ''}${Math.round(final.temperature)}, tint ${final.tint > 0 ? '+' : ''}${Math.round(final.tint)}.`,
      basis: 'measured',
      weak: ref.cast.s < 0.08 || T.cast.s < 0.08,
    });
  }
  if (mono)
    ex.push({
      area: 'Colour',
      text: 'The reference is black and white, so this photo is converted to monochrome and only its tones are matched.',
      basis: 'measured',
    });
  else if (targetMono)
    notes.push('This photo is black and white, so only tone and tints can follow the reference.');
  else {
    ex.push({
      area: 'Saturation',
      text: `The reference's colour intensity is ${Math.round(g * 100)}% of this photo's; overall saturation ${Math.round(final.saturation * 100) > 0 ? '+' : ''}${Math.round(final.saturation * 100)}.`,
      basis: 'measured',
    });
    const bandLines: string[] = [];
    for (const p of plans) {
      const hp = final.hsl[HSL_BANDS.indexOf(p.band)];
      if (p.protected) {
        bandLines.push(
          `${BAND_LABEL[p.band]}: the reference has no similar colours, so their hue is held and they are only ${p.goalC < p.CT ? 'muted' : 'enriched'} with the rest of the image`,
        );
      } else {
        const dh = hueDiff(p.goalH, p.hT);
        const bits: string[] = [];
        if (Math.abs(dh) >= 3)
          bits.push(`shifted ${Math.round(Math.abs(dh))}° toward ${hueWord(p.goalH)}`);
        const cr = p.goalC / Math.max(1e-4, p.CT);
        if (cr < 0.85) bits.push(`muted to ${Math.round(cr * 100)}% intensity`);
        else if (cr > 1.15) bits.push(`${Math.round(cr * 100)}% richer`);
        if (Math.abs(hp.l) >= 0.05) bits.push(hp.l < 0 ? 'darker' : 'lighter');
        if (bits.length)
          bandLines.push(
            `${BAND_LABEL[p.band]} ${bits.join(', ')} to match the reference's ${hueWord(p.refH)}s`,
          );
      }
    }
    if (bandLines.length)
      ex.push({ area: 'HSL', text: `${bandLines.join('. ')}.`, basis: 'measured' });
    const zoneNames = ['Shadows', 'Midtones', 'Highlights'];
    final.zones.forEach((o, i) => {
      const C = Math.hypot(o[0], o[1]);
      if (C < 0.004) return;
      const w = wheel(o);
      ex.push({
        area: `${zoneNames[i]} grade`,
        text: `A ${hueWord(w.hue)} tint (${Math.round(w.saturation)}) brings this photo's neutral ${zoneNames[i].toLowerCase()} to the reference's colour.`,
        basis: 'measured',
        weak: ref.zones[i].s < 0.06,
      });
    });
    const prot = plans.filter((p) => p.protected);
    if (prot.length)
      notes.push(
        `Protected colours the reference lacks (${prot.map((p) => BAND_LABEL[p.band].toLowerCase()).join(', ')}): their hue stays close to the original.`,
      );
    if (ref.chromatic < 0.05)
      notes.push(
        "The reference has very few colours, so this photo's colours were muted rather than recoloured.",
      );
  }
  ex.push({
    area: 'Refinement',
    text: `Rendered this photo ${iterations + 1} times at low resolution and corrected the settings after each pass; mismatch score ${initial.toFixed(1)} → ${best.e.total.toFixed(1)} (0 = identical statistics).`,
    basis: 'measured',
  });

  // Honest limits.
  const refNight = ref.lum[i50] < 0.2 && ref.chroma.p90 > 0.12;
  const tgtNight = T.lum[i50] < 0.2 && T.chroma.p90 > 0.12;
  if (refNight !== tgtNight)
    warnings.push(
      'One image is a night or neon scene and the other is not, so a close match is unlikely.',
    );
  if (tone.capped)
    warnings.push(
      `The reference is much ${dMed < 0 ? 'darker' : 'brighter'} than this photo; brightness was moved only part of the way, because the rest belongs to the scene.`,
    );
  // Protected colours that still drifted (e.g. pushed toward pink by the white balance).
  const lastM = evaluate(final).m;
  plans.forEach((p, k) => {
    if (!p.protected) return;
    const drift = Math.abs(hueDiff(lastM.bands[k].h, p.hT));
    if (drift > 12)
      warnings.push(
        `${BAND_LABEL[p.band]} shift by about ${Math.round(drift)}° under this look; check them and adjust the ${p.band} hue slider if needed.`,
      );
  });
  if (best.e.tone > 6)
    warnings.push(
      'The tonal range could not be matched closely (the photos differ too much in contrast or exposure).',
    );
  const atLimit = plans.filter(
    (p) => !p.protected && Math.abs(final.hsl[HSL_BANDS.indexOf(p.band)].s) >= 0.99,
  );
  if (atLimit.length)
    warnings.push(
      `${atLimit.map((p) => BAND_LABEL[p.band]).join(', ')} reached the saturation slider's limit, so they match only partly.`,
    );

  const adjustments = PartialAdjustmentsSchema.parse({
    ...paramsToPartial(final),
    ...nonColour(generic),
  }) as PartialAdjustments;
  return {
    adjustments,
    explanations: ex,
    warnings,
    notes,
    plans,
    iterations,
    converged,
    error: { initial: round(initial, 2), final: round(best.e.total, 2) },
  };
}

export { LUM_QUANTILES };
