/**
 * "For this photo": which looks to show first for the open photo.
 *
 * Measured, not guessed, and no AI: a small sample of the photo's pixels gives a handful of plain
 * traits (dark, warm, muted, lots of sky…), and every built-in look lists the traits it was made
 * for (`suits` in library.ts). The looks with the most matches come first; ties keep library
 * order, and no roll fills more than two places so the picks stay varied.
 */
import { linearSrgbToOklab } from '../color/oklab';
import { linearToSrgb } from '../color/srgb';

export const TRAITS = ['any', 'dark', 'bright', 'flat', 'contrasty', 'warm', 'cool', 'muted', 'vivid', 'greens', 'blues', 'face'] as const;
export type Trait = (typeof TRAITS)[number];

export const TRAIT_RULES = {
  /** Median display brightness (0..1) below / above which a photo is dark / bright. */
  dark: 0.3,
  bright: 0.58,
  /** A dark photo is only "dark" (night, low key) when its brightest 5% is also below this; with
   *  bright highlights it is a sunlit scene with deep shade, which counts as hard light instead. */
  darkCeiling: 0.62,
  /** Pixels darker than this are left out of the colour measurements (shade hides colour). */
  lit: 0.12,
  /** 5%–95% brightness spread below / above which a photo is flat / contrasty. */
  flat: 0.5,
  contrasty: 0.8,
  /** Mean OKLab b of the less colourful half: past ± this the photo has a warm / cool cast. */
  cast: 0.012,
  /** Mean chroma of the lit pixels below / above which a photo is muted / vivid. */
  muted: 0.04,
  vivid: 0.1,
  /** A pixel counts as coloured above this chroma; a hue family counts when it holds this share of the photo. */
  coloured: 0.05,
  hueShare: 0.14,
} as const;

/** Plain traits of a photo from linear-RGB pixels (3 floats each), e.g. the engine's look-adapt sample. */
export function photoTraits(lin: Float32Array, hasFace = false): Trait[] {
  const n = Math.floor(lin.length / 3);
  if (n === 0) return hasFace ? ['face'] : [];
  const lum = new Float32Array(n);
  const chroma = new Float32Array(n);
  const bs = new Float32Array(n);
  let sumC = 0;
  let lit = 0;
  let greens = 0;
  let blues = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.min(1, Math.max(0, lin[i * 3]));
    const g = Math.min(1, Math.max(0, lin[i * 3 + 1]));
    const b = Math.min(1, Math.max(0, lin[i * 3 + 2]));
    lum[i] = 0.2126 * linearToSrgb(r) + 0.7152 * linearToSrgb(g) + 0.0722 * linearToSrgb(b);
    const [, a, bb] = linearSrgbToOklab(r, g, b);
    const c = Math.hypot(a, bb);
    chroma[i] = c;
    bs[i] = bb;
    if (lum[i] >= TRAIT_RULES.lit) {
      sumC += c;
      lit++;
    }
    if (c > TRAIT_RULES.coloured) {
      const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
      if (h >= 110 && h < 175) greens++;
      else if (h >= 200 && h < 285) blues++;
    }
  }
  const sorted = lum.slice().sort();
  const at = (q: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
  const median = at(0.5);
  const top = at(0.95);
  const spread = top - at(0.05);
  const meanC = lit ? sumC / lit : 0;
  // The cast: mean yellow-blue lean of the less colourful half (a strong subject colour doesn't count).
  const order = Array.from(chroma.keys()).sort((x, y) => chroma[x] - chroma[y]);
  const k = Math.max(1, n >> 1);
  let sb = 0;
  for (let i = 0; i < k; i++) sb += bs[order[i]];
  const cast = sb / k;

  const out: Trait[] = [];
  const lowKey = median < TRAIT_RULES.dark && top < TRAIT_RULES.darkCeiling;
  if (lowKey) out.push('dark');
  else if (median > TRAIT_RULES.bright) out.push('bright');
  if (spread < TRAIT_RULES.flat) out.push('flat');
  else if (spread > TRAIT_RULES.contrasty || (median < TRAIT_RULES.dark && !lowKey)) out.push('contrasty');
  if (cast > TRAIT_RULES.cast) out.push('warm');
  else if (cast < -TRAIT_RULES.cast) out.push('cool');
  if (meanC < TRAIT_RULES.muted) out.push('muted');
  else if (meanC > TRAIT_RULES.vivid) out.push('vivid');
  if (greens / n > TRAIT_RULES.hueShare) out.push('greens');
  if (blues / n > TRAIT_RULES.hueShare) out.push('blues');
  if (hasFace) out.push('face');
  return out;
}

const WORDS: Partial<Record<Trait, string>> = {
  dark: 'dark',
  bright: 'bright',
  flat: 'soft light',
  contrasty: 'hard light',
  warm: 'warm',
  cool: 'cool',
  muted: 'muted',
  vivid: 'colourful',
  greens: 'greens',
  blues: 'blues',
  face: 'a face',
};

/** "dark · warm · a face": what was measured, for the line above the picks. */
export function describeTraits(traits: Trait[]): string {
  return traits
    .map((t) => WORDS[t])
    .filter(Boolean)
    .join(' · ');
}

export interface Suited {
  id: string;
  category: string;
  suits?: readonly Trait[];
}

/** The ids of the `count` looks that suit these traits best, best first. */
export function recommendLooks(traits: Trait[], looks: readonly Suited[], count = 6): string[] {
  const has = new Set(traits);
  const scored = looks
    .filter((l) => l.suits?.length)
    .map((l, index) => {
      let score = 0;
      for (const t of l.suits!) {
        // An all-rounder outranks a single matching trait, so a safe choice is always near the front.
        if (t === 'any') score += 1.25;
        else if (has.has(t)) score += t === 'face' ? 1.5 : 1;
      }
      return { l, index, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const perRoll = new Map<string, number>();
  const out: string[] = [];
  for (const s of scored) {
    const used = perRoll.get(s.l.category) ?? 0;
    if (used >= 2) continue;
    perRoll.set(s.l.category, used + 1);
    out.push(s.l.id);
    if (out.length === count) break;
  }
  return out;
}
