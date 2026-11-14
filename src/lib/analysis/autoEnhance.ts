/**
 * Auto (Light): one tap that balances the photo as it looks right now.
 *
 * Measured, with fixed rules and no AI. The photo's pixel sample is rendered with the current
 * settings through the CPU pipeline, and the result decides ordinary slider changes:
 *
 *  - exposure and white balance come from the adaptive-look fit against a neutral, well-exposed
 *    photo (`adaptLook`: part of the way only, highlights and shadows guarded), with the white
 *    balance halved again so a real sunset keeps its warmth;
 *  - then, on the corrected render: bright highlights are pulled back, heavy shadows opened, a
 *    flat photo gets contrast, a raised black point is set, and dull colour gets vibrance.
 *
 * With no look on, the values are absolute (Auto sets the sliders, it doesn't nudge them), so
 * pressing it again changes nothing. On top of a look it sets the exposure and eases highlights
 * and shadows, and leaves the look's contrast and colour alone.
 */
import { linearSrgbToOklab } from '../color/oklab';
import { srgbToLinear } from '../color/srgb';
import { RANGES, defaultAdjustments, type Adjustments } from '../schema/adjustments';
import { adaptLook } from './lookAdapt';
import { renderPixels } from './match';

export const AUTO = {
  /** Share of the adaptive white-balance offset that Auto applies. */
  wbShare: 0.5,
  /** Highlights come down when the brightest 1% is above this (display lightness, 0..1). */
  highlightAt: 0.93,
  maxHighlights: 45,
  /** Shadows open when more than this share of the photo is darker than `shadowBelow`. */
  shadowShare: 0.2,
  shadowBelow: 0.15,
  maxShadows: 40,
  /** Contrast is added when the 5%–95% spread is below this. */
  flatSpread: 0.5,
  maxContrast: 22,
  /** The black point is set when the darkest 1% sits above this. */
  blackAt: 0.05,
  maxBlacks: 18,
  /** Mean chroma below which colour gets a strong / a light vibrance lift. */
  dull: 0.05,
  quiet: 0.09,
} as const;

export type AutoKey = 'exposure' | 'temperature' | 'tint' | 'contrast' | 'highlights' | 'shadows' | 'blacks' | 'vibrance';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Stats {
  p01: number;
  p05: number;
  p95: number;
  p99: number;
  darkShare: number;
  meanChroma: number;
}

function stats(lin: Float32Array, adj: Adjustments, buf: Float32Array): Stats {
  const d = renderPixels(lin, adj, buf);
  const n = d.length / 3;
  const lum = new Float32Array(n);
  let dark = 0;
  let sumC = 0;
  for (let i = 0; i < n; i++) {
    const r = clamp(d[i * 3], 0, 1);
    const g = clamp(d[i * 3 + 1], 0, 1);
    const b = clamp(d[i * 3 + 2], 0, 1);
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum[i] < AUTO.shadowBelow) dark++;
    const [, a, bb] = linearSrgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
    sumC += Math.hypot(a, bb);
  }
  lum.sort();
  const at = (q: number) => lum[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))] ?? 0;
  return { p01: at(0.01), p05: at(0.05), p95: at(0.95), p99: at(0.99), darkShare: dark / n, meanChroma: sumC / n };
}

const ALL_KEYS: AutoKey[] = ['exposure', 'contrast', 'highlights', 'shadows', 'blacks', 'temperature', 'tint', 'vibrance'];

const finish = (key: AutoKey, v: number) => {
  const range = RANGES.basic[key];
  const c = clamp(v, range.min, range.max);
  return key === 'exposure' ? Math.round(c * 100) / 100 : Math.round(c);
};

/**
 * The Light values Auto sets (only keys whose value would change).
 *
 * With no look on (`colour` true) they are absolute, like any editor's Auto: measured with those
 * sliders at zero and the rest of the edit (curves, colour mix, grade) as it is, so pressing Auto
 * twice gives the same answer.
 *
 * On top of a look (`colour` false) the look stays in charge: its contrast, black point and colour
 * are left alone. Auto sets the exposure, and adds to the look's highlights and shadows only when
 * the result still needs it.
 *
 * @param lin      linear-RGB pixels of the photo (3 floats each).
 * @param current  the settings in effect now.
 */
export function autoEnhance(lin: Float32Array, current: Adjustments, colour = true): Partial<Record<AutoKey, number>> {
  if (lin.length < 3) return {};
  const buf = new Float32Array(lin.length);
  const next: Partial<Record<AutoKey, number>> = {};

  if (!colour) {
    const zeroed: Adjustments = { ...current, basic: { ...current.basic, exposure: 0 } };
    next.exposure = adaptLook(lin, zeroed, defaultAdjustments()).exposure;
    const s = stats(lin, { ...zeroed, basic: { ...zeroed.basic, exposure: next.exposure } }, buf);
    if (s.p99 > AUTO.highlightAt) next.highlights = current.basic.highlights - Math.min(AUTO.maxHighlights, Math.round((s.p99 - AUTO.highlightAt) * 500) + 10);
    if (s.darkShare > AUTO.shadowShare * 1.5) next.shadows = current.basic.shadows + Math.min(AUTO.maxShadows, Math.round(s.darkShare * 40));
  } else {
    const withColour = current.basic.monochrome < 100;
    const keys = withColour ? ALL_KEYS : ALL_KEYS.slice(0, 5);
    for (const k of keys) next[k] = 0;
    const zeroed: Adjustments = { ...current, basic: { ...current.basic, ...next } };
    const fit = adaptLook(lin, zeroed, defaultAdjustments());
    next.exposure = fit.exposure;
    if (withColour) {
      next.temperature = Math.round(fit.temperature * AUTO.wbShare);
      next.tint = Math.round(fit.tint * AUTO.wbShare);
    }
    const s = stats(lin, { ...zeroed, basic: { ...zeroed.basic, ...next } }, buf);
    if (s.p99 > AUTO.highlightAt) next.highlights = -Math.min(AUTO.maxHighlights, Math.round((s.p99 - AUTO.highlightAt) * 500) + 10);
    if (s.darkShare > AUTO.shadowShare) next.shadows = Math.min(AUTO.maxShadows, Math.round(s.darkShare * 70));
    const spread = s.p95 - s.p05;
    if (spread < AUTO.flatSpread) next.contrast = Math.min(AUTO.maxContrast, Math.round((AUTO.flatSpread - spread) * 90));
    if (s.p01 > AUTO.blackAt) next.blacks = -Math.min(AUTO.maxBlacks, Math.round((s.p01 - 0.02) * 220));
    if (withColour) next.vibrance = s.meanChroma < AUTO.dull ? 16 : s.meanChroma < AUTO.quiet ? 10 : 0;
  }

  const out: Partial<Record<AutoKey, number>> = {};
  for (const key of Object.keys(next) as AutoKey[]) {
    const v = finish(key, next[key] ?? 0);
    if (v !== current.basic[key]) out[key] = v;
  }
  return out;
}
