/**
 * Preset application with intensity.
 *
 * A preset is a partial set of adjustments. Applying it at amount t (0..1)
 * moves each field the preset defines from the photo's baseline value toward
 * the preset's value. Fields the user edits by hand after applying are
 * recorded as overrides and keep their manual value when the amount changes.
 * Colour-wheel hue/saturation pairs are blended in Cartesian space so hue
 * never spins the long way around.
 */
import { blendCurves } from '../color/curves';
import {
  GRADE_ZONES,
  getPath,
  leafPaths,
  mergeAdjustments,
  setPath,
  type Adjustments,
  type CurvePoint,
  type GradeWheel,
  type PartialAdjustments,
} from '../schema/adjustments';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function blendWheel(a: GradeWheel, b: GradeWheel, t: number): GradeWheel {
  const ax = Math.cos((a.hue * Math.PI) / 180) * a.saturation;
  const ay = Math.sin((a.hue * Math.PI) / 180) * a.saturation;
  const bx = Math.cos((b.hue * Math.PI) / 180) * b.saturation;
  const by = Math.sin((b.hue * Math.PI) / 180) * b.saturation;
  const x = lerp(ax, bx, t);
  const y = lerp(ay, by, t);
  const sat = Math.hypot(x, y);
  let hue = sat > 1e-6 ? (Math.atan2(y, x) * 180) / Math.PI : t < 0.5 ? a.hue : b.hue;
  if (hue < 0) hue += 360;
  return { hue: Math.round(hue * 10) / 10, saturation: sat, luminance: lerp(a.luminance, b.luminance, t) };
}

/**
 * Computes adjustments for a preset at `amount` (0..100) on top of `baseline`.
 * `current` and `overrides` preserve manual edits made after applying.
 */
export function blendPreset(
  baseline: Adjustments,
  values: PartialAdjustments,
  amount: number,
  current?: Adjustments,
  overrides: string[] = [],
): Adjustments {
  const t = Math.min(1, Math.max(0, amount / 100));
  const target = mergeAdjustments(baseline, values);
  let out: Adjustments = structuredClone(baseline);
  const overrideSet = new Set(overrides);
  const wheelZones = new Set<string>();

  for (const path of leafPaths(values)) {
    const parts = path.split('.');
    if (parts[0] === 'grading' && (GRADE_ZONES as readonly string[]).includes(parts[1])) {
      wheelZones.add(parts[1]);
      continue;
    }
    if (overrideSet.has(path) && current) {
      out = setPath(out, path, structuredClone(getPath(current, path)));
      continue;
    }
    const a = getPath(baseline, path);
    const b = getPath(target, path);
    if (parts[0] === 'curves') {
      out = setPath(out, path, blendCurves(a as CurvePoint[], b as CurvePoint[], t));
    } else if (typeof a === 'number' && typeof b === 'number') {
      out = setPath(out, path, lerp(a, b, t));
    }
  }
  for (const zone of wheelZones) {
    const z = zone as (typeof GRADE_ZONES)[number];
    const blended = blendWheel(baseline.grading[z], target.grading[z], t);
    const cur = current?.grading[z];
    out.grading[z] = {
      hue: cur && overrideSet.has(`grading.${z}.hue`) ? cur.hue : blended.hue,
      saturation: cur && overrideSet.has(`grading.${z}.saturation`) ? cur.saturation : blended.saturation,
      luminance: cur && overrideSet.has(`grading.${z}.luminance`) ? cur.luminance : blended.luminance,
    };
  }
  return out;
}

/** Adjustment paths whose values differ between two adjustment sets (for override tracking). */
export function changedPaths(a: Adjustments, b: Adjustments): string[] {
  const out: string[] = [];
  const walk = (x: unknown, y: unknown, prefix: string) => {
    if (Array.isArray(x) || typeof x !== 'object' || x === null) {
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push(prefix);
      return;
    }
    for (const k of Object.keys(x)) walk((x as never)[k], (y as never)?.[k], prefix ? `${prefix}.${k}` : k);
  };
  walk(a, b, '');
  return out;
}

/** Extracts the "look" portion of adjustments as a preset (all colour/tone fields). */
export function adjustmentsToPresetValues(a: Adjustments): PartialAdjustments {
  const { detail: _detail, ...look } = structuredClone(a);
  return look;
}
