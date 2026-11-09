/**
 * A short, roll-style name and mood for a matched look (roadmap 1.6), e.g. "Moss Hour" ·
 * "soft, green, faded", suggested in the reference studio instead of "Reference look 8 Nov" and
 * editable before saving.
 *
 * Built only from the measured statistics, with the same thresholds as the info readout
 * (`readout.ts`), so the name never contradicts what the readout says. Deterministic: the same
 * reference always gets the same suggestion.
 */
import { CANONICAL } from './mapping';
import type { ImageStats, PaletteColor } from './stats';
import { ROLLS } from '../presets/rolls';

/** First word: the dominant colour (OKLab hue ranges, degrees). */
export const COLOUR_WORDS: { from: number; to: number; name: string; mood: string }[] = [
  { from: 0, to: 40, name: 'Ember', mood: 'red' },
  { from: 40, to: 75, name: 'Amber', mood: 'orange' },
  { from: 75, to: 115, name: 'Honey', mood: 'golden' },
  { from: 115, to: 165, name: 'Moss', mood: 'green' },
  { from: 165, to: 225, name: 'Lagoon', mood: 'teal' },
  { from: 225, to: 285, name: 'Harbour', mood: 'blue' },
  { from: 285, to: 330, name: 'Violet', mood: 'violet' },
  { from: 330, to: 360, name: 'Rose', mood: 'pink' },
];
/** First word without a dominant colour. */
export const NEUTRAL_WORDS = { mono: 'Silver', muted: 'Ash', neutral: 'Paper' } as const;
/** Second word: the light, in priority order (first that applies). */
export const LIGHT_WORDS = {
  mono: 'Diary',
  dark: 'Night',
  faded: 'Postcard',
  grainy: 'Static',
  bright: 'Morning',
  warm: 'Hour',
  cool: 'Tide',
  plain: 'Frame',
} as const;

/** Palette colours this saturated or more count as a colour, not a grey. */
const COLOURFUL = 0.04;

function dominantColour(palette: PaletteColor[]): PaletteColor | null {
  return [...palette].filter((p) => p.C >= COLOURFUL).sort((a, b) => b.weight - a.weight)[0] ?? null;
}

const colourWord = (h: number) => COLOUR_WORDS.find((c) => h >= c.from && h < c.to) ?? COLOUR_WORDS[0];

export interface LookName {
  name: string;
  /** Three plain words, e.g. "soft, green, faded". */
  mood: string;
}

export function suggestLookName(s: ImageStats, taken: Iterable<string> = []): LookName {
  const pc = s.percentiles;
  const spread = pc.p95 - pc.p5;
  const dark = s.flags.nightLikely || pc.p50 < 0.3;
  const bright = pc.p50 > 0.62;
  const faded = s.blackFloor > 0.055;
  const grainy = s.grain !== null && s.grain >= 0.018;
  const castC = Math.hypot(s.cast.a, s.cast.b);
  const warm = castC > 0.006 && s.cast.b > 0;
  const cool = castC > 0.006 && s.cast.b <= 0;
  const muted = s.chroma.p50 / CANONICAL.chromaP50 < 0.7;
  const dom = s.monochrome ? null : dominantColour(s.palette);
  const hue = dom ? colourWord(dom.h) : null;

  const first = s.monochrome ? NEUTRAL_WORDS.mono : hue ? hue.name : muted ? NEUTRAL_WORDS.muted : NEUTRAL_WORDS.neutral;
  const second = s.monochrome
    ? LIGHT_WORDS.mono
    : dark
      ? LIGHT_WORDS.dark
      : faded
        ? LIGHT_WORDS.faded
        : grainy
          ? LIGHT_WORDS.grainy
          : bright
            ? LIGHT_WORDS.bright
            : warm
              ? LIGHT_WORDS.warm
              : cool
                ? LIGHT_WORDS.cool
                : LIGHT_WORDS.plain;

  const light = dark ? 'dark' : bright ? 'bright' : spread < 0.62 ? 'soft' : spread > 0.86 ? 'punchy' : 'even';
  const colour = s.monochrome ? 'black & white' : muted ? 'muted' : hue ? hue.mood : warm ? 'warm' : cool ? 'cool' : 'neutral';
  const falloff = 1 - s.vignette.ratio;
  const finish = faded
    ? 'faded'
    : grainy
      ? 'grainy'
      : falloff > 0.3 && s.vignette.symmetry > 0.6
        ? 'vignetted'
        : spread > 0.86
          ? 'crisp'
          : 'clean';
  const mood = [...new Set([light, colour, finish])].join(', ');

  // Never the name of a roll, and never one of your own looks' names.
  const used = new Set([...Object.values(ROLLS).map((r) => r.name), ...taken].map((n) => n.trim().toLowerCase()));
  const base = `${first} ${second}`;
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} ${toRoman(i)}`;
  return { name, mood };
}

function toRoman(n: number): string {
  const r: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of r)
    while (n >= v) {
      out += s;
      n -= v;
    }
  return out;
}
