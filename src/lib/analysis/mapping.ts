/**
 * Deterministic mapping: reference statistics (+ optional AI interpretation)
 * -> editable preset in the editor's own adjustment schema.
 *
 * Principles (see docs/AI_ARCHITECTURE.md for the full table):
 *  - Every numeric value comes from measurements through fixed formulas.
 *    The vision model never provides slider values; its categorical judgements
 *    only gate ambiguous aspects (grain, vignette, softness) or apply small,
 *    documented nudges (skin, greens, blues).
 *  - Measurements are compared against a canonical "neutral, well-exposed
 *    photo" so the preset captures the reference's *departure* from neutral,
 *    and is reusable on other photos.
 *  - Scene exposure is mostly NOT transferred (only 35% of the median shift,
 *    as mood). Brightness matching is a separate, optional target adaptation.
 *  - All outputs are clamped and validated with the preset schema.
 */
import type { StyleInterpretation } from '@shared/ai-schema';
import { HSL_BANDS, PartialAdjustmentsSchema, normalizeCurve, type CurvePoint, type HslBandName, type PartialAdjustments } from '../schema/adjustments';
import { whiteBalanceMultipliers } from '../color/whiteBalance';
import { linearSrgbToOklab } from '../color/oklab';
import { srgbToLinear } from '../color/srgb';
import type { ImageStats } from './stats';

export const CANONICAL = {
  percentiles: { p5: 0.07, p25: 0.27, p50: 0.46, p75: 0.66, p95: 0.88 },
  blackFloor: 0.03,
  whiteCeiling: 0.96,
  chromaP50: 0.055,
  bandChroma: { red: 0.13, orange: 0.1, yellow: 0.1, green: 0.09, aqua: 0.08, blue: 0.09, purple: 0.09, magenta: 0.11 } as Record<HslBandName, number>,
  bandL: { red: 0.55, orange: 0.66, yellow: 0.8, green: 0.56, aqua: 0.62, blue: 0.56, purple: 0.5, magenta: 0.58 } as Record<HslBandName, number>,
};

export const MAPPING = {
  curveStrength: 0.8,
  moodTransfer: 0.35,
  wbStrength: 0.8,
  gradeChroma: 0.11,
  gradeGain: 1.15,
  gradeMinChroma: 0.006,
  gradeMinSupport: 0.03,
  satGain: 40,
  bandSatGain: 50,
  bandSatWeight: 0.6,
  bandLumGain: 120,
  bandLumWeight: 0.4,
  bandHueWeight: 0.6,
  bandMinShare: 0.04,
  grainBaseline: 0.006,
  grainScale: 0.012,
};

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface Explanation {
  area: string;
  text: string;
  basis: 'measured' | 'interpreted' | 'measured+interpreted';
  weak?: boolean;
}

export interface MappingResult {
  adjustments: PartialAdjustments;
  explanations: Explanation[];
  confidence: ConfidenceLevel;
  warnings: string[];
  description: string;
  descriptionSource: 'ai' | 'measured';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const toY = (p: number) => srgbToLinear(clamp(p, 0, 1));

/** Oklab a/b cast that WB(temperature, tint) produces on a mid-grey. */
function castFor(temperature: number, tint: number): [number, number] {
  const [r, g, b] = whiteBalanceMultipliers(temperature, tint);
  const [, a, bb] = linearSrgbToOklab(0.18 * r, 0.18 * g, 0.18 * b);
  return [a, bb];
}

/** Inverse white balance: temperature/tint whose cast best matches (a, b). Deterministic grid + refine. */
export function inverseWhiteBalance(a: number, b: number): { temperature: number; tint: number } {
  let best = { temperature: 0, tint: 0, err: Infinity };
  const search = (tc: number, gc: number, span: number, step: number) => {
    for (let t = tc - span; t <= tc + span; t += step)
      for (let g = gc - span; g <= gc + span; g += step) {
        const tt = clamp(t, -100, 100);
        const gg = clamp(g, -100, 100);
        const [ca, cb] = castFor(tt, gg);
        const err = (ca - a) ** 2 + (cb - b) ** 2;
        if (err < best.err) best = { temperature: tt, tint: gg, err };
      }
  };
  search(0, 0, 100, 10);
  search(best.temperature, best.tint, 10, 2);
  search(best.temperature, best.tint, 2, 0.5);
  return { temperature: best.temperature, tint: best.tint };
}

function hueName(h: number): string {
  const names: [number, string][] = [
    [20, 'red'], [45, 'orange'], [70, 'amber'], [100, 'yellow'], [140, 'green'], [175, 'teal'],
    [205, 'cyan'], [250, 'blue'], [290, 'purple'], [330, 'magenta'], [360, 'pink'],
  ];
  for (const [limit, name] of names) if (h <= limit) return name;
  return 'red';
}

const AI_HUE_DEG: Record<string, number> = {
  red: 25, orange: 50, amber: 70, yellow: 100, green: 140, teal: 185, cyan: 205, blue: 255, purple: 300, magenta: 340, pink: 0,
};
const AI_STRENGTH_SAT: Record<string, number> = { none: 0, subtle: 8, moderate: 16, strong: 26 };

export function mapReferenceToPreset(stats: ImageStats, ai: StyleInterpretation | null): MappingResult {
  const ex: Explanation[] = [];
  const warnings: string[] = [];
  const adj: PartialAdjustments = {};
  const pc = stats.percentiles;

  // --- Reliability flags -------------------------------------------------
  let confidence: ConfidenceLevel = ai ? (ai.confidence === 'low' ? 'low' : ai.confidence === 'medium' ? 'medium' : 'high') : 'medium';
  const lower = (to: ConfidenceLevel) => {
    if (to === 'low' || (to === 'medium' && confidence === 'high')) confidence = to;
  };
  const aiWarn = new Set(ai?.contentWarnings ?? []);
  if (stats.flags.screenshotLikely || aiWarn.has('screenshot_ui')) {
    warnings.push('This looks like a screenshot with interface elements. Crop to the photo itself for a cleaner match.');
    lower('low');
  }
  if (stats.flags.multiplePhotosLikely || aiWarn.has('multiple_photos')) {
    warnings.push('The image may contain several photos. Crop to the one whose look you want.');
    lower('low');
  }
  if (stats.flags.illustrationLikely || aiWarn.has('illustration_or_render') || aiWarn.has('not_a_photo')) {
    warnings.push('This looks like an illustration or render, not a photograph. Colour relationships may not transfer well.');
    lower('low');
  }
  if (stats.flags.lowResolution || aiWarn.has('very_low_quality')) {
    warnings.push('The reference is small or heavily compressed, so fine texture (grain, sharpness) cannot be judged.');
    lower('medium');
  }
  if (aiWarn.has('heavy_text_overlay')) warnings.push('Text overlays can skew colour measurements. Crop them out if possible.');
  if (aiWarn.has('mixed_lighting')) {
    warnings.push('Mixed lighting in the reference makes the white balance ambiguous.');
    lower('medium');
  }
  const night = stats.flags.nightLikely || aiWarn.has('night_or_neon') || ai?.sceneType === 'night';
  if (night) warnings.push('Night or neon scene: much of its look comes from the light sources themselves and will not fully transfer to daylight photos.');
  if (stats.flags.underexposed) warnings.push('The reference is very dark, so shadow colour estimates are less reliable.');
  if (stats.flags.overexposed) warnings.push('The reference has large clipped highlights, so highlight colour estimates are less reliable.');

  // --- Tone curve ----------------------------------------------------------
  const medianShift = pc.p50 - CANONICAL.percentiles.p50;
  const moodShift = medianShift * MAPPING.moodTransfer;
  const strength = MAPPING.curveStrength * (night ? 0.5 : 1);
  const can = CANONICAL.percentiles;
  const qs: [number, number][] = [
    [can.p5, pc.p5],
    [can.p25, pc.p25],
    [can.p50, pc.p50],
    [can.p75, pc.p75],
    [can.p95, pc.p95],
  ];
  const pts: CurvePoint[] = [];
  const blackLift = stats.blackFloor > 0.055 || ai?.tone.blacks === 'lifted' || ai?.tone.blacks === 'faded'
    ? clamp((stats.blackFloor - CANONICAL.blackFloor) * 0.9, 0, 0.22)
    : 0;
  const rolloff = stats.whiteCeiling < 0.9 ? clamp((CANONICAL.whiteCeiling - stats.whiteCeiling) * 0.9, 0, 0.25) : 0;
  pts.push([0, round(blackLift, 3)]);
  for (const [x, refY] of qs) {
    // Remove most of the scene's exposure (keep the tonal *shape*), keep part as mood.
    const shaped = refY - medianShift + moodShift;
    pts.push([x, round(clamp(x + strength * (shaped - x), 0, 1), 3)]);
  }
  pts.push([1, round(1 - rolloff, 3)]);
  // Enforce non-decreasing output with a small gap.
  for (let i = 1; i < pts.length; i++) pts[i][1] = Math.max(pts[i][1], pts[i - 1][1] + 0.004);
  for (const p of pts) p[1] = clamp(p[1], 0, 1);
  const curve = normalizeCurve(pts);
  const curveChanges = curve.some(([x, y]) => Math.abs(x - y) > 0.012);
  if (curveChanges) {
    adj.curves = { master: curve };
    const desc: string[] = [];
    const refSpread = pc.p95 - pc.p5;
    const canSpread = can.p95 - can.p5;
    if (refSpread > canSpread + 0.06) desc.push('more contrast than a neutral photo');
    else if (refSpread < canSpread - 0.08) desc.push('a compressed, low-contrast tonal range');
    if (blackLift > 0.01) desc.push(`blacks lifted to ${Math.round(blackLift * 255)}/255 (matte)`);
    if (rolloff > 0.01) desc.push('highlights rolled off below white');
    if (Math.abs(moodShift) > 0.02) desc.push(medianShift < 0 ? 'a darker overall mood' : 'a brighter, airier mood');
    ex.push({
      area: 'Tone curve',
      text: `Shaped from the reference's tonal distribution: ${desc.join(', ') || 'a gentle tonal shift'}. Most of the scene's own exposure is not copied.`,
      basis: 'measured',
    });
  }

  // --- White balance (global cast of near-neutrals) ------------------------
  const castC = Math.hypot(stats.cast.a, stats.cast.b);
  if (stats.cast.support > 0.05 && castC > 0.004 && !stats.monochrome) {
    // Night/neon references: the "cast" is mostly the light sources, so transfer only half.
    const k = MAPPING.wbStrength * (night ? 0.5 : 1);
    const wb = inverseWhiteBalance(stats.cast.a * k, stats.cast.b * k);
    adj.basic = { ...adj.basic, temperature: round(clamp(wb.temperature, -60, 60)), tint: round(clamp(wb.tint, -40, 40)) };
    ex.push({
      area: 'White balance',
      text: `Neutral tones in the reference lean ${stats.cast.b > 0 ? 'warm' : 'cool'}${Math.abs(stats.cast.a) > 0.004 ? (stats.cast.a > 0 ? ' and magenta' : ' and green') : ''}; temperature ${wb.temperature > 0 ? '+' : ''}${Math.round(wb.temperature)}, tint ${wb.tint > 0 ? '+' : ''}${Math.round(wb.tint)}.`,
      basis: ai ? 'measured+interpreted' : 'measured',
      weak: stats.cast.support < 0.12,
    });
  } else if (ai && !stats.monochrome && (ai.color.temperatureFeel === 'warm' || ai.color.temperatureFeel === 'cool')) {
    ex.push({ area: 'White balance', text: `The model reads the look as ${ai.color.temperatureFeel}, but there are too few neutral tones to measure a cast, so white balance is left unchanged.`, basis: 'interpreted', weak: true });
  }

  // --- Colour grading (zone tints relative to the global cast) -------------
  const grading: NonNullable<PartialAdjustments['grading']> = {};
  const zoneDefs = [
    { key: 'shadows' as const, z: stats.shadows, aiTint: ai?.color.shadowTint, scale: 1 },
    { key: 'midtones' as const, z: stats.midtones, aiTint: ai?.color.midtoneTint, scale: 0.5 },
    { key: 'highlights' as const, z: stats.highlights, aiTint: ai?.color.highlightTint, scale: 1 },
  ];
  const wbK = MAPPING.wbStrength * (night ? 0.5 : 1);
  const castUsed = adj.basic?.temperature !== undefined ? { a: stats.cast.a * wbK, b: stats.cast.b * wbK } : { a: 0, b: 0 };
  for (const { key, z, aiTint, scale } of zoneDefs) {
    const da = z.a - castUsed.a;
    const db = z.b - castUsed.b;
    const C = Math.hypot(da, db);
    let hue = (Math.atan2(db, da) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    const measured = z.support >= MAPPING.gradeMinSupport && C >= MAPPING.gradeMinChroma && !stats.monochrome;
    if (measured) {
      const sat = clamp((C / MAPPING.gradeChroma) * 100 * MAPPING.gradeGain * scale, 0, 60);
      grading[key] = { hue: round(hue), saturation: round(sat, 1) };
      const aiHue = aiTint && aiTint.hue !== 'none' ? AI_HUE_DEG[aiTint.hue] : undefined;
      const agrees = aiHue === undefined ? undefined : Math.abs(((hue - aiHue + 540) % 360) - 180) < 60;
      ex.push({
        area: `${key[0].toUpperCase()}${key.slice(1)} grade`,
        text: `Measured a ${hueName(hue)} tint in the ${key} (${round(C * 1000)} units)${agrees === false ? `; the model saw ${aiTint!.hue}, so treat this as approximate` : ''}.`,
        basis: agrees ? 'measured+interpreted' : 'measured',
        weak: agrees === false || z.support < 0.08,
      });
    } else if (aiTint && aiTint.hue !== 'none' && aiTint.strength !== 'none' && ai && ai.confidence !== 'low' && !stats.monochrome) {
      // Measurement inconclusive (few neutral pixels): use the model's reading at half strength.
      grading[key] = { hue: AI_HUE_DEG[aiTint.hue], saturation: round(AI_STRENGTH_SAT[aiTint.strength] * 0.5 * scale, 1) };
      ex.push({ area: `${key[0].toUpperCase()}${key.slice(1)} grade`, text: `Too few neutral tones to measure; using the model's reading (${aiTint.strength} ${aiTint.hue}) at reduced strength.`, basis: 'interpreted', weak: true });
    }
  }
  if (Object.keys(grading).length) adj.grading = { ...grading, blending: 55 };

  // --- Saturation / monochrome ---------------------------------------------
  if (stats.monochrome || ai?.color.saturationFeel === 'monochrome') {
    if (stats.monochrome) {
      adj.basic = { ...adj.basic, monochrome: 100 };
      ex.push({ area: 'Colour', text: 'The reference is black and white.', basis: 'measured' });
    } else {
      warnings.push('The model reads the reference as monochrome but it still has measurable colour; colour was kept.');
    }
  } else {
    const ratio = Math.max(0.05, stats.chroma.p50) / CANONICAL.chromaP50;
    const sat = clamp(MAPPING.satGain * Math.log2(ratio), -60, 30);
    if (Math.abs(sat) >= 4) {
      adj.basic = { ...adj.basic, saturation: round(sat) };
      ex.push({ area: 'Saturation', text: `Overall colour intensity is ${sat < 0 ? 'lower' : 'higher'} than a neutral photo (${Math.round(ratio * 100)}%).`, basis: 'measured' });
    }
  }

  // --- HSL bands ------------------------------------------------------------
  if (!stats.monochrome) {
    const globalRatio = Math.max(0.05, stats.chroma.p50) / CANONICAL.chromaP50;
    const hsl: NonNullable<PartialAdjustments['hsl']> = {};
    const skinPresent = stats.skin.fraction > 0.02 || (ai ? ai.color.skin !== 'not_present' : false);
    const notes: string[] = [];
    for (const band of HSL_BANDS) {
      const b = stats.bands[band];
      if (b.share < MAPPING.bandMinShare) continue;
      const rel = b.meanChroma / CANONICAL.bandChroma[band] / globalRatio;
      let s = clamp(MAPPING.bandSatGain * Math.log2(Math.max(0.1, rel)), -45, 30) * MAPPING.bandSatWeight;
      let l = clamp((b.meanL - CANONICAL.bandL[band]) * MAPPING.bandLumGain, -35, 35) * MAPPING.bandLumWeight;
      let h = clamp((b.hueOffset / 30) * 100 * MAPPING.bandHueWeight, -35, 35);
      if (skinPresent && (band === 'orange' || band === 'red')) {
        // Preserve natural skin: limit hue rotation and saturation swings.
        h = clamp(h, -10, 10);
        s = clamp(s, -20, 12);
        l = clamp(l, -10, 15);
      }
      const entry = { hue: round(h), saturation: round(s), luminance: round(l) };
      if (Math.abs(entry.hue) >= 3 || Math.abs(entry.saturation) >= 4 || Math.abs(entry.luminance) >= 4) {
        hsl[band] = entry;
        if (Math.abs(entry.saturation) >= 8) notes.push(`${band} ${entry.saturation < 0 ? 'muted' : 'richer'}`);
      }
    }
    // Small, documented nudges from the model's qualitative reading.
    if (ai) {
      const nudge = (band: HslBandName, patch: Partial<{ hue: number; saturation: number; luminance: number }>, why: string) => {
        const cur = hsl[band] ?? { hue: 0, saturation: 0, luminance: 0 };
        hsl[band] = {
          hue: clamp((cur.hue ?? 0) + (patch.hue ?? 0), -40, 40),
          saturation: clamp(patch.saturation !== undefined ? (patch.saturation < 0 ? Math.min(cur.saturation ?? 0, patch.saturation) : Math.max(cur.saturation ?? 0, patch.saturation)) : (cur.saturation ?? 0), -60, 40),
          luminance: clamp((cur.luminance ?? 0) + (patch.luminance ?? 0), -40, 40),
        };
        notes.push(why);
      };
      const greensPresent = stats.bands.green.share + stats.bands.yellow.share > 0.03;
      if (greensPresent) {
        if (ai.color.greens === 'subdued') nudge('green', { saturation: -20 }, 'greens subdued (model)');
        if (ai.color.greens === 'vivid') nudge('green', { saturation: 12 }, 'greens vivid (model)');
        if (ai.color.greens === 'shifted_yellow') nudge('green', { hue: -12 }, 'greens pushed toward yellow (model)');
        if (ai.color.greens === 'shifted_teal') nudge('green', { hue: 15 }, 'greens pushed toward teal (model)');
      }
      if (stats.bands.blue.share + stats.bands.aqua.share > 0.03) {
        if (ai.color.blues === 'subdued') nudge('blue', { saturation: -18 }, 'blues subdued (model)');
        if (ai.color.blues === 'shifted_teal') nudge('blue', { hue: -12 }, 'blues pushed toward teal (model)');
        if (ai.color.blues === 'shifted_purple') nudge('blue', { hue: 12 }, 'blues pushed toward purple (model)');
      }
      if (skinPresent) {
        if (ai.color.skin === 'golden') nudge('orange', { hue: -4, saturation: 8 }, 'golden skin (model)');
        if (ai.color.skin === 'pale') nudge('orange', { saturation: -10, luminance: 8 }, 'pale skin (model)');
        if (ai.color.skin === 'desaturated') nudge('orange', { saturation: -15 }, 'desaturated skin (model)');
      }
    }
    if (Object.keys(hsl).length) {
      adj.hsl = hsl;
      ex.push({ area: 'HSL', text: notes.length ? `Per-colour adjustments: ${notes.join(', ')}.` : 'Small per-colour adjustments from the reference palette.', basis: ai ? 'measured+interpreted' : 'measured', weak: true });
    }
  }

  // --- Grain (needs measurement AND, when available, model confirmation) ----
  const grainScore = stats.grain === null ? 0 : (stats.grain - MAPPING.grainBaseline) / MAPPING.grainScale;
  const aiGrain = ai?.texture.grain;
  if (!stats.flags.lowResolution) {
    if (aiGrain && aiGrain !== 'none' && aiGrain !== 'uncertain' && grainScore > 0.2) {
      const amount = aiGrain === 'fine' ? 14 : aiGrain === 'moderate' ? 24 : 36;
      adj.effects = { ...adj.effects, grain: amount, grainSize: aiGrain === 'fine' ? 15 : aiGrain === 'moderate' ? 30 : 50, grainRoughness: 55 };
      ex.push({ area: 'Grain', text: `${aiGrain[0].toUpperCase()}${aiGrain.slice(1)} grain: measured texture in flat areas and confirmed by the model.`, basis: 'measured+interpreted' });
    } else if (!ai && grainScore > 1) {
      adj.effects = { ...adj.effects, grain: round(clamp(10 + grainScore * 8, 10, 30)), grainSize: 25, grainRoughness: 50 };
      ex.push({ area: 'Grain', text: 'Noticeable texture in flat areas. It could also be sensor noise or JPEG artefacts.', basis: 'measured', weak: true });
    } else if (aiGrain === 'uncertain' || (grainScore > 0.4 && aiGrain === 'none')) {
      ex.push({ area: 'Grain', text: 'Possible grain, but it may be compression noise. Not added; use the Grain slider if you want it.', basis: 'measured+interpreted', weak: true });
    }
  }

  // --- Vignette (corner falloff, gated) ------------------------------------
  const v = stats.vignette;
  const falloff = 1 - v.ratio;
  const aiVig = ai?.texture.vignette;
  if (falloff > 0.12 && v.symmetry > 0.6 && (aiVig === 'subtle' || aiVig === 'strong' || (!ai && falloff > 0.3))) {
    const amount = -round(clamp(falloff * 110, 8, 45));
    adj.effects = { ...adj.effects, vignette: amount, vignetteFeather: 70, vignetteMidpoint: 40 };
    ex.push({ area: 'Vignette', text: `Corners are ${Math.round(falloff * 100)}% darker than the centre and evenly so${ai ? ', and the model sees a vignette' : ''}.`, basis: ai ? 'measured+interpreted' : 'measured', weak: !ai });
  } else if (falloff > 0.2 && aiVig !== 'none' && aiVig !== undefined) {
    ex.push({ area: 'Vignette', text: 'Corners are darker, but this may be the scene rather than a vignette. Not added.', basis: 'measured+interpreted', weak: true });
  }

  // --- Softness (model only, small) ----------------------------------------
  if (ai && ai.confidence !== 'low') {
    if (ai.texture.softness === 'dreamy_glow') adj.presence = { clarity: -22, texture: -10 };
    else if (ai.texture.softness === 'soft') adj.presence = { clarity: -10 };
    else if (ai.texture.softness === 'crisp') adj.presence = { clarity: 10, texture: 8 };
    if (adj.presence) ex.push({ area: 'Presence', text: `The model reads the rendering as ${ai.texture.softness.replace('_', ' ')}.`, basis: 'interpreted', weak: true });
  }

  if (!ai) lower('medium');
  const validated = PartialAdjustmentsSchema.parse(adj) as PartialAdjustments;
  const description = ai ? ai.styleSummary : describeStyle(stats);
  return { adjustments: validated, explanations: ex, confidence, warnings, description, descriptionSource: ai ? 'ai' : 'measured' };
}

/** Plain-language description built from measurements only (used without AI). */
export function describeStyle(s: ImageStats): string {
  const parts: string[] = [];
  const pc = s.percentiles;
  const mood = pc.p50 < 0.3 ? 'Dark low-key' : pc.p50 > 0.62 ? 'Bright airy' : 'Balanced';
  const spread = pc.p95 - pc.p5;
  const contrast = spread > 0.86 ? 'high-contrast' : spread < 0.62 ? 'soft, low-contrast' : 'moderate-contrast';
  if (s.monochrome) parts.push(`${mood}, ${contrast} black-and-white image`);
  else {
    const satRatio = s.chroma.p50 / CANONICAL.chromaP50;
    const sat = satRatio < 0.7 ? 'muted colour' : satRatio > 1.4 ? 'vivid colour' : 'natural colour';
    parts.push(`${mood}, ${contrast} look with ${sat}`);
  }
  const tintText = (z: { a: number; b: number; support: number }, label: string) => {
    const C = Math.hypot(z.a - s.cast.a, z.b - s.cast.b);
    if (z.support < 0.03 || C < 0.008) return null;
    let h = (Math.atan2(z.b - s.cast.b, z.a - s.cast.a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return `${hueName(h)}-tinted ${label}`;
  };
  if (!s.monochrome) {
    const castC = Math.hypot(s.cast.a, s.cast.b);
    if (castC > 0.006) parts.push(s.cast.b > 0 ? 'warm overall cast' : 'cool overall cast');
    const st = tintText(s.shadows, 'shadows');
    const ht = tintText(s.highlights, 'highlights');
    if (st) parts.push(st);
    if (ht) parts.push(ht);
    if (s.bands.green.share > 0.06 && s.bands.green.meanChroma < CANONICAL.bandChroma.green * 0.75) parts.push('subdued greens');
    if (s.skin.fraction > 0.04) parts.push(s.skin.C > 0.09 ? 'warm, rich skin tones' : 'soft skin tones');
  }
  if (s.blackFloor > 0.06) parts.push('lifted, matte blacks');
  else if (s.clippedShadows > 0.05) parts.push('crushed blacks');
  if (s.whiteCeiling < 0.9) parts.push('controlled highlights');
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Mean linear luminance helper for adaptation. */
export function medianY(s: ImageStats) {
  return toY(s.percentiles.p50);
}
