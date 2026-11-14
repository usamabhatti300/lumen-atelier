/**
 * Built-in look library: a curated set of 54 looks in 12 rolls (2026-11-14: 41 in 8, plus four
 * trend rolls the same day: Pocket Digicam, 2016, Camcorder, Lofi Dusk).
 *
 * Every look is a partial adjustment set (Lightroom-style): only the fields a look intends to
 * change are present, so applying one leaves the rest of the user's edit alone. Values are tuned
 * for this renderer (engine/params.ts, engine/pixel.ts) and stay within schema RANGES.
 *
 * House rules, checked by tests in blend.test.ts and by the looks audit that produced this set
 * (PRODUCT_AUDIT_AND_IMPROVEMENT_PLAN.md, section 5):
 *  - a look must change a photo visibly, and differ visibly from every other look;
 *  - no added highlight clipping: no positive `whites`, exposure at most +0.25, and a master
 *    curve white point of 0.96-0.99 where the look brightens;
 *  - `blacks` no lower than -15, vignette no stronger than -22;
 *  - skin stays believable: warm highlight tints sit at 40-55 degrees (amber, not yellow-green);
 *  - looks never set `detail` (sharpening and noise belong to the photo, not the look).
 *
 * These are original interpretations of general photographic looks. No look is named after, or
 * reproduces, a commercial film stock or preset pack.
 */
import type { PartialAdjustments } from '../schema/adjustments';
import type { Trait } from './recommend';

export const PRESET_CATEGORIES = [
  'signature',
  'film',
  'cinematic',
  'pale-blue',
  'matte',
  'golden-hour',
  'street',
  'bw',
  // Trend rolls (2026-11-14).
  'digicam',
  'y2016',
  'camcorder',
  'lofi',
] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

/** Plain names (search and exports); the rolls in rolls.ts are what people see. */
export const CATEGORY_LABELS: Record<PresetCategory, string> = {
  signature: "Editor's Picks",
  film: 'Film',
  cinematic: 'Cinematic',
  'pale-blue': 'Cool & Pastel',
  matte: 'Matte & Earthy',
  'golden-hour': 'Golden Hour',
  street: 'Flash & Night',
  bw: 'Black & White',
  digicam: 'Digicam',
  y2016: '2016',
  camcorder: 'Camcorder',
  lofi: 'Lofi & Neon',
};

export interface BuiltinPresetDefinition {
  /** 'builtin:<kebab-case slug of the name>' */
  id: string;
  name: string;
  category: PresetCategory;
  /** One or two plain sentences: what the look does and when to use it. */
  description: string;
  /** 2-5 lowercase words. */
  tags: string[];
  /** The kinds of photo this look was made for (see recommend.ts), most important first. */
  suits: readonly Trait[];
  adjustments: PartialAdjustments;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const builtinId = (name: string) => `builtin:${slug(name)}`;

function preset(
  name: string,
  category: PresetCategory,
  description: string,
  tags: string[],
  suits: readonly Trait[],
  adjustments: PartialAdjustments,
): BuiltinPresetDefinition {
  return { id: builtinId(name), name, category, description, tags, suits, adjustments };
}

export const BUILTIN_PRESETS: BuiltinPresetDefinition[] = [
  // -------------------------------------------------------------------------
  // Editor's Picks
  // -------------------------------------------------------------------------
  preset(
    'Daylight',
    'signature',
    'The everyday fix: opens shadows, calms bright skies and keeps colour honest. Start here when a photo just needs to look its best.',
    ['clean', 'natural', 'everyday', 'enhance'],
    ['any', 'flat', 'dark', 'face'],
    {
      basic: { brightness: 8, contrast: 6, highlights: -26, shadows: 20, blacks: -3, vibrance: 12 },
      presence: { clarity: 4 },
      hsl: { orange: { luminance: 3 }, blue: { saturation: 6, luminance: -4 } },
      curves: {
        master: [
          [0, 0],
          [0.25, 0.245],
          [0.75, 0.77],
          [1, 0.99],
        ],
      },
    },
  ),
  preset(
    'Clean Studio',
    'signature',
    'Neutral, crisp and a touch cool, with clean whites and calm skin. For products, interiors and portraits in even light.',
    ['neutral', 'crisp', 'cool', 'studio'],
    ['bright', 'face', 'muted', 'warm'],
    {
      basic: {
        exposure: 0.04,
        contrast: 12,
        highlights: -20,
        blacks: -6,
        temperature: -2,
        saturation: -5,
      },
      presence: { texture: 5, clarity: 5 },
      hsl: { red: { saturation: -8 }, orange: { saturation: -5, luminance: 5 } },
      curves: {
        master: [
          [0, 0],
          [0.25, 0.23],
          [0.75, 0.79],
          [1, 0.99],
        ],
      },
    },
  ),
  preset(
    'Vivid Postcard',
    'signature',
    'Deep skies and punchy colour without crushed shadows. For landscapes, beaches and travel days.',
    ['vivid', 'travel', 'sky', 'landscape'],
    ['blues', 'greens', 'flat', 'bright'],
    {
      basic: {
        exposure: 0.05,
        contrast: 18,
        highlights: -24,
        shadows: 18,
        blacks: -4,
        vibrance: 38,
        saturation: 10,
      },
      presence: { clarity: 8, dehaze: 10 },
      hsl: {
        yellow: { saturation: 6 },
        green: { hue: 6, saturation: 10 },
        aqua: { saturation: 14 },
        blue: { hue: -6, saturation: 14, luminance: -14 },
      },
      curves: {
        master: [
          [0, 0],
          [0.25, 0.24],
          [0.75, 0.77],
          [1, 0.99],
        ],
      },
    },
  ),
  preset(
    'Velvet Slide',
    'signature',
    'Dense, saturated slide-film colour with dark blues and rich greens. For scenes that already have strong colour.',
    ['slide', 'saturated', 'rich', 'contrast'],
    ['vivid', 'blues', 'greens', 'contrasty'],
    {
      basic: {
        contrast: 18,
        highlights: -26,
        shadows: 6,
        blacks: -8,
        temperature: -2,
        vibrance: 22,
        saturation: 8,
      },
      presence: { clarity: 6, dehaze: 4 },
      hsl: {
        red: { saturation: 10 },
        orange: { saturation: -4 },
        yellow: { hue: -4, saturation: 6 },
        green: { hue: 8, saturation: 14, luminance: -8 },
        aqua: { hue: 4, saturation: 16, luminance: -6 },
        blue: { hue: -4, saturation: 18, luminance: -14 },
        purple: { saturation: 8 },
      },
      curves: {
        master: [
          [0, 0],
          [0.22, 0.185],
          [0.5, 0.5],
          [0.8, 0.84],
          [1, 0.99],
        ],
      },
      grading: { shadows: { hue: 230, saturation: 8 }, blending: 50 },
      effects: { vignette: -8, grain: 6, grainSize: 18 },
    },
  ),
  // -------------------------------------------------------------------------
  // Film
  // -------------------------------------------------------------------------
  preset(
    'Sunday Negative',
    'film',
    'Warm, soft colour-negative film with gentle contrast and fine grain. Flattering for people and slow afternoons.',
    ['film', 'warm', 'soft', 'grain'],
    ['face', 'bright', 'warm', 'any'],
    {
      basic: {
        exposure: 0.15,
        contrast: -8,
        highlights: -25,
        shadows: 15,
        temperature: 10,
        tint: 3,
        vibrance: 5,
        saturation: -8,
      },
      hsl: {
        red: { hue: 8, saturation: -10 },
        orange: { hue: -3, luminance: 6 },
        yellow: { hue: -10, saturation: -15 },
        green: { hue: 30, saturation: -30 },
        blue: { hue: -10, saturation: -20 },
      },
      grading: { shadows: { hue: 210, saturation: 8 }, highlights: { hue: 50, saturation: 10 } },
      curves: {
        master: [
          [0, 0.05],
          [0.25, 0.24],
          [0.75, 0.77],
          [1, 0.95],
        ],
      },
      effects: { grain: 18, grainSize: 30, grainRoughness: 45 },
    },
  ),
  preset(
    'Open Shade',
    'film',
    'A soft portrait negative: lifted shadows, peachy skin and a hint of cyan in the dark tones.',
    ['film', 'portrait', 'soft', 'pastel'],
    ['face', 'contrasty', 'bright'],
    {
      basic: {
        exposure: 0.12,
        contrast: -6,
        highlights: -30,
        shadows: 22,
        blacks: 6,
        temperature: 2,
        tint: 5,
        vibrance: 6,
        saturation: -2,
      },
      presence: { texture: -6, clarity: -4 },
      hsl: {
        red: { hue: 6, saturation: -8 },
        orange: { saturation: -4, luminance: 8 },
        yellow: { hue: -8, saturation: -18 },
        green: { hue: 22, saturation: -28, luminance: 4 },
        aqua: { hue: -8, saturation: -8, luminance: 6 },
        blue: { hue: -14, saturation: -18, luminance: 6 },
      },
      grading: {
        shadows: { hue: 190, saturation: 14 },
        highlights: { hue: 45, saturation: 12 },
        blending: 60,
      },
      curves: {
        master: [
          [0, 0.045],
          [0.25, 0.27],
          [0.5, 0.53],
          [0.78, 0.8],
          [1, 0.975],
        ],
      },
      effects: { grain: 12, grainSize: 28, grainRoughness: 45 },
    },
  ),
  preset(
    'Green Room',
    'film',
    'Cool, natural film with deep greens and a green-cyan lean in the shadows. For streets, plants and overcast days.',
    ['film', 'green', 'cool', 'natural'],
    ['greens', 'flat', 'cool'],
    {
      basic: {
        contrast: 10,
        highlights: -15,
        shadows: 5,
        temperature: -3,
        tint: -2,
        saturation: -10,
      },
      hsl: {
        red: { saturation: -10 },
        orange: { saturation: -5 },
        green: { hue: 15, saturation: 5, luminance: -10 },
        aqua: { hue: -10, saturation: 10 },
        blue: { hue: -8, saturation: 5 },
      },
      grading: { shadows: { hue: 170, saturation: 12 }, highlights: { hue: 60, saturation: 5 } },
      curves: {
        master: [
          [0, 0.03],
          [0.25, 0.22],
          [0.75, 0.78],
          [1, 0.97],
        ],
        green: [
          [0, 0.03],
          [0.5, 0.508],
          [1, 0.98],
        ],
      },
      effects: { grain: 15, grainSize: 22 },
    },
  ),
  preset(
    'Classic 35mm',
    'film',
    'Contrasty everyday film with visible grain and a light vignette. A good all-round snapshot look.',
    ['film', '35mm', 'grain', 'contrast'],
    ['any', 'flat', 'bright'],
    {
      basic: { contrast: 18, highlights: -10, blacks: -10, temperature: 6, saturation: -10 },
      hsl: {
        yellow: { saturation: -10 },
        green: { hue: 10, saturation: -15 },
        blue: { saturation: -10, luminance: -10 },
      },
      grading: { shadows: { hue: 190, saturation: 10 }, highlights: { hue: 45, saturation: 8 } },
      curves: {
        master: [
          [0, 0.04],
          [0.25, 0.2],
          [0.75, 0.8],
          [1, 0.97],
        ],
      },
      effects: { vignette: -14, vignetteFeather: 70, grain: 25, grainSize: 35, grainRoughness: 60 },
    },
  ),
  preset(
    'Expired Summer',
    'film',
    'Lifted, yellow-gold film that has sat in a drawer: faded blues, soft blacks, heavy grain.',
    ['film', 'expired', 'gold', 'faded'],
    ['bright', 'warm', 'blues'],
    {
      basic: {
        contrast: 10,
        highlights: -22,
        shadows: 10,
        blacks: 12,
        temperature: 9,
        tint: -1,
        vibrance: 4,
        saturation: -2,
      },
      hsl: {
        red: { saturation: 12 },
        orange: { hue: 2, saturation: 4 },
        yellow: { hue: -10, saturation: 12 },
        green: { hue: -18, saturation: -18 },
        aqua: { hue: -12, saturation: -10 },
        blue: { hue: -14, saturation: -12 },
      },
      curves: {
        master: [
          [0, 0.08],
          [0.3, 0.29],
          [0.7, 0.73],
          [1, 0.96],
        ],
        blue: [
          [0, 0.04],
          [0.5, 0.49],
          [1, 0.975],
        ],
      },
      grading: {
        shadows: { hue: 160, saturation: 8 },
        highlights: { hue: 40, saturation: 8 },
        blending: 50,
      },
      effects: { grain: 26, grainSize: 36, grainRoughness: 60, vignette: -14 },
    },
  ),
  preset(
    'Retro 70s',
    'film',
    'An amber print fade with warm shadows and washed-out blues, like a photo from an old album.',
    ['retro', 'amber', 'faded', 'vintage'],
    ['warm', 'bright', 'face'],
    {
      basic: {
        contrast: -5,
        highlights: -20,
        shadows: 10,
        temperature: 18,
        tint: 5,
        vibrance: 8,
        saturation: -10,
      },
      hsl: {
        orange: { hue: 3, saturation: 6 },
        yellow: { hue: -20, saturation: 15 },
        green: { hue: -35, saturation: -20 },
        blue: { hue: -15, saturation: -40 },
      },
      grading: {
        shadows: { hue: 30, saturation: 15 },
        midtones: { hue: 55, saturation: 6 },
        highlights: { hue: 50, saturation: 12 },
      },
      curves: {
        master: [
          [0, 0.08],
          [1, 0.94],
        ],
        blue: [
          [0, 0.06],
          [0.5, 0.47],
          [1, 0.9],
        ],
      },
      effects: { vignette: -16, grain: 30, grainSize: 45 },
    },
  ),
  // -------------------------------------------------------------------------
  // Cinematic
  // -------------------------------------------------------------------------
  preset(
    'Teal and Orange',
    'cinematic',
    'The blockbuster grade: teal shadows against warm skin and lights. For people against city or sky.',
    ['teal', 'orange', 'cinema', 'contrast'],
    ['face', 'blues', 'contrasty', 'vivid'],
    {
      basic: { contrast: 16, highlights: -24, shadows: 14, temperature: 5, vibrance: 8 },
      hsl: {
        orange: { hue: -3, saturation: 6 },
        green: { hue: 40, saturation: -30 },
        aqua: { hue: -12, saturation: 14 },
        blue: { hue: -16, saturation: 10 },
      },
      grading: {
        shadows: { hue: 200, saturation: 30 },
        highlights: { hue: 50, saturation: 18 },
        blending: 60,
        balance: -10,
      },
      curves: {
        master: [
          [0, 0.012],
          [0.25, 0.225],
          [0.75, 0.78],
          [1, 0.985],
        ],
      },
      effects: { vignette: -10 },
    },
  ),
  preset(
    'Warm Film Cinema',
    'cinematic',
    'A warm, amber cinema grade with soft blacks and muted greens. For interiors, golden light and quiet scenes.',
    ['cinema', 'warm', 'amber', 'soft'],
    ['warm', 'dark', 'face'],
    {
      basic: {
        contrast: 12,
        highlights: -25,
        shadows: 10,
        temperature: 18,
        tint: 4,
        vibrance: 5,
        saturation: -5,
      },
      hsl: {
        orange: { hue: -3 },
        yellow: { hue: -15, saturation: -10 },
        green: { hue: 25, saturation: -30 },
        blue: { saturation: -25 },
      },
      grading: { shadows: { hue: 40, saturation: 14 }, highlights: { hue: 45, saturation: 12 } },
      curves: {
        master: [
          [0, 0.05],
          [0.25, 0.22],
          [0.75, 0.78],
          [1, 0.95],
        ],
      },
      effects: { vignette: -12, grain: 15, grainSize: 30 },
    },
  ),
  preset(
    'Neo-Noir Emerald',
    'cinematic',
    'Dark emerald shadows and drained colour for a tense, rainy-night mood.',
    ['noir', 'emerald', 'moody', 'dark'],
    ['dark', 'greens', 'cool', 'muted'],
    {
      basic: {
        exposure: -0.05,
        contrast: 18,
        highlights: -26,
        shadows: 6,
        blacks: -8,
        temperature: 2,
        tint: -6,
        vibrance: -14,
        saturation: -10,
      },
      presence: { clarity: 8 },
      hsl: {
        red: { saturation: -14 },
        orange: { hue: 2, saturation: -6 },
        yellow: { hue: 10, saturation: -6 },
        green: { hue: -10, saturation: -10, luminance: -10 },
        blue: { hue: -30, saturation: -30 },
        purple: { saturation: -40 },
        magenta: { saturation: -40 },
      },
      curves: {
        master: [
          [0, 0.025],
          [0.25, 0.21],
          [0.5, 0.49],
          [0.8, 0.81],
          [1, 0.96],
        ],
      },
      grading: {
        shadows: { hue: 170, saturation: 24, luminance: -4 },
        midtones: { hue: 85, saturation: 8 },
        highlights: { hue: 60, saturation: 10 },
        blending: 55,
      },
      effects: { vignette: -14, grain: 10 },
    },
  ),
  preset(
    'Midnight Cinema',
    'cinematic',
    'Navy night with warm highlights. Made for city lights, windows and late walks.',
    ['night', 'navy', 'cinema', 'city'],
    ['dark', 'cool', 'blues'],
    {
      basic: {
        exposure: -0.05,
        contrast: 18,
        highlights: -22,
        shadows: 8,
        whites: 4,
        blacks: -8,
        temperature: -10,
        tint: 2,
        vibrance: 6,
        saturation: -6,
      },
      presence: { clarity: 6, dehaze: 6 },
      hsl: {
        orange: { saturation: 6, luminance: 2 },
        blue: { hue: 4, saturation: 8, luminance: -18 },
        purple: { hue: 6, saturation: 12, luminance: -8 },
        magenta: { saturation: -10 },
      },
      curves: {
        master: [
          [0, 0.02],
          [0.25, 0.228],
          [0.5, 0.502],
          [0.75, 0.776],
          [1, 0.984],
        ],
      },
      grading: {
        shadows: { hue: 235, saturation: 32, luminance: -6 },
        midtones: { hue: 260, saturation: 8 },
        highlights: { hue: 30, saturation: 22, luminance: 6 },
        blending: 60,
        balance: -20,
      },
      effects: { vignette: -14, grain: 8, grainSize: 25, grainRoughness: 40 },
    },
  ),
  preset(
    'Tungsten Hours',
    'cinematic',
    'A cool tungsten night look: blue air, warm lamps and a soft red glow around lights.',
    ['night', 'tungsten', 'halation', 'glow'],
    ['dark', 'warm', 'vivid'],
    {
      basic: {
        exposure: 0.05,
        contrast: 12,
        highlights: -30,
        shadows: 14,
        blacks: -4,
        temperature: -22,
        tint: 2,
        vibrance: 8,
      },
      hsl: {
        red: { saturation: 8 },
        orange: { hue: -4, saturation: 8, luminance: 6 },
        yellow: { hue: -12, saturation: 8 },
        green: { hue: 30, saturation: -30 },
        aqua: { hue: -6, saturation: 10 },
        blue: { hue: -10, saturation: 6, luminance: -8 },
      },
      grading: {
        shadows: { hue: 205, saturation: 22 },
        midtones: { hue: 215, saturation: 8 },
        highlights: { hue: 38, saturation: 24 },
        blending: 55,
        balance: 10,
      },
      curves: {
        master: [
          [0, 0.045],
          [0.25, 0.23],
          [0.5, 0.5],
          [0.8, 0.82],
          [1, 0.975],
        ],
      },
      effects: {
        halation: 35,
        bloom: 12,
        grain: 16,
        grainSize: 30,
        grainRoughness: 55,
        vignette: -10,
      },
    },
  ),
  preset(
    'Silver Retain',
    'cinematic',
    'Steely, low-colour and high-contrast, like film with the silver left in. For grit and drama.',
    ['bleach', 'steel', 'contrast', 'drama'],
    ['contrasty', 'muted', 'flat'],
    {
      basic: {
        contrast: 28,
        highlights: -22,
        shadows: 4,
        blacks: -8,
        vibrance: -10,
        saturation: -48,
      },
      presence: { texture: 10, clarity: 16 },
      curves: {
        master: [
          [0, 0],
          [0.2, 0.16],
          [0.5, 0.5],
          [0.8, 0.85],
          [1, 0.985],
        ],
      },
      grading: { global: { hue: 200, saturation: 5 } },
      effects: { vignette: -12, grain: 14, grainSize: 28 },
    },
  ),
  // -------------------------------------------------------------------------
  // Cool & Pastel
  // -------------------------------------------------------------------------
  preset(
    'Airy Blue Film',
    'pale-blue',
    'Bright, airy film with a pale blue lean and soft grain. For daylight, water and open skies.',
    ['airy', 'blue', 'light', 'film'],
    ['bright', 'blues', 'cool'],
    {
      basic: {
        exposure: 0.25,
        contrast: -10,
        highlights: -22,
        shadows: 15,
        temperature: -7,
        tint: 2,
        saturation: -15,
      },
      hsl: {
        orange: { saturation: -4, luminance: 6 },
        green: { hue: 25, saturation: -20, luminance: 10 },
        blue: { luminance: 10 },
      },
      grading: { shadows: { hue: 200, saturation: 8 } },
      curves: {
        red: [
          [0, 0.02],
          [1, 0.97],
        ],
        blue: [
          [0, 0.035],
          [0.5, 0.52],
          [1, 0.97],
        ],
      },
      effects: { grain: 18, grainSize: 25 },
    },
  ),
  preset(
    'Blue Hour',
    'pale-blue',
    'Deep violet-blue dusk with warm lights kept glowing. For the half hour after sunset.',
    ['dusk', 'blue', 'violet', 'evening'],
    ['dark', 'cool', 'blues'],
    {
      basic: {
        exposure: -0.05,
        contrast: 10,
        highlights: -25,
        shadows: 18,
        temperature: -22,
        tint: 4,
        vibrance: 20,
      },
      presence: { dehaze: 6 },
      hsl: {
        orange: { saturation: 15, luminance: 10 },
        yellow: { saturation: 10 },
        blue: { hue: 8, saturation: 20 },
        purple: { saturation: 15 },
      },
      grading: {
        shadows: { hue: 255, saturation: 25 },
        midtones: { hue: 270, saturation: 6 },
        highlights: { hue: 60, saturation: 12 },
      },
      effects: { vignette: -12 },
    },
  ),
  preset(
    'Rainy Day Blue',
    'pale-blue',
    'Cool, muted and textured, with blue shadows. For wet streets, fog and grey skies.',
    ['rain', 'blue', 'muted', 'moody'],
    ['flat', 'cool', 'muted'],
    {
      basic: {
        contrast: 10,
        highlights: -16,
        shadows: 14,
        whites: 4,
        blacks: -8,
        temperature: -12,
        vibrance: -6,
        saturation: -16,
      },
      presence: { texture: 6, clarity: 8, dehaze: 4 },
      hsl: {
        orange: { hue: -3, saturation: 4 },
        green: { hue: -25, saturation: -25, luminance: -8 },
        aqua: { hue: -5, saturation: 5, luminance: -8 },
        blue: { saturation: -5, luminance: -10 },
      },
      curves: {
        master: [
          [0, 0.035],
          [0.25, 0.25],
          [0.5, 0.506],
          [0.75, 0.762],
          [1, 0.976],
        ],
      },
      grading: {
        shadows: { hue: 215, saturation: 28, luminance: -6 },
        midtones: { hue: 205, saturation: 6 },
        highlights: { hue: 190, saturation: 8, luminance: 3 },
        blending: 55,
        balance: -10,
      },
      effects: { vignette: -12, grain: 8, grainSize: 25, grainRoughness: 40 },
    },
  ),
  preset(
    'Powder Blue',
    'pale-blue',
    'Pale, light and soft with powdery blue highlights. For minimal, bright scenes.',
    ['pale', 'blue', 'soft', 'minimal'],
    ['bright', 'blues', 'muted'],
    {
      basic: {
        exposure: 0.2,
        contrast: -12,
        highlights: -25,
        shadows: 18,
        blacks: 6,
        temperature: -8,
        tint: 3,
        saturation: -18,
      },
      presence: { dehaze: -4 },
      hsl: {
        orange: { luminance: 5 },
        aqua: { hue: 15, saturation: -20, luminance: 15 },
        blue: { hue: -15, saturation: -25, luminance: 25 },
      },
      grading: { midtones: { hue: 245, saturation: 6 }, highlights: { hue: 230, saturation: 10 } },
      curves: {
        master: [
          [0, 0.06],
          [0.5, 0.54],
          [1, 0.97],
        ],
      },
    },
  ),
  preset(
    'Sherbet',
    'pale-blue',
    'Soft pastels with lilac shadows and a touch of dreamy blur. For flowers, outfits and bright days.',
    ['pastel', 'lilac', 'dreamy', 'soft'],
    ['bright', 'vivid', 'face'],
    {
      basic: {
        exposure: 0.15,
        contrast: -14,
        highlights: -28,
        shadows: 26,
        blacks: 8,
        temperature: -4,
        tint: 6,
        vibrance: 22,
        saturation: -2,
      },
      presence: { texture: -4, clarity: -8 },
      hsl: {
        red: { hue: 8, saturation: -6, luminance: 10 },
        orange: { saturation: -4, luminance: 8 },
        yellow: { hue: -6, saturation: -10, luminance: 10 },
        green: { hue: 14, saturation: -18, luminance: 14 },
        aqua: { hue: 6, saturation: 6, luminance: 12 },
        blue: { hue: -10, saturation: -4, luminance: 16 },
        purple: { saturation: 8, luminance: 10 },
        magenta: { hue: 4, saturation: 8, luminance: 10 },
      },
      grading: {
        shadows: { hue: 255, saturation: 18 },
        highlights: { hue: 340, saturation: 5 },
        blending: 60,
      },
      curves: {
        master: [
          [0, 0.07],
          [0.25, 0.3],
          [0.5, 0.55],
          [0.8, 0.83],
          [1, 0.975],
        ],
      },
      effects: { dreamy: 12 },
    },
  ),
  // -------------------------------------------------------------------------
  // Matte & Earthy
  // -------------------------------------------------------------------------
  preset(
    'Faded Film',
    'matte',
    'A classic matte fade: lifted blacks, quiet colour, fine grain.',
    ['matte', 'faded', 'muted', 'grain'],
    ['contrasty', 'any', 'vivid'],
    {
      basic: { exposure: 0.1, contrast: -12, highlights: -15, shadows: 15, saturation: -20 },
      presence: { clarity: -6 },
      hsl: { red: { saturation: -10 }, green: { saturation: -30 }, blue: { saturation: -25 } },
      grading: { shadows: { hue: 200, saturation: 14 }, highlights: { hue: 45, saturation: 8 } },
      curves: {
        master: [
          [0, 0.09],
          [0.5, 0.515],
          [1, 0.94],
        ],
      },
      effects: { grain: 20, grainSize: 30 },
    },
  ),
  preset(
    'Creamy Beige',
    'matte',
    'Warm cream tones and gentle contrast for a calm, polished feed.',
    ['beige', 'cream', 'neutral', 'soft'],
    ['bright', 'face', 'muted'],
    {
      basic: {
        exposure: 0.25,
        contrast: -12,
        highlights: -25,
        shadows: 15,
        temperature: 12,
        tint: 5,
        saturation: -20,
      },
      presence: { texture: -5 },
      hsl: {
        orange: { luminance: 8 },
        yellow: { hue: -15, saturation: -25, luminance: 15 },
        green: { saturation: -50 },
        blue: { saturation: -45, luminance: 10 },
      },
      grading: {
        shadows: { hue: 50, saturation: 10 },
        midtones: { hue: 60, saturation: 6 },
        highlights: { hue: 70, saturation: 12 },
      },
      curves: {
        master: [
          [0, 0.06],
          [1, 0.97],
        ],
      },
    },
  ),
  preset(
    'Moss',
    'matte',
    'Muted, deep greens with soft earthy shadows. For forests, parks and hikes.',
    ['green', 'forest', 'earthy', 'muted'],
    ['greens', 'flat', 'cool'],
    {
      basic: {
        exposure: -0.1,
        contrast: 5,
        highlights: -20,
        shadows: 10,
        temperature: -5,
        saturation: -25,
      },
      presence: { clarity: 10 },
      hsl: {
        yellow: { hue: 30, saturation: -35, luminance: -10 },
        green: { hue: 25, saturation: -35, luminance: -15 },
        aqua: { saturation: -20 },
        blue: { saturation: -20 },
      },
      grading: { shadows: { hue: 160, saturation: 15 }, highlights: { hue: 80, saturation: 8 } },
      curves: {
        master: [
          [0, 0.06],
          [0.5, 0.5],
          [1, 0.95],
        ],
      },
      effects: { grain: 12 },
    },
  ),
  preset(
    'Cocoa',
    'matte',
    'Rich brown shadows and warm, moody mids. For coffee, wood, autumn and cosy rooms.',
    ['brown', 'moody', 'warm', 'rich'],
    ['warm', 'dark', 'muted'],
    {
      basic: {
        exposure: -0.15,
        contrast: 10,
        highlights: -18,
        shadows: 12,
        whites: -4,
        blacks: -10,
        temperature: 10,
        tint: 3,
        vibrance: -2,
        saturation: -10,
      },
      presence: { clarity: 6 },
      hsl: {
        red: { saturation: -6, luminance: -6 },
        orange: { hue: 2, luminance: -4 },
        yellow: { hue: 8, saturation: -20, luminance: -6 },
        green: { hue: -30, saturation: -45, luminance: -15 },
        aqua: { hue: -20, saturation: -50, luminance: -15 },
        blue: { saturation: -50, luminance: -20 },
      },
      curves: {
        master: [
          [0, 0.039],
          [0.25, 0.25],
          [0.5, 0.506],
          [0.75, 0.762],
          [1, 0.973],
        ],
      },
      grading: {
        shadows: { hue: 25, saturation: 40, luminance: -10 },
        midtones: { hue: 30, saturation: 18 },
        highlights: { hue: 40, saturation: 15, luminance: 3 },
        blending: 55,
        balance: -5,
      },
      effects: { vignette: -20, grain: 10, grainSize: 25, grainRoughness: 45 },
    },
  ),
  preset(
    'Dark Academia',
    'matte',
    'Dim, warm and bookish: olive greens, deep browns, heavy grain.',
    ['dark', 'vintage', 'brown', 'moody'],
    ['dark', 'warm', 'greens'],
    {
      basic: {
        exposure: -0.1,
        contrast: 15,
        highlights: -25,
        shadows: 6,
        blacks: -6,
        temperature: 12,
        saturation: -25,
      },
      hsl: {
        red: { saturation: 10, luminance: -10 },
        orange: { hue: -3, saturation: 5, luminance: -5 },
        yellow: { hue: -20, saturation: -15, luminance: -15 },
        green: { hue: -30, saturation: -40, luminance: -25 },
        blue: { saturation: -50, luminance: -20 },
      },
      grading: {
        shadows: { hue: 50, saturation: 15, luminance: -5 },
        highlights: { hue: 55, saturation: 10 },
      },
      curves: {
        master: [
          [0, 0.05],
          [0.4, 0.36],
          [0.8, 0.79],
          [1, 0.94],
        ],
      },
      effects: { vignette: -18, vignetteFeather: 65, grain: 22, grainSize: 35 },
    },
  ),
  // -------------------------------------------------------------------------
  // Golden Hour
  // -------------------------------------------------------------------------
  preset(
    'Golden Hour',
    'golden-hour',
    'Warm, glowing light as if the sun were low. Adds gold without turning skin orange.',
    ['golden', 'warm', 'sun', 'glow'],
    ['warm', 'face', 'bright'],
    {
      basic: {
        exposure: 0.05,
        contrast: 10,
        highlights: -28,
        shadows: 15,
        temperature: 22,
        tint: 4,
        vibrance: 10,
      },
      presence: { dehaze: 4 },
      hsl: {
        red: { saturation: 6 },
        orange: { hue: -2, saturation: -4 },
        yellow: { hue: -10, saturation: 12 },
        blue: { saturation: -15 },
      },
      grading: {
        shadows: { hue: 30, saturation: 8 },
        highlights: { hue: 55, saturation: 18 },
        global: { hue: 55, saturation: 4 },
      },
      curves: {
        master: [
          [0, 0],
          [0.5, 0.5],
          [1, 0.985],
        ],
      },
      effects: { vignette: -12 },
    },
  ),
  preset(
    'Mediterranean Summer',
    'golden-hour',
    'Sun-warmed whites, deep blue water and clear skies. For coasts and summer trips.',
    ['summer', 'coast', 'blue', 'warm'],
    ['blues', 'bright', 'vivid'],
    {
      basic: {
        exposure: 0.08,
        contrast: 12,
        highlights: -24,
        shadows: 12,
        temperature: 7,
        tint: 2,
        vibrance: 26,
        saturation: 4,
      },
      presence: { clarity: 5, dehaze: 5 },
      hsl: {
        orange: { luminance: 5 },
        yellow: { saturation: 10 },
        green: { hue: -10, saturation: -10 },
        aqua: { hue: -14, saturation: 22 },
        blue: { hue: -16, saturation: 28, luminance: -12 },
      },
      grading: { shadows: { hue: 235, saturation: 14 }, highlights: { hue: 55, saturation: 18 } },
      curves: {
        master: [
          [0, 0],
          [0.5, 0.5],
          [1, 0.985],
        ],
      },
    },
  ),
  preset(
    'Peach Soft Light',
    'golden-hour',
    'A soft peach wash with lifted shadows and gentle highlights. Kind to skin.',
    ['peach', 'soft', 'warm', 'romantic'],
    ['face', 'bright', 'contrasty'],
    {
      basic: {
        exposure: 0.2,
        contrast: -12,
        highlights: -30,
        shadows: 20,
        whites: -6,
        blacks: 12,
        temperature: 16,
        tint: 6,
        vibrance: -2,
      },
      presence: { texture: -4, clarity: -10 },
      hsl: {
        red: { hue: 8, saturation: -2, luminance: 8 },
        orange: { hue: 2, saturation: -4, luminance: 10 },
        yellow: { hue: -8, saturation: -18 },
        green: { hue: -12, saturation: -26, luminance: 8 },
        blue: { saturation: -6, luminance: 8 },
      },
      curves: {
        master: [
          [0, 0.09],
          [0.25, 0.3],
          [0.5, 0.55],
          [0.8, 0.83],
          [1, 0.96],
        ],
      },
      grading: {
        shadows: { hue: 20, saturation: 16 },
        highlights: { hue: 40, saturation: 22 },
        blending: 55,
      },
      effects: { grain: 6 },
    },
  ),
  preset(
    'Autumn Mood',
    'golden-hour',
    'Turns greens to rust and deepens reds for a warm autumn feel.',
    ['autumn', 'rust', 'warm', 'moody'],
    ['greens', 'warm', 'flat'],
    {
      basic: {
        exposure: -0.1,
        contrast: 14,
        highlights: -18,
        shadows: 8,
        temperature: 13,
        tint: 4,
        vibrance: 10,
        saturation: -8,
      },
      presence: { clarity: 8 },
      hsl: {
        red: { saturation: 10, luminance: -10 },
        orange: { hue: -6, saturation: 6, luminance: -3 },
        yellow: { hue: -30, saturation: 20, luminance: -10 },
        green: { hue: -45, saturation: -30, luminance: -15 },
        blue: { saturation: -25 },
      },
      grading: { shadows: { hue: 25, saturation: 12 }, highlights: { hue: 55, saturation: 10 } },
      curves: {
        master: [
          [0, 0.035],
          [0.5, 0.49],
          [1, 0.96],
        ],
      },
      effects: { vignette: -14 },
    },
  ),
  // -------------------------------------------------------------------------
  // Flash & Night
  // -------------------------------------------------------------------------
  preset(
    'Analog Flash',
    'street',
    'Warm, grainy on-camera flash with real falloff into the corners.',
    ['flash', 'film', 'grain', 'night'],
    ['dark', 'face', 'warm'],
    {
      basic: {
        contrast: 18,
        highlights: -40,
        shadows: 14,
        whites: -24,
        blacks: -8,
        temperature: 4,
        saturation: 4,
      },
      presence: { clarity: 6 },
      hsl: { red: { saturation: 10, luminance: -5 }, orange: { saturation: -5, luminance: 6 } },
      grading: { shadows: { hue: 250, saturation: 12 }, highlights: { hue: 45, saturation: 8 } },
      curves: {
        master: [
          [0, 0],
          [0.2, 0.17],
          [0.7, 0.75],
          [1, 0.96],
        ],
      },
      effects: { flash: 32, vignette: -14, grain: 22, grainSize: 30 },
    },
  ),
  preset(
    'Disposable Camera',
    'street',
    'Punchy colour, green-tinted shadows, strong vignette and chunky grain.',
    ['disposable', 'grain', 'vignette', 'party'],
    ['any', 'bright', 'face'],
    {
      basic: {
        exposure: 0.1,
        contrast: 16,
        highlights: -16,
        blacks: -6,
        temperature: 10,
        tint: -2,
        vibrance: 10,
        saturation: 8,
      },
      presence: { texture: 5 },
      hsl: {
        red: { saturation: 10 },
        yellow: { hue: -10, saturation: 15 },
        green: { hue: 20, saturation: 15 },
      },
      grading: { shadows: { hue: 150, saturation: 12 }, highlights: { hue: 60, saturation: 8 } },
      curves: {
        master: [
          [0, 0.04],
          [0.3, 0.28],
          [0.7, 0.75],
          [1, 0.985],
        ],
      },
      effects: {
        vignette: -22,
        vignetteMidpoint: 35,
        vignetteFeather: 50,
        vignetteRoundness: 20,
        grain: 30,
        grainSize: 45,
        grainRoughness: 70,
      },
    },
  ),
  preset(
    'Night Neon',
    'street',
    'Purple shadows and glowing signs: boosts neon colour and adds bloom around lights.',
    ['neon', 'night', 'purple', 'glow'],
    ['dark', 'vivid', 'cool'],
    {
      basic: {
        contrast: 16,
        highlights: -30,
        shadows: 8,
        blacks: -8,
        temperature: -10,
        tint: 5,
        vibrance: 28,
        saturation: 4,
      },
      presence: { clarity: 8, dehaze: 6 },
      hsl: {
        orange: { hue: -3 },
        aqua: { saturation: 28, luminance: 6 },
        blue: { hue: -12, saturation: 16 },
        purple: { hue: -10, saturation: 28 },
        magenta: { saturation: 28, luminance: 6 },
      },
      grading: { shadows: { hue: 275, saturation: 30 }, highlights: { hue: 330, saturation: 8 } },
      curves: {
        master: [
          [0, 0],
          [0.25, 0.235],
          [0.75, 0.77],
          [1, 0.94],
        ],
      },
      effects: { bloom: 10, halation: 20, grain: 10, grainSize: 30 },
    },
  ),
  preset(
    'Sodium Streetlight',
    'street',
    'Orange streetlight against teal shadows, with heavy grain. For streets after dark.',
    ['street', 'night', 'orange', 'grain'],
    ['dark', 'warm', 'contrasty'],
    {
      basic: {
        contrast: 20,
        highlights: -26,
        shadows: 10,
        blacks: -10,
        temperature: 6,
        vibrance: -6,
        saturation: -8,
      },
      presence: { clarity: 10, texture: 10 },
      hsl: {
        red: { hue: 8, saturation: -10 },
        orange: { hue: -4, saturation: 10 },
        yellow: { hue: -18, saturation: 4 },
        green: { hue: 40, saturation: -40 },
        blue: { hue: -20, saturation: -10 },
        purple: { saturation: -40 },
      },
      curves: {
        master: [
          [0, 0.01],
          [0.22, 0.17],
          [0.5, 0.485],
          [0.8, 0.82],
          [1, 0.97],
        ],
      },
      grading: {
        shadows: { hue: 185, saturation: 28 },
        highlights: { hue: 35, saturation: 26 },
        blending: 50,
      },
      effects: { vignette: -16, grain: 28, grainSize: 34, grainRoughness: 65 },
    },
  ),
  preset(
    'Gritty Street',
    'street',
    'Drained colour, hard texture and grain for honest street photos.',
    ['street', 'gritty', 'texture', 'muted'],
    ['flat', 'muted', 'contrasty'],
    {
      basic: {
        contrast: 20,
        highlights: -26,
        shadows: 12,
        blacks: -8,
        temperature: -2,
        vibrance: -10,
        saturation: -28,
      },
      presence: { texture: 14, clarity: 12, dehaze: 4 },
      hsl: {
        red: { saturation: 4 },
        orange: { saturation: -6 },
        yellow: { saturation: -14 },
        green: { hue: -20, saturation: -40, luminance: -8 },
        blue: { saturation: -24, luminance: -12 },
      },
      curves: {
        master: [
          [0, 0.012],
          [0.25, 0.225],
          [0.5, 0.502],
          [0.75, 0.78],
          [1, 0.985],
        ],
      },
      grading: {
        shadows: { hue: 210, saturation: 20, luminance: -6 },
        midtones: { hue: 35, saturation: 8 },
        highlights: { hue: 45, saturation: 14, luminance: 2 },
        blending: 50,
      },
      effects: { vignette: -12, grain: 24, grainSize: 34, grainRoughness: 60 },
    },
  ),
  // -------------------------------------------------------------------------
  // Black & White
  // -------------------------------------------------------------------------
  preset(
    'Classic Monochrome',
    'bw',
    'A balanced black and white with deep skies, bright skin and light grain.',
    ['black and white', 'mono', 'classic'],
    ['any', 'blues', 'face'],
    {
      basic: { contrast: 25, highlights: -15, shadows: 10, blacks: -15, monochrome: 100 },
      presence: { clarity: 15 },
      hsl: {
        red: { luminance: 10 },
        orange: { luminance: 15 },
        yellow: { luminance: 10 },
        green: { luminance: -10 },
        aqua: { luminance: -10 },
        blue: { luminance: -25 },
        purple: { luminance: -10 },
      },
      curves: {
        master: [
          [0, 0.02],
          [0.25, 0.21],
          [0.75, 0.8],
          [1, 0.99],
        ],
      },
      effects: { vignette: -15, grain: 15, grainSize: 25 },
    },
  ),
  preset(
    'Silver Gelatin',
    'bw',
    'A rich darkroom print: deep blacks, bright silver highlights.',
    ['black and white', 'print', 'contrast'],
    ['contrasty', 'dark'],
    {
      basic: { monochrome: 100, contrast: 24, highlights: -32, shadows: 6, whites: 2, blacks: -15 },
      presence: { clarity: 16, texture: 8 },
      hsl: {
        red: { luminance: 10 },
        orange: { luminance: 14 },
        yellow: { luminance: 6 },
        green: { luminance: -6 },
        blue: { luminance: -22 },
        aqua: { luminance: -12 },
      },
      curves: {
        master: [
          [0, 0.01],
          [0.2, 0.14],
          [0.5, 0.5],
          [0.82, 0.87],
          [1, 0.98],
        ],
      },
      effects: { grain: 28, grainSize: 30, grainRoughness: 60, vignette: -14 },
    },
  ),
  preset(
    'Soft Matte B&W',
    'bw',
    'A gentle, low-contrast black and white with lifted blacks.',
    ['black and white', 'matte', 'soft'],
    ['face', 'bright', 'contrasty'],
    {
      basic: {
        exposure: 0.1,
        contrast: -4,
        highlights: -16,
        shadows: 16,
        whites: 2,
        blacks: 6,
        monochrome: 100,
      },
      presence: { texture: -4, clarity: -4 },
      hsl: {
        red: { luminance: 8 },
        orange: { luminance: 10 },
        yellow: { luminance: 4 },
        aqua: { luminance: -4 },
        blue: { luminance: -10 },
        purple: { luminance: -4 },
      },
      curves: {
        master: [
          [0, 0.063],
          [0.25, 0.281],
          [0.5, 0.516],
          [0.75, 0.751],
          [1, 0.969],
        ],
      },
      effects: { vignette: -8, grain: 14, grainSize: 30, grainRoughness: 50 },
    },
  ),
  preset(
    'Newsprint',
    'bw',
    'Hard, bright black and white with heavy grain, like a pushed press photo.',
    ['black and white', 'grain', 'hard', 'press'],
    ['flat', 'vivid', 'bright'],
    {
      basic: {
        monochrome: 100,
        brightness: 8,
        contrast: 40,
        highlights: -24,
        shadows: 10,
        blacks: -12,
      },
      presence: { texture: 12, clarity: 18 },
      hsl: {
        red: { luminance: 14 },
        orange: { luminance: 16 },
        yellow: { luminance: 8 },
        green: { luminance: -8 },
        aqua: { luminance: -16 },
        blue: { luminance: -30 },
      },
      curves: {
        master: [
          [0, 0],
          [0.2, 0.14],
          [0.5, 0.5],
          [0.8, 0.875],
          [1, 0.985],
        ],
      },
      effects: { grain: 46, grainSize: 42, grainRoughness: 75, vignette: -12 },
    },
  ),
  preset(
    'Tea Stain',
    'bw',
    'A warm-toned black and white, soft and slightly aged.',
    ['black and white', 'sepia', 'warm', 'toned'],
    ['face', 'warm', 'muted'],
    {
      basic: { monochrome: 100, contrast: 6, highlights: -22, shadows: 14, blacks: 4 },
      presence: { clarity: 4 },
      hsl: { red: { luminance: 6 }, orange: { luminance: 10 }, blue: { luminance: -10 } },
      curves: {
        master: [
          [0, 0.04],
          [0.25, 0.26],
          [0.5, 0.51],
          [0.75, 0.76],
          [1, 0.97],
        ],
        red: [
          [0, 0.02],
          [0.5, 0.525],
          [1, 1],
        ],
        blue: [
          [0, 0],
          [0.5, 0.465],
          [1, 0.94],
        ],
      },
      effects: { grain: 16, grainSize: 30, vignette: -8 },
    },
  ),
  // -------------------------------------------------------------------------
  // Pocket Digicam (the early-2000s pocket camera: CCD colour, flash, fringes)
  // -------------------------------------------------------------------------
  preset(
    'Pocket Flash',
    'digicam',
    'Early-2000s pocket-camera flash: bright centre, cool cast, colour fringes at the edges.',
    ['flash', 'digicam', '2000s', 'party'],
    ['dark', 'face', 'vivid'],
    {
      basic: {
        contrast: 12,
        highlights: -40,
        shadows: 12,
        whites: -24,
        blacks: -6,
        temperature: -5,
        tint: 4,
        vibrance: 12,
        saturation: 6,
      },
      hsl: {
        red: { saturation: 8 },
        orange: { saturation: -4, luminance: 6 },
        aqua: { saturation: 10 },
        blue: { hue: 6, saturation: 14 },
        magenta: { saturation: 10 },
      },
      grading: { shadows: { hue: 265, saturation: 10 }, highlights: { hue: 205, saturation: 6 } },
      curves: {
        master: [
          [0, 0.02],
          [0.3, 0.3],
          [0.7, 0.75],
          [1, 0.97],
        ],
      },
      effects: { flash: 34, fringe: 30, bloom: 8, grain: 8, grainSize: 15, grainRoughness: 70 },
    },
  ),
  preset(
    'CCD Daylight',
    'digicam',
    'Crisp, cool pocket-camera daylight: punchy blues, a magenta lean and colour fringes at the edges.',
    ['digicam', 'ccd', '2000s', 'crisp'],
    ['bright', 'blues', 'any', 'face'],
    {
      basic: {
        contrast: 14,
        highlights: -18,
        shadows: 8,
        blacks: -6,
        temperature: -6,
        tint: 6,
        vibrance: 18,
        saturation: 6,
      },
      presence: { texture: 8, clarity: 6 },
      hsl: {
        red: { saturation: 6 },
        orange: { saturation: -6, luminance: 4 },
        green: { hue: 8, saturation: 8 },
        aqua: { saturation: 12 },
        blue: { hue: 4, saturation: 16, luminance: -6 },
        magenta: { saturation: 8 },
      },
      curves: {
        master: [
          [0, 0.01],
          [0.25, 0.22],
          [0.75, 0.79],
          [1, 0.975],
        ],
      },
      effects: { fringe: 22, grain: 10, grainSize: 12, grainRoughness: 75 },
    },
  ),
  preset(
    'Mall 2004',
    'digicam',
    'Indoor digicam under strip lights: a green-yellow cast, soft highlights and a little glow.',
    ['digicam', '2000s', 'indoor', 'green'],
    ['flat', 'face', 'muted', 'warm'],
    {
      basic: {
        brightness: 6,
        contrast: 8,
        highlights: -30,
        shadows: 16,
        temperature: 4,
        tint: -10,
        vibrance: 8,
        saturation: -6,
      },
      hsl: {
        orange: { saturation: -8, luminance: 6 },
        yellow: { hue: 6, saturation: -10 },
        green: { hue: -8, saturation: -12 },
        blue: { saturation: -10 },
      },
      grading: { shadows: { hue: 150, saturation: 12 }, highlights: { hue: 75, saturation: 10 } },
      curves: {
        master: [
          [0, 0.03],
          [0.3, 0.31],
          [0.7, 0.74],
          [1, 0.97],
        ],
      },
      effects: { fringe: 14, bloom: 6, grain: 12, grainSize: 14, grainRoughness: 70 },
    },
  ),
  preset(
    'Blue Screen',
    'digicam',
    'A cold, washed CCD look with cyan highlights and blue shadows, like a camera left on the wrong white balance.',
    ['digicam', 'ccd', 'cold', 'washed'],
    ['bright', 'cool', 'contrasty', 'blues'],
    {
      basic: {
        contrast: 6,
        highlights: -22,
        shadows: 14,
        blacks: 6,
        temperature: -18,
        tint: 2,
        vibrance: 10,
        saturation: -8,
      },
      hsl: {
        orange: { saturation: 6, luminance: 4 },
        aqua: { hue: -6, saturation: 10, luminance: 6 },
        blue: { saturation: 8, luminance: 4 },
      },
      grading: { shadows: { hue: 220, saturation: 18 }, highlights: { hue: 195, saturation: 10 } },
      curves: {
        master: [
          [0, 0.05],
          [0.5, 0.52],
          [1, 0.96],
        ],
      },
      effects: { fringe: 18, grain: 12, grainSize: 12, grainRoughness: 75 },
    },
  ),
  // -------------------------------------------------------------------------
  // 2016 (warm, saturated, matte: the feed of ten years ago)
  // -------------------------------------------------------------------------
  preset(
    'Golden Feed',
    'y2016',
    'Warm, saturated and a little faded: the sunny feed look of 2016.',
    ['2016', 'warm', 'saturated', 'matte'],
    ['any', 'bright', 'face', 'warm'],
    {
      basic: {
        exposure: 0.1,
        contrast: 10,
        highlights: -22,
        shadows: 16,
        blacks: 10,
        temperature: 12,
        tint: 3,
        vibrance: 22,
        saturation: 8,
      },
      hsl: {
        orange: { saturation: 6, luminance: 4 },
        yellow: { hue: -8, saturation: 8 },
        green: { hue: 14, saturation: -12 },
        blue: { hue: -8, saturation: -6 },
      },
      curves: {
        master: [
          [0, 0.07],
          [0.25, 0.27],
          [0.75, 0.78],
          [1, 0.97],
        ],
      },
      effects: { grain: 10, grainSize: 22 },
    },
  ),
  preset(
    'Blog Matte',
    'y2016',
    'Cool, drained and matte with blue in the blacks, like an old photo blog.',
    ['2016', 'matte', 'cool', 'faded'],
    ['contrasty', 'vivid', 'cool', 'flat'],
    {
      basic: {
        contrast: 14,
        highlights: -16,
        shadows: 12,
        blacks: 14,
        temperature: -10,
        saturation: -24,
      },
      grading: { shadows: { hue: 228, saturation: 24 }, highlights: { hue: 50, saturation: 6 } },
      curves: {
        master: [
          [0, 0.12],
          [0.3, 0.27],
          [0.7, 0.73],
          [1, 0.92],
        ],
      },
      effects: { grain: 14, grainSize: 24, vignette: -10 },
    },
  ),
  preset(
    'Cali Haze',
    'y2016',
    'A bright pink-orange haze with soft contrast, like a road trip at six in the evening.',
    ['2016', 'haze', 'pink', 'soft'],
    ['bright', 'warm', 'contrasty', 'face'],
    {
      basic: {
        exposure: 0.15,
        contrast: -8,
        highlights: -26,
        shadows: 22,
        temperature: 8,
        tint: 14,
        vibrance: 14,
      },
      presence: { clarity: -6, dehaze: -12 },
      grading: { shadows: { hue: 300, saturation: 14 }, highlights: { hue: 40, saturation: 16 } },
      curves: {
        master: [
          [0, 0.06],
          [0.5, 0.54],
          [1, 0.97],
        ],
      },
      effects: { grain: 8, grainSize: 22 },
    },
  ),
  preset(
    'Pool Party',
    'y2016',
    'Bright aqua highlights and loud blues with firm contrast. For water, skies and summer.',
    ['2016', 'aqua', 'vivid', 'summer'],
    ['blues', 'bright', 'vivid', 'flat'],
    {
      basic: {
        contrast: 20,
        highlights: -20,
        shadows: 10,
        blacks: -6,
        temperature: -4,
        vibrance: 26,
        saturation: 6,
      },
      hsl: {
        orange: { saturation: 8 },
        aqua: { hue: -8, saturation: 22, luminance: 8 },
        blue: { hue: -12, saturation: 18 },
      },
      grading: { shadows: { hue: 240, saturation: 8 }, highlights: { hue: 185, saturation: 14 } },
      curves: {
        master: [
          [0, 0],
          [0.25, 0.22],
          [0.75, 0.79],
          [1, 0.985],
        ],
      },
    },
  ),
  // -------------------------------------------------------------------------
  // Camcorder (home video: soft, lifted, colours that bleed)
  // -------------------------------------------------------------------------
  preset(
    'Home Video',
    'camcorder',
    'Soft, low-contrast tape with lifted blacks, a green-cyan lean and colours that bleed at the edges.',
    ['camcorder', 'tape', 'soft', 'vhs'],
    ['any', 'contrasty', 'face', 'vivid'],
    {
      basic: {
        contrast: -10,
        highlights: -24,
        shadows: 14,
        blacks: 12,
        temperature: -4,
        tint: -6,
        saturation: -14,
      },
      presence: { texture: -10, clarity: -8 },
      hsl: { red: { saturation: 10 }, blue: { saturation: -10 } },
      grading: { shadows: { hue: 180, saturation: 14 }, midtones: { hue: 120, saturation: 5 } },
      curves: {
        master: [
          [0, 0.08],
          [0.5, 0.5],
          [1, 0.92],
        ],
      },
      effects: { fringe: 30, softFocus: 30, grain: 14, grainSize: 18, grainRoughness: 80 },
    },
  ),
  preset(
    'Tape Sunset',
    'camcorder',
    'Warm magenta tape with glowing reds, like a holiday filmed at dusk.',
    ['camcorder', 'tape', 'magenta', 'warm'],
    ['warm', 'vivid', 'dark', 'face'],
    {
      basic: {
        contrast: 4,
        highlights: -26,
        shadows: 10,
        blacks: 10,
        temperature: 10,
        tint: 12,
        vibrance: 16,
        saturation: 4,
      },
      presence: { texture: -8, clarity: -6 },
      hsl: {
        red: { saturation: 14 },
        orange: { saturation: 6 },
        blue: { hue: 10, saturation: -8 },
      },
      grading: { shadows: { hue: 285, saturation: 18 }, highlights: { hue: 35, saturation: 14 } },
      curves: {
        master: [
          [0, 0.07],
          [0.5, 0.51],
          [1, 0.94],
        ],
      },
      effects: { fringe: 26, halation: 18, grain: 12, grainSize: 18, grainRoughness: 80 },
    },
  ),
  preset(
    'Night Shot',
    'camcorder',
    'The green night mode of an old camcorder: bright shadows, heavy noise, dark corners.',
    ['camcorder', 'night', 'green', 'noise'],
    ['dark', 'contrasty', 'muted'],
    {
      basic: { monochrome: 100, brightness: 6, contrast: 18, highlights: -20, shadows: 24 },
      curves: {
        master: [
          [0, 0.03],
          [0.5, 0.52],
          [1, 0.97],
        ],
        red: [
          [0, 0],
          [0.5, 0.36],
          [1, 0.78],
        ],
        green: [
          [0, 0.03],
          [0.5, 0.56],
          [1, 1],
        ],
        blue: [
          [0, 0],
          [0.5, 0.36],
          [1, 0.8],
        ],
      },
      effects: { grain: 34, grainSize: 16, grainRoughness: 85, vignette: -20 },
    },
  ),
  // -------------------------------------------------------------------------
  // Lofi Dusk (purple evenings, neon and glow)
  // -------------------------------------------------------------------------
  preset(
    'Lofi Dusk',
    'lofi',
    'Purple-blue dusk with warm lights kept glowing, grain and a soft red halo.',
    ['lofi', 'dusk', 'purple', 'glow'],
    ['dark', 'cool', 'warm', 'face'],
    {
      basic: {
        exposure: -0.05,
        contrast: 8,
        highlights: -28,
        shadows: 12,
        blacks: 6,
        temperature: -14,
        tint: 10,
        vibrance: 14,
        saturation: -6,
      },
      hsl: {
        orange: { saturation: 14, luminance: 6 },
        blue: { hue: 12, saturation: 10, luminance: -8 },
        purple: { saturation: 16 },
        magenta: { saturation: 10 },
      },
      grading: {
        shadows: { hue: 265, saturation: 30 },
        midtones: { hue: 290, saturation: 8 },
        highlights: { hue: 25, saturation: 16 },
      },
      curves: {
        master: [
          [0, 0.05],
          [0.25, 0.24],
          [0.75, 0.76],
          [1, 0.95],
        ],
      },
      effects: {
        halation: 30,
        bloom: 8,
        grain: 20,
        grainSize: 28,
        grainRoughness: 60,
        vignette: -12,
      },
    },
  ),
  preset(
    'Rooftop Pink',
    'lofi',
    'A pink sky over teal shadows, soft and a little glowing.',
    ['lofi', 'pink', 'teal', 'sunset'],
    ['bright', 'blues', 'warm', 'vivid'],
    {
      basic: { contrast: 10, highlights: -26, shadows: 14, temperature: 2, tint: 18, vibrance: 18 },
      hsl: {
        red: { hue: -8, saturation: 10 },
        orange: { hue: -6 },
        aqua: { hue: -10, saturation: 10 },
        blue: { hue: 18, saturation: 6 },
      },
      grading: {
        shadows: { hue: 195, saturation: 24 },
        highlights: { hue: 330, saturation: 20 },
        blending: 60,
      },
      curves: {
        master: [
          [0, 0.04],
          [0.5, 0.5],
          [1, 0.96],
        ],
      },
      effects: { bloom: 6, grain: 14, grainSize: 26 },
    },
  ),
  preset(
    'Arcade',
    'lofi',
    'Cyan shadows against magenta lights, saturated and glowing. For signs, screens and city nights.',
    ['lofi', 'neon', 'cyan', 'magenta'],
    ['dark', 'vivid', 'cool', 'contrasty'],
    {
      basic: {
        contrast: 16,
        highlights: -28,
        shadows: 10,
        blacks: -6,
        temperature: -6,
        vibrance: 24,
      },
      hsl: {
        orange: { saturation: -6 },
        aqua: { saturation: 24 },
        purple: { saturation: 16 },
        magenta: { saturation: 24 },
      },
      grading: { shadows: { hue: 190, saturation: 32 }, highlights: { hue: 315, saturation: 22 } },
      curves: {
        master: [
          [0, 0.02],
          [0.25, 0.22],
          [0.75, 0.78],
          [1, 0.95],
        ],
      },
      effects: { halation: 16, bloom: 6, fringe: 10, grain: 12, grainSize: 26 },
    },
  ),
];

/**
 * Looks from the earlier 186-look library that were renamed or folded into a look above
 * (old id -> current id). Used once, to carry Kept and Last roll over; photos edited with an old
 * look are unaffected because an applied look stores its own values.
 */
export const LOOK_ALIASES: Record<string, string> = {
  'builtin:portra-inspired-warm-film': 'builtin:sunday-negative',
  'builtin:golden-portrait-negative': 'builtin:sunday-negative',
  'builtin:warm-grain': 'builtin:sunday-negative',
  'builtin:earthy-travel': 'builtin:sunday-negative',
  'builtin:warm-negative': 'builtin:sunday-negative',
  'builtin:airy-pastel-negative': 'builtin:open-shade',
  'builtin:coastal-film': 'builtin:open-shade',
  'builtin:soft-editorial-skin': 'builtin:open-shade',
  'builtin:fuji-inspired-natural-film': 'builtin:green-room',
  'builtin:neon-melancholy': 'builtin:green-room',
  'builtin:green-cast-street': 'builtin:green-room',
  'builtin:fashion-editorial': 'builtin:classic-35mm',
  'builtin:expired-summer-gold': 'builtin:expired-summer',
  'builtin:vintage-negative': 'builtin:retro-70s',
  'builtin:blockbuster-teal-amber': 'builtin:teal-and-orange',
  'builtin:concrete-teal': 'builtin:teal-and-orange',
  'builtin:teal-amber-reserve': 'builtin:teal-and-orange',
  'builtin:old-money': 'builtin:warm-film-cinema',
  'builtin:warm-cinema-amber': 'builtin:warm-film-cinema',
  'builtin:deep-ocean-teal': 'builtin:neo-noir-emerald',
  'builtin:midnight-blockbuster': 'builtin:midnight-cinema',
  'builtin:neo-noir-rain': 'builtin:midnight-cinema',
  'builtin:deep-atmosphere': 'builtin:midnight-cinema',
  'builtin:cinema-tungsten-500': 'builtin:tungsten-hours',
  'builtin:cool-shadows': 'builtin:tungsten-hours',
  'builtin:bleach-bypass': 'builtin:silver-retain',
  'builtin:pale-blue-editorial': 'builtin:powder-blue',
  'builtin:storybook-pastel': 'builtin:sherbet',
  'builtin:soft-pastel-dream': 'builtin:sherbet',
  'builtin:soft-cinematic-fade': 'builtin:faded-film',
  'builtin:35mm-nostalgia': 'builtin:faded-film',
  'builtin:bone-matte-editorial': 'builtin:faded-film',
  'builtin:soft-memory': 'builtin:faded-film',
  'builtin:sage-matte': 'builtin:faded-film',
  'builtin:dusty-rose-film': 'builtin:faded-film',
  'builtin:washed-out-wonder': 'builtin:faded-film',
  'builtin:quiet-luxury': 'builtin:creamy-beige',
  'builtin:champagne-editorial': 'builtin:creamy-beige',
  'builtin:muted-forest': 'builtin:moss',
  'builtin:moody-forest-fog': 'builtin:moss',
  'builtin:moody-chocolate-brown': 'builtin:cocoa',
  'builtin:rich-espresso': 'builtin:cocoa',
  'builtin:desert-epic': 'builtin:cocoa',
  'builtin:golden-skin': 'builtin:golden-hour',
  'builtin:soft-gold': 'builtin:golden-hour',
  'builtin:desert-warmth': 'builtin:golden-hour',
  'builtin:bronze-glow': 'builtin:golden-hour',
  'builtin:golden-hour-glow': 'builtin:golden-hour',
  'builtin:riviera-sun': 'builtin:mediterranean-summer',
  'builtin:ivory-bridal': 'builtin:peach-soft-light',
  'builtin:vibrant-travel': 'builtin:vivid-postcard',
  'builtin:tropical-greens': 'builtin:vivid-postcard',
  'builtin:epic-landscape-pop': 'builtin:vivid-postcard',
  'builtin:emerald-rainforest': 'builtin:velvet-slide',
  'builtin:natural-skin': 'builtin:daylight',
  'builtin:luminous-skin': 'builtin:daylight',
  'builtin:neutral-headshot': 'builtin:clean-studio',
  'builtin:y2k-flash': 'builtin:pocket-flash',
  'builtin:direct-flash-editorial': 'builtin:analog-flash',
  'builtin:cyberpunk-neon': 'builtin:night-neon',
  'builtin:electric-night': 'builtin:night-neon',
  'builtin:high-contrast-street': 'builtin:gritty-street',
  'builtin:couture-monochrome': 'builtin:silver-gelatin',
  'builtin:platinum-noir': 'builtin:classic-monochrome',
  'builtin:hard-light-noir': 'builtin:newsprint',
  'builtin:soft-mono-poetry': 'builtin:soft-matte-b-w',
};

/**
 * Kept and Last roll after the library was curated: a renamed or merged look points at its
 * replacement, ids that no longer exist are dropped, and nothing appears twice.
 */
export function migrateLookIds(ids: readonly string[], known: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const next = known.has(id) ? id : LOOK_ALIASES[id];
    if (next && known.has(next) && !out.includes(next)) out.push(next);
  }
  return out;
}
