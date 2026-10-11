# Signature Collection: 30 premium one-click presets

_Written 2026-10-11 for the agent that will add these to Lumen Atelier. Every value below was validated
against the app's schema and rendered with the app's own CPU renderer before being written here._

## What this is

Thirty **original** colour grades built to the standard of the most expensive commercial preset packs:
pro film emulation, Hollywood-style cinema grades, luxury editorial, portrait, landscape and night looks.
Each one is meant to give a photo a finished, "wow" look in **one click**, and to stay good at 100 %.

They complement, not duplicate, the 70 built-in presets in `src/lib/presets/library.ts` (checked: every
new preset differs measurably from all 70 and from each other).

### Legal note (keep it this way)

Commercial presets (VSCO, Mastin Labs, RNI, Lightroom marketplace packs, Hollywood LUT packs) are
copyrighted products, and film stock names are trademarks. **Do not copy their settings and do not use
their brand or film-stock names.** These are original looks that capture the *style families* those packs
are famous for, with neutral names, consistent with the README's no-affiliation statement.

## Quality rules these presets were tuned to

Measured on 9 test images (Windows wallpapers: beach, blossom, mountain lake, misty lake, sunset; plus the
synthetic portrait, jungle, forest and street scenes from `src/lib/analysis/evalScenes.ts`):

1. **No blown highlights.** No preset clips more of a bright, hazy-sky photo than the untouched original
   (original 12.1 % pure white; worst preset 8.5 %, in a black-and-white look). The first drafts clipped up to
   47 % and turned pale skies white; that was fixed by pulling highlights harder and never pushing whites.
2. **Skies stay sky-coloured** unless the look is deliberately monochrome or warm (Desert Epic, Golden Hour).
3. **Skin stays believable.** Warm looks were capped so faces never turn orange.
4. **Every look is visible.** Weak drafts (barely different from the original) were strengthened.
5. **Distinct.** Minimum colour distance to any other preset is >= 0.016 (the library test requires > 0.01).
6. **Schema-exact.** Every value is inside `RANGES` and survives `PartialAdjustmentsSchema` unchanged.

## How to add them (instructions for the implementing agent)

1. Read `AGENTS.md`, `src/lib/presets/library.ts` and `src/lib/presets/blend.test.ts` first.
2. Add one category to `PRESET_CATEGORIES` in `library.ts`: **`'signature'`** with the label
   **`'Signature Collection'`** in `CATEGORY_LABELS`. Show it **first** in the preset browser, so users see it
   by default. (One category keeps the browser tidy; the six groups below go into each preset's tags.)
3. Append the 30 presets below to `BUILTIN_PRESETS`, using the existing `preset(name, category, description,
   tags, adjustments)` helper with category `'signature'`. Copy the `adjustments` objects **exactly**.
   Add the group as an extra tag (e.g. `'cinema'`, `'editorial'`) so search finds them.
4. Update `blend.test.ts`: the library now has **100** presets (10 in each original category, 30 in
   `signature`); keep the uniqueness, "schema-valid without clamping", "meaningfully different" and
   "changes the image" tests passing for all 100.
5. Add a test that the signature presets do not clip highlights: render a bright gradient/sky fixture with
   `cpuRender` and assert the fraction of pure-white pixels is not above the untouched render's.
6. Preset thumbnails are generated automatically (`src/engine/presetThumbs.ts`); check the browser shows
   real previews for all 30 and that search/favourites/intensity work for them.
7. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npx playwright test e2e/editor.spec.ts`
   (the presets e2e). Then apply a few presets to real photos in the running app and look at the result.
8. Do **not** change `pixel.ts`/`shaders.ts` for this: these presets use existing controls only.

## The collection at a glance

| # | Preset | Group | Best for |
| --- | --- | --- | --- |
| 1 | [Golden Portrait Negative](#golden-portrait-negative) | Signature Film | portraits, weddings, golden-hour people |
| 2 | [Velvet Slide](#velvet-slide) | Signature Film | landscapes, travel, flowers, sunny skies |
| 3 | [Airy Pastel Negative](#airy-pastel-negative) | Signature Film | weddings, lifestyle, beaches, overcast portraits |
| 4 | [Cinema Tungsten 500](#cinema-tungsten-500) | Signature Film | night streets, neon, interiors under warm lights |
| 5 | [Expired Summer Gold](#expired-summer-gold) | Signature Film | summer holidays, friends, road trips, snapshots |
| 6 | [Silver Gelatin](#silver-gelatin) | Signature Film | street, portraits, architecture, drama |
| 7 | [Blockbuster Teal & Amber](#blockbuster-teal-amber) | Cinema | people outdoors, city, action, sunsets |
| 8 | [Neo-Noir Emerald](#neo-noir-emerald) | Cinema | night interiors, urban, mystery, moody portraits |
| 9 | [Desert Epic](#desert-epic) | Cinema | deserts, dunes, ruins, dramatic landscapes |
| 10 | [Nordic Noir](#nordic-noir) | Cinema | overcast days, winter, coast, minimal portraits |
| 11 | [Neon Melancholy](#neon-melancholy) | Cinema | night city, bars, rain, couples after dark |
| 12 | [Storybook Pastel](#storybook-pastel) | Cinema | architecture, interiors, colourful streets, quirky portraits |
| 13 | [Glossy Cover](#glossy-cover) | Editorial & Luxury | fashion, beauty, studio portraits, campaigns |
| 14 | [Bone Matte Editorial](#bone-matte-editorial) | Editorial & Luxury | minimal fashion, interiors, product, linen and stone |
| 15 | [Riviera Sun](#riviera-sun) | Editorial & Luxury | yachts, pools, coastal towns, resort fashion |
| 16 | [Couture Monochrome](#couture-monochrome) | Editorial & Luxury | fashion portraits, beauty, architecture, product |
| 17 | [Ivory Bridal](#ivory-bridal) | Editorial & Luxury | weddings, engagements, florals, soft daylight |
| 18 | [Gourmet Editorial](#gourmet-editorial) | Editorial & Luxury | food, drinks, restaurants, cafe and table scenes |
| 19 | [Luminous Skin](#luminous-skin) | Portrait | headshots, beauty, close portraits, any skin tone |
| 20 | [Bronze Glow](#bronze-glow) | Portrait | outdoor portraits, beach, golden hour, deeper skin tones |
| 21 | [Chiaroscuro](#chiaroscuro) | Portrait | low-key portraits, window light, dramatic close-ups |
| 22 | [Peach Soft Light](#peach-soft-light) | Portrait | lifestyle, couples, kids, natural-light portraits |
| 23 | [Moody Forest Fog](#moody-forest-fog) | Nature & Landscape | forests, ferns, foliage, rainy and foggy hikes |
| 24 | [Emerald Rainforest](#emerald-rainforest) | Nature & Landscape | jungle, tropical plants, gardens, wet leaves, flowers |
| 25 | [Alpine Clarity](#alpine-clarity) | Nature & Landscape | mountains, lakes, snow, hiking views |
| 26 | [Golden Hour Glow](#golden-hour-glow) | Nature & Landscape | sunsets, backlit people, fields, beaches |
| 27 | [Deep Ocean Teal](#deep-ocean-teal) | Nature & Landscape | sea, lakes, rainy coasts, blue-water scenes |
| 28 | [Electric Night](#electric-night) | Urban & Night | night city, neon signs, rain, cars at night |
| 29 | [Concrete Teal](#concrete-teal) | Urban & Night | architecture, street fashion, skateparks, city portraits |
| 30 | [Sodium Streetlight](#sodium-streetlight) | Urban & Night | late-night streets, parking lots, documentary, urban grit |

### Tips for users

- Start at **100 %**, then use the **Intensity** slider (60–80 % is a refined, subtle version of most looks).
- Fix exposure first if the photo is very dark or bright; presets shape colour and tone, they don't rescue exposure.
- For a look that should fit a specific photo's colours, apply a preset and then use **Match to this photo**
  with a reference, or analyse a reference photo in the studio.

## Signature Film

### Golden Portrait Negative

Warm, creamy professional colour-negative look: soft contrast, peachy skin, gentle pastel greens, soft blue skies and fine grain.

**Best for:** portraits, weddings, golden-hour people  
**Tags:** film, warm, skin, soft

```ts
preset(
  'Golden Portrait Negative',
  'signature',
  'Warm, creamy professional colour-negative look: soft contrast, peachy skin, gentle pastel greens, soft blue skies and fine grain.',
  ['film', 'warm', 'skin', 'soft'],
  {
    basic: {
      exposure: 0.1,
      contrast: -6,
      highlights: -32,
      shadows: 18,
      whites: -8,
      blacks: 5,
      temperature: 4,
      tint: 3,
      vibrance: -4,
      saturation: -3,
    },
    presence: { clarity: -6 },
    hsl: {
      red: { hue: 4, saturation: -8 },
      orange: { hue: 3, saturation: -4, luminance: 6 },
      yellow: { hue: -8, saturation: -14 },
      green: { hue: -22, saturation: -26, luminance: 4 },
      aqua: { hue: -6, saturation: -8 },
      blue: { hue: -6, saturation: -2, luminance: 4 },
    },
    curves: { master: [[0, 0.04], [0.25, 0.25], [0.5, 0.52], [0.78, 0.8], [1, 0.96]] },
    grading: { shadows: { hue: 190, saturation: 10 }, highlights: { hue: 45, saturation: 10 }, blending: 60, balance: 10 },
    effects: { grain: 14, grainSize: 22, grainRoughness: 45 },
  },
),
```

### Velvet Slide

Rich slide-film colour with deep saturated blues and greens, dense blacks and crisp contrast.

**Best for:** landscapes, travel, flowers, sunny skies  
**Tags:** film, vivid, slide, landscape

```ts
preset(
  'Velvet Slide',
  'signature',
  'Rich slide-film colour with deep saturated blues and greens, dense blacks and crisp contrast.',
  ['film', 'vivid', 'slide', 'landscape'],
  {
    basic: {
      exposure: -0.1,
      contrast: 22,
      highlights: -28,
      shadows: -4,
      whites: 4,
      blacks: -14,
      temperature: -2,
      vibrance: 22,
      saturation: 8,
    },
    presence: { clarity: 10, dehaze: 8 },
    hsl: {
      red: { saturation: 10 },
      orange: { saturation: -4 },
      yellow: { hue: -4, saturation: 6 },
      green: { hue: 8, saturation: 14, luminance: -8 },
      aqua: { hue: 4, saturation: 16, luminance: -6 },
      blue: { hue: -4, saturation: 18, luminance: -14 },
      purple: { saturation: 8 },
    },
    curves: { master: [[0, 0], [0.22, 0.17], [0.5, 0.5], [0.8, 0.85], [1, 0.99]] },
    grading: { shadows: { hue: 230, saturation: 8 }, blending: 50 },
    effects: { vignette: -10, grain: 6, grainSize: 18 },
  },
),
```

### Airy Pastel Negative

Bright, airy pro-film look with cool mint shadows, pastel skies and clean, luminous skin.

**Best for:** weddings, lifestyle, beaches, overcast portraits  
**Tags:** film, pastel, airy, bright

```ts
preset(
  'Airy Pastel Negative',
  'signature',
  'Bright, airy pro-film look with cool mint shadows, pastel skies and clean, luminous skin.',
  ['film', 'pastel', 'airy', 'bright'],
  {
    basic: {
      exposure: 0.15,
      contrast: -12,
      highlights: -30,
      shadows: 22,
      whites: -10,
      blacks: 8,
      temperature: -3,
      tint: -2,
      vibrance: -8,
      saturation: -4,
    },
    presence: { clarity: -8 },
    hsl: {
      orange: { hue: 2, saturation: -6, luminance: 8 },
      yellow: { hue: -10, saturation: -20, luminance: 6 },
      green: { hue: 18, saturation: -28, luminance: 10 },
      aqua: { hue: -8, saturation: -4, luminance: 4 },
      blue: { hue: -10, saturation: -4, luminance: 4 },
    },
    curves: { master: [[0, 0.07], [0.25, 0.29], [0.5, 0.54], [0.8, 0.82], [1, 0.96]] },
    grading: { shadows: { hue: 170, saturation: 12 }, highlights: { hue: 50, saturation: 6 }, blending: 55 },
    effects: { grain: 10, grainSize: 20 },
  },
),
```

### Cinema Tungsten 500

Motion-picture tungsten stock at night: cool cyan shadows, warm glowing practical lights, soft blacks and visible grain.

**Best for:** night streets, neon, interiors under warm lights  
**Tags:** film, night, tungsten, cinema

```ts
preset(
  'Cinema Tungsten 500',
  'signature',
  'Motion-picture tungsten stock at night: cool cyan shadows, warm glowing practical lights, soft blacks and visible grain.',
  ['film', 'night', 'tungsten', 'cinema'],
  {
    basic: { exposure: 0.1, contrast: 8, highlights: -34, shadows: 20, blacks: 10, temperature: -12, tint: 4, vibrance: 6 },
    hsl: {
      red: { hue: 4, saturation: 10 },
      orange: { hue: -6, saturation: 14, luminance: 8 },
      yellow: { hue: -14, saturation: 6 },
      green: { hue: 30, saturation: -30 },
      aqua: { hue: -10, saturation: 14 },
      blue: { hue: -18, saturation: 10 },
    },
    curves: { master: [[0, 0.06], [0.25, 0.22], [0.5, 0.5], [0.8, 0.82], [1, 0.97]] },
    grading: { shadows: { hue: 195, saturation: 26 }, highlights: { hue: 35, saturation: 26 }, blending: 55, balance: 15 },
    effects: { grain: 22, grainSize: 32, grainRoughness: 55, vignette: -12 },
  },
),
```

### Expired Summer Gold

Consumer film left in a hot car: golden-yellow cast, faded blacks, punchy reds and nostalgic grain.

**Best for:** summer holidays, friends, road trips, snapshots  
**Tags:** film, nostalgic, warm, yellow

```ts
preset(
  'Expired Summer Gold',
  'signature',
  'Consumer film left in a hot car: golden-yellow cast, faded blacks, punchy reds and nostalgic grain.',
  ['film', 'nostalgic', 'warm', 'yellow'],
  {
    basic: { contrast: 10, highlights: -22, shadows: 10, blacks: 12, temperature: 11, tint: -4, vibrance: 4, saturation: -2 },
    hsl: {
      red: { saturation: 12 },
      orange: { hue: 4, saturation: 4 },
      yellow: { hue: -10, saturation: 12 },
      green: { hue: -18, saturation: -18 },
      aqua: { hue: -12, saturation: -10 },
      blue: { hue: -14, saturation: -12 },
    },
    curves: { master: [[0, 0.08], [0.3, 0.29], [0.7, 0.73], [1, 0.96]], blue: [[0, 0.04], [0.5, 0.47], [1, 0.94]] },
    grading: { highlights: { hue: 55, saturation: 14 }, shadows: { hue: 160, saturation: 8 }, blending: 50 },
    effects: { grain: 26, grainSize: 36, grainRoughness: 60, vignette: -14 },
  },
),
```

### Silver Gelatin

Classic high-speed black-and-white darkroom print: deep blacks, bright paper whites, rich midtone separation and grain.

**Best for:** street, portraits, architecture, drama  
**Tags:** black and white, film, contrast, grain

```ts
preset(
  'Silver Gelatin',
  'signature',
  'Classic high-speed black-and-white darkroom print: deep blacks, bright paper whites, rich midtone separation and grain.',
  ['black and white', 'film', 'contrast', 'grain'],
  {
    basic: { monochrome: 100, contrast: 24, highlights: -32, shadows: 6, whites: 2, blacks: -18 },
    presence: { clarity: 16, texture: 8 },
    hsl: {
      red: { luminance: 10 },
      orange: { luminance: 14 },
      yellow: { luminance: 6 },
      green: { luminance: -6 },
      blue: { luminance: -22 },
      aqua: { luminance: -12 },
    },
    curves: { master: [[0, 0.01], [0.2, 0.14], [0.5, 0.5], [0.82, 0.87], [1, 0.98]] },
    effects: { grain: 28, grainSize: 30, grainRoughness: 60, vignette: -14 },
  },
),
```

## Cinema

### Blockbuster Teal & Amber

Big-budget complementary grade: deep teal shadows and backgrounds, warm amber skin, rich contrast and skies that stay blue.

**Best for:** people outdoors, city, action, sunsets  
**Tags:** cinematic, teal, amber, contrast

```ts
preset(
  'Blockbuster Teal & Amber',
  'signature',
  'Big-budget complementary grade: deep teal shadows and backgrounds, warm amber skin, rich contrast and skies that stay blue.',
  ['cinematic', 'teal', 'amber', 'contrast'],
  {
    basic: {
      exposure: -0.05,
      contrast: 18,
      highlights: -32,
      shadows: 12,
      whites: 2,
      blacks: -10,
      temperature: 0,
      vibrance: 8,
    },
    presence: { clarity: 8 },
    hsl: {
      orange: { hue: -3, saturation: 8, luminance: 4 },
      yellow: { hue: -16, saturation: -10 },
      green: { hue: 55, saturation: -36, luminance: -10 },
      aqua: { hue: -12, saturation: 18, luminance: -8 },
      blue: { hue: -14, saturation: 16, luminance: -10 },
      purple: { hue: -30, saturation: -20 },
    },
    curves: { master: [[0, 0.02], [0.25, 0.21], [0.5, 0.5], [0.78, 0.81], [1, 0.98]] },
    grading: {
      shadows: { hue: 192, saturation: 34, luminance: -4 },
      highlights: { hue: 38, saturation: 16 },
      blending: 60,
      balance: -10,
    },
    effects: { vignette: -16, grain: 6 },
  },
),
```

### Neo-Noir Emerald

Moody thriller grade: sickly green-yellow mids, cyan-green shadows, low saturation and heavy, controlled contrast.

**Best for:** night interiors, urban, mystery, moody portraits  
**Tags:** cinematic, green, thriller, dark

```ts
preset(
  'Neo-Noir Emerald',
  'signature',
  'Moody thriller grade: sickly green-yellow mids, cyan-green shadows, low saturation and heavy, controlled contrast.',
  ['cinematic', 'green', 'thriller', 'dark'],
  {
    basic: {
      exposure: -0.2,
      contrast: 22,
      highlights: -26,
      shadows: -4,
      blacks: -12,
      temperature: 2,
      tint: -10,
      vibrance: -18,
      saturation: -12,
    },
    presence: { clarity: 12 },
    hsl: {
      red: { saturation: -20 },
      orange: { hue: 6, saturation: -10 },
      yellow: { hue: 10, saturation: -6 },
      green: { hue: -10, saturation: -10, luminance: -10 },
      blue: { hue: -30, saturation: -30 },
      purple: { saturation: -40 },
      magenta: { saturation: -40 },
    },
    curves: { master: [[0, 0.02], [0.25, 0.19], [0.5, 0.48], [0.8, 0.8], [1, 0.95]] },
    grading: {
      shadows: { hue: 170, saturation: 24, luminance: -6 },
      midtones: { hue: 85, saturation: 12 },
      highlights: { hue: 60, saturation: 10 },
      blending: 55,
    },
    effects: { vignette: -24, grain: 10 },
  },
),
```

### Desert Epic

Sun-scorched sci-fi epic: near-monochrome ochre and sand palette, hazy highlights, deep warm shadows.

**Best for:** deserts, dunes, ruins, dramatic landscapes  
**Tags:** cinematic, desert, ochre, epic

```ts
preset(
  'Desert Epic',
  'signature',
  'Sun-scorched sci-fi epic: near-monochrome ochre and sand palette, hazy highlights, deep warm shadows.',
  ['cinematic', 'desert', 'ochre', 'epic'],
  {
    basic: {
      exposure: 0,
      contrast: 20,
      highlights: -36,
      shadows: 6,
      blacks: -8,
      temperature: 22,
      tint: 4,
      vibrance: -18,
      saturation: -18,
    },
    presence: { clarity: 8, dehaze: -2 },
    hsl: {
      red: { hue: 10, saturation: -10 },
      orange: { hue: 6, saturation: 12 },
      yellow: { hue: -12, saturation: -4 },
      green: { hue: -40, saturation: -60 },
      aqua: { saturation: -60 },
      blue: { hue: -20, saturation: -50, luminance: 10 },
    },
    curves: { master: [[0, 0.03], [0.25, 0.21], [0.5, 0.5], [0.8, 0.82], [1, 0.96]] },
    grading: { shadows: { hue: 25, saturation: 20, luminance: -4 }, highlights: { hue: 45, saturation: 22 }, blending: 55 },
    effects: { vignette: -18, grain: 8 },
  },
),
```

### Nordic Noir

Cold Scandinavian crime-drama look: steel-blue shadows, bleached colour, pale skin and quiet, heavy mood.

**Best for:** overcast days, winter, coast, minimal portraits  
**Tags:** cinematic, cold, muted, blue

```ts
preset(
  'Nordic Noir',
  'signature',
  'Cold Scandinavian crime-drama look: steel-blue shadows, bleached colour, pale skin and quiet, heavy mood.',
  ['cinematic', 'cold', 'muted', 'blue'],
  {
    basic: {
      exposure: -0.1,
      contrast: 10,
      highlights: -20,
      shadows: 6,
      whites: -6,
      blacks: 4,
      temperature: -16,
      tint: -2,
      vibrance: -26,
      saturation: -18,
    },
    presence: { clarity: 8, dehaze: 4 },
    hsl: {
      orange: { saturation: -14 },
      yellow: { saturation: -40 },
      green: { hue: 30, saturation: -46, luminance: -8 },
      aqua: { saturation: -10 },
      blue: { hue: -6, saturation: -8, luminance: -10 },
    },
    curves: { master: [[0, 0.04], [0.25, 0.23], [0.5, 0.49], [0.8, 0.79], [1, 0.94]] },
    grading: { shadows: { hue: 215, saturation: 22 }, highlights: { hue: 200, saturation: 6 }, blending: 50 },
    effects: { vignette: -14, grain: 8 },
  },
),
```

### Neon Melancholy

Romantic arthouse night look: emerald-green shadows, red and warm highlights, smoky soft blacks and lush colour.

**Best for:** night city, bars, rain, couples after dark  
**Tags:** cinematic, neon, night, romantic

```ts
preset(
  'Neon Melancholy',
  'signature',
  'Romantic arthouse night look: emerald-green shadows, red and warm highlights, smoky soft blacks and lush colour.',
  ['cinematic', 'neon', 'night', 'romantic'],
  {
    basic: {
      exposure: 0.05,
      contrast: 14,
      highlights: -24,
      shadows: 14,
      blacks: 8,
      temperature: -4,
      tint: -10,
      vibrance: 18,
    },
    presence: { clarity: -6 },
    hsl: {
      red: { hue: -4, saturation: 20 },
      orange: { hue: -8, saturation: 4 },
      yellow: { hue: 22, saturation: -14 },
      green: { hue: 22, saturation: 24, luminance: -8 },
      aqua: { hue: -12, saturation: 12 },
      blue: { hue: -10, saturation: -10 },
      magenta: { hue: -20, saturation: 8 },
    },
    curves: { master: [[0, 0.06], [0.25, 0.22], [0.5, 0.5], [0.8, 0.83], [1, 0.97]] },
    grading: {
      shadows: { hue: 160, saturation: 38 },
      midtones: { hue: 150, saturation: 8 },
      highlights: { hue: 15, saturation: 22 },
      blending: 50,
    },
    effects: { vignette: -22, grain: 14, grainSize: 30 },
  },
),
```

### Storybook Pastel

Symmetrical-film whimsy: candy pastels, warm pink-and-butter cast, soft contrast and clean highlights.

**Best for:** architecture, interiors, colourful streets, quirky portraits  
**Tags:** cinematic, pastel, whimsical, pink

```ts
preset(
  'Storybook Pastel',
  'signature',
  'Symmetrical-film whimsy: candy pastels, warm pink-and-butter cast, soft contrast and clean highlights.',
  ['cinematic', 'pastel', 'whimsical', 'pink'],
  {
    basic: {
      exposure: 0.15,
      contrast: -6,
      highlights: -26,
      shadows: 16,
      whites: -6,
      blacks: 10,
      temperature: 10,
      tint: 12,
      vibrance: 10,
      saturation: -2,
    },
    presence: { clarity: -4 },
    hsl: {
      red: { hue: 12, saturation: -4, luminance: 10 },
      orange: { saturation: -2, luminance: 8 },
      yellow: { hue: -8, saturation: 8, luminance: 10 },
      green: { hue: -14, saturation: -22, luminance: 12 },
      aqua: { hue: 8, saturation: 4, luminance: 10 },
      blue: { hue: -16, saturation: -2, luminance: 12 },
      magenta: { hue: 6, saturation: 10, luminance: 8 },
    },
    curves: { master: [[0, 0.08], [0.25, 0.29], [0.5, 0.55], [0.8, 0.83], [1, 0.97]] },
    grading: { shadows: { hue: 320, saturation: 16 }, highlights: { hue: 55, saturation: 20 }, blending: 55 },
    effects: { grain: 6 },
  },
),
```

## Editorial & Luxury

### Glossy Cover

High-end magazine-cover finish: luminous clean skin, glossy contrast, protected whites and a refined cool-warm split.

**Best for:** fashion, beauty, studio portraits, campaigns  
**Tags:** editorial, glossy, clean, fashion

```ts
preset(
  'Glossy Cover',
  'signature',
  'High-end magazine-cover finish: luminous clean skin, glossy contrast, protected whites and a refined cool-warm split.',
  ['editorial', 'glossy', 'clean', 'fashion'],
  {
    basic: {
      exposure: 0,
      contrast: 16,
      highlights: -38,
      shadows: 10,
      whites: -2,
      blacks: -10,
      temperature: 1,
      vibrance: 8,
      saturation: -2,
    },
    presence: { clarity: 6, texture: -6 },
    detail: { sharpening: 40, sharpenMasking: 50 },
    hsl: {
      red: { saturation: -4 },
      orange: { hue: -2, saturation: -6, luminance: 10 },
      yellow: { saturation: -10 },
      green: { saturation: -14 },
      blue: { saturation: 6, luminance: -6 },
    },
    curves: { master: [[0, 0], [0.22, 0.19], [0.5, 0.51], [0.8, 0.84], [1, 0.985]] },
    grading: { shadows: { hue: 215, saturation: 8 }, highlights: { hue: 40, saturation: 8 }, blending: 50 },
  },
),
```

### Bone Matte Editorial

Minimal luxury-brand look: bone, sand and stone neutrals, matte blacks and quiet, refined colour.

**Best for:** minimal fashion, interiors, product, linen and stone  
**Tags:** editorial, neutral, matte, minimal

```ts
preset(
  'Bone Matte Editorial',
  'signature',
  'Minimal luxury-brand look: bone, sand and stone neutrals, matte blacks and quiet, refined colour.',
  ['editorial', 'neutral', 'matte', 'minimal'],
  {
    basic: {
      exposure: 0.1,
      contrast: -10,
      highlights: -28,
      shadows: 18,
      whites: -6,
      blacks: 12,
      temperature: 6,
      vibrance: -18,
      saturation: -8,
    },
    presence: { clarity: -4 },
    hsl: {
      orange: { saturation: 4, luminance: 6 },
      yellow: { hue: -10, saturation: -16 },
      green: { hue: -20, saturation: -35 },
      aqua: { saturation: -35 },
      blue: { saturation: -25, luminance: 8 },
      purple: { saturation: -30 },
    },
    curves: { master: [[0, 0.09], [0.25, 0.29], [0.5, 0.52], [0.8, 0.8], [1, 0.94]] },
    grading: { shadows: { hue: 35, saturation: 10 }, highlights: { hue: 45, saturation: 10 }, blending: 50 },
    effects: { grain: 8, grainSize: 18 },
  },
),
```

### Riviera Sun

Glamorous coastal-luxury summer: sun-warmed skin, deep sea blues, clean whites and polished contrast.

**Best for:** yachts, pools, coastal towns, resort fashion  
**Tags:** luxury, summer, sea, warm

```ts
preset(
  'Riviera Sun',
  'signature',
  'Glamorous coastal-luxury summer: sun-warmed skin, deep sea blues, clean whites and polished contrast.',
  ['luxury', 'summer', 'sea', 'warm', 'editorial'],
  {
    basic: { exposure: 0, contrast: 14, highlights: -40, shadows: 12, whites: -2, blacks: -6, temperature: 7, vibrance: 14 },
    presence: { clarity: 6, dehaze: 6 },
    hsl: {
      orange: { hue: -2, saturation: 6, luminance: 6 },
      yellow: { hue: -8, saturation: -6 },
      green: { hue: -10, saturation: -16 },
      aqua: { hue: 8, saturation: 22, luminance: -6 },
      blue: { hue: -6, saturation: 20, luminance: -14 },
    },
    curves: { master: [[0, 0.01], [0.25, 0.23], [0.5, 0.51], [0.8, 0.83], [1, 0.985]] },
    grading: { shadows: { hue: 215, saturation: 10 }, highlights: { hue: 45, saturation: 12 }, blending: 50 },
    effects: { vignette: -8 },
  },
),
```

### Couture Monochrome

Fashion-house black and white: sculpted contrast, glowing skin, inky blacks and silky, grain-free tones.

**Best for:** fashion portraits, beauty, architecture, product  
**Tags:** black and white, fashion, contrast, clean

```ts
preset(
  'Couture Monochrome',
  'signature',
  'Fashion-house black and white: sculpted contrast, glowing skin, inky blacks and silky, grain-free tones.',
  ['black and white', 'fashion', 'contrast', 'clean', 'editorial'],
  {
    basic: { monochrome: 100, exposure: 0, contrast: 30, highlights: -38, shadows: 10, whites: 4, blacks: -24 },
    presence: { clarity: 10, texture: -4 },
    hsl: {
      red: { luminance: 16 },
      orange: { luminance: 22 },
      yellow: { luminance: 10 },
      green: { luminance: -10 },
      aqua: { luminance: -14 },
      blue: { luminance: -26 },
      purple: { luminance: -10 },
    },
    curves: { master: [[0, 0], [0.18, 0.11], [0.5, 0.5], [0.85, 0.91], [1, 0.985]] },
    effects: { vignette: -18, vignetteFeather: 70 },
  },
),
```

### Ivory Bridal

Bright, ethereal fine-art wedding look: ivory whites, soft peach skin, pastel greens and gentle, glowing highlights.

**Best for:** weddings, engagements, florals, soft daylight  
**Tags:** bright, wedding, airy, soft

```ts
preset(
  'Ivory Bridal',
  'signature',
  'Bright, ethereal fine-art wedding look: ivory whites, soft peach skin, pastel greens and gentle, glowing highlights.',
  ['bright', 'wedding', 'airy', 'soft', 'editorial'],
  {
    basic: {
      exposure: 0.25,
      contrast: -14,
      highlights: -34,
      shadows: 24,
      whites: -8,
      blacks: 10,
      temperature: 5,
      tint: 3,
      vibrance: -8,
      saturation: -4,
    },
    presence: { clarity: -12, texture: -6 },
    hsl: {
      orange: { hue: 2, saturation: -8, luminance: 10 },
      yellow: { hue: -12, saturation: -26, luminance: 10 },
      green: { hue: -18, saturation: -34, luminance: 14 },
      aqua: { saturation: -12, luminance: 8 },
      blue: { saturation: -8, luminance: 8 },
    },
    curves: { master: [[0, 0.08], [0.25, 0.3], [0.5, 0.56], [0.8, 0.84], [1, 0.97]] },
    grading: { shadows: { hue: 30, saturation: 8 }, highlights: { hue: 45, saturation: 8 }, blending: 55 },
  },
),
```

### Gourmet Editorial

Cookbook-cover food look: appetising warm tones, rich reds and crisp textures, fresh greens and clean, protected whites.

**Best for:** food, drinks, restaurants, cafe and table scenes  
**Tags:** food, warm, rich, crisp

```ts
preset(
  'Gourmet Editorial',
  'signature',
  'Cookbook-cover food look: appetising warm tones, rich reds and crisp textures, fresh greens and clean, protected whites.',
  ['food', 'warm', 'rich', 'crisp', 'editorial'],
  {
    basic: { exposure: 0, contrast: 12, highlights: -38, shadows: 16, whites: -4, blacks: -6, temperature: 6, vibrance: 12 },
    presence: { clarity: 8, texture: 12 },
    hsl: {
      red: { saturation: 10, luminance: -2 },
      orange: { saturation: 10, luminance: 4 },
      yellow: { hue: -4, saturation: 8 },
      green: { hue: 6, saturation: 6 },
      aqua: { saturation: -14 },
      blue: { saturation: -20 },
    },
    curves: { master: [[0, 0.02], [0.25, 0.23], [0.5, 0.52], [0.8, 0.83], [1, 0.985]] },
    grading: { shadows: { hue: 30, saturation: 8 }, highlights: { hue: 45, saturation: 10 }, blending: 50 },
    effects: { vignette: -12 },
  },
),
```

## Portrait

### Luminous Skin

Retouched-looking glow: even, bright, healthy skin, softened texture and calm surroundings, without looking fake.

**Best for:** headshots, beauty, close portraits, any skin tone  
**Tags:** portrait, skin, glow, soft

```ts
preset(
  'Luminous Skin',
  'signature',
  'Retouched-looking glow: even, bright, healthy skin, softened texture and calm surroundings, without looking fake.',
  ['portrait', 'skin', 'glow', 'soft'],
  {
    basic: {
      exposure: 0.15,
      contrast: -4,
      highlights: -28,
      shadows: 18,
      whites: -4,
      blacks: 2,
      temperature: 3,
      vibrance: -4,
    },
    presence: { clarity: -10, texture: -12 },
    hsl: {
      red: { saturation: -6, luminance: 4 },
      orange: { hue: -2, saturation: -8, luminance: 14 },
      yellow: { saturation: -10 },
      green: { saturation: -20, luminance: -6 },
      blue: { saturation: -4 },
    },
    curves: { master: [[0, 0.03], [0.25, 0.26], [0.5, 0.53], [0.8, 0.82], [1, 0.98]] },
    grading: { highlights: { hue: 40, saturation: 8 }, blending: 50 },
  },
),
```

### Bronze Glow

Sun-bronzed warmth with deep golden shadows and rich, glowing skin; beautiful on medium and deep skin tones.

**Best for:** outdoor portraits, beach, golden hour, deeper skin tones  
**Tags:** portrait, bronze, warm, golden

```ts
preset(
  'Bronze Glow',
  'signature',
  'Sun-bronzed warmth with deep golden shadows and rich, glowing skin; beautiful on medium and deep skin tones.',
  ['portrait', 'bronze', 'warm', 'golden'],
  {
    basic: { exposure: 0.05, contrast: 12, highlights: -24, shadows: 14, blacks: -6, temperature: 8, tint: 2, vibrance: 8 },
    presence: { clarity: 4 },
    hsl: {
      red: { hue: 6, saturation: 4 },
      orange: { hue: 2, saturation: 6, luminance: 6 },
      yellow: { hue: -10, saturation: -4 },
      green: { hue: -16, saturation: -24, luminance: -8 },
      aqua: { saturation: -6 },
      blue: { hue: -8, saturation: 2, luminance: -6 },
    },
    curves: { master: [[0, 0.02], [0.25, 0.23], [0.5, 0.51], [0.8, 0.83], [1, 0.98]] },
    grading: { shadows: { hue: 30, saturation: 16 }, highlights: { hue: 45, saturation: 14 }, blending: 55 },
    effects: { vignette: -10 },
  },
),
```

### Chiaroscuro

Old-master painterly light: deep, warm-brown darkness, a pool of glowing light on the face and rich low-key tones.

**Best for:** low-key portraits, window light, dramatic close-ups  
**Tags:** portrait, dark, painterly, dramatic

```ts
preset(
  'Chiaroscuro',
  'signature',
  'Old-master painterly light: deep, warm-brown darkness, a pool of glowing light on the face and rich low-key tones.',
  ['portrait', 'dark', 'painterly', 'dramatic'],
  {
    basic: {
      exposure: -0.25,
      contrast: 20,
      highlights: -18,
      shadows: -12,
      whites: 4,
      blacks: -16,
      temperature: 8,
      vibrance: -10,
      saturation: -6,
    },
    presence: { clarity: 8 },
    hsl: {
      orange: { hue: 2, saturation: 2, luminance: 12 },
      yellow: { saturation: -20 },
      green: { hue: -30, saturation: -50, luminance: -20 },
      aqua: { saturation: -40, luminance: -16 },
      blue: { saturation: -40, luminance: -20 },
    },
    curves: { master: [[0, 0.02], [0.25, 0.17], [0.5, 0.45], [0.8, 0.8], [1, 0.96]] },
    grading: { shadows: { hue: 30, saturation: 18, luminance: -6 }, highlights: { hue: 40, saturation: 12 }, blending: 50 },
    effects: { vignette: -38, vignetteFeather: 75, vignetteMidpoint: 35, grain: 8 },
  },
),
```

### Peach Soft Light

Soft, warm and dreamy everyday portrait: peachy skin, airy highlights, faded blacks and a gentle rosy glow.

**Best for:** lifestyle, couples, kids, natural-light portraits  
**Tags:** portrait, peach, airy, soft

```ts
preset(
  'Peach Soft Light',
  'signature',
  'Soft, warm and dreamy everyday portrait: peachy skin, airy highlights, faded blacks and a gentle rosy glow.',
  ['portrait', 'peach', 'airy', 'soft'],
  {
    basic: {
      exposure: 0.2,
      contrast: -12,
      highlights: -30,
      shadows: 20,
      whites: -6,
      blacks: 12,
      temperature: 11,
      tint: 8,
      vibrance: -2,
    },
    presence: { clarity: -10, texture: -4 },
    hsl: {
      red: { hue: 8, saturation: -2, luminance: 8 },
      orange: { hue: 2, saturation: 2, luminance: 10 },
      yellow: { hue: -8, saturation: -18 },
      green: { hue: -12, saturation: -26, luminance: 8 },
      blue: { saturation: -6, luminance: 8 },
    },
    curves: { master: [[0, 0.09], [0.25, 0.3], [0.5, 0.55], [0.8, 0.83], [1, 0.96]] },
    grading: { shadows: { hue: 15, saturation: 14 }, highlights: { hue: 40, saturation: 18 }, blending: 55 },
    effects: { grain: 6 },
  },
),
```

## Nature & Landscape

### Moody Forest Fog

Atmospheric woodland: muted grey-teal greens, misty lifted shadows, deep but soft contrast and cool air.

**Best for:** forests, ferns, foliage, rainy and foggy hikes  
**Tags:** forest, moody, teal, fog

```ts
preset(
  'Moody Forest Fog',
  'signature',
  'Atmospheric woodland: muted grey-teal greens, misty lifted shadows, deep but soft contrast and cool air.',
  ['forest', 'moody', 'teal', 'fog', 'nature'],
  {
    basic: {
      exposure: -0.1,
      contrast: 6,
      highlights: -24,
      shadows: 10,
      whites: -8,
      blacks: 8,
      temperature: -10,
      tint: -3,
      vibrance: -16,
      saturation: -12,
    },
    presence: { clarity: 6, dehaze: -8 },
    hsl: {
      orange: { saturation: -8 },
      yellow: { hue: 30, saturation: -42, luminance: -10 },
      green: { hue: 36, saturation: -34, luminance: -12 },
      aqua: { hue: -6, saturation: -12 },
      blue: { saturation: -14 },
    },
    curves: { master: [[0, 0.07], [0.25, 0.24], [0.5, 0.48], [0.8, 0.79], [1, 0.94]] },
    grading: {
      shadows: { hue: 185, saturation: 20 },
      midtones: { hue: 170, saturation: 8 },
      highlights: { hue: 50, saturation: 6 },
      blending: 55,
    },
    effects: { vignette: -18, grain: 8 },
  },
),
```

### Emerald Rainforest

Lush, rich jungle greens shifted toward emerald, glossy leaves, deep shadows and vivid flowers.

**Best for:** jungle, tropical plants, gardens, wet leaves, flowers  
**Tags:** green, lush, tropical, vivid

```ts
preset(
  'Emerald Rainforest',
  'signature',
  'Lush, rich jungle greens shifted toward emerald, glossy leaves, deep shadows and vivid flowers.',
  ['green', 'lush', 'tropical', 'vivid', 'nature'],
  {
    basic: {
      exposure: -0.05,
      contrast: 16,
      highlights: -28,
      shadows: 8,
      whites: 2,
      blacks: -10,
      temperature: -4,
      vibrance: 14,
    },
    presence: { clarity: 12, texture: 8 },
    hsl: {
      red: { saturation: 10 },
      orange: { hue: -4, saturation: -6 },
      yellow: { hue: 24, saturation: -18, luminance: -6 },
      green: { hue: 18, saturation: 8, luminance: -14 },
      aqua: { hue: -4, saturation: 6, luminance: -8 },
      magenta: { saturation: 10 },
    },
    curves: { master: [[0, 0.01], [0.25, 0.2], [0.5, 0.49], [0.8, 0.83], [1, 0.99]] },
    grading: { shadows: { hue: 165, saturation: 14 }, highlights: { hue: 55, saturation: 6 }, blending: 50 },
    effects: { vignette: -14 },
  },
),
```

### Alpine Clarity

Crisp mountain air: clean deep-blue skies, bright snow with detail, cool clarity without harsh saturation.

**Best for:** mountains, lakes, snow, hiking views  
**Tags:** landscape, crisp, blue, clean

```ts
preset(
  'Alpine Clarity',
  'signature',
  'Crisp mountain air: clean deep-blue skies, bright snow with detail, cool clarity without harsh saturation.',
  ['landscape', 'crisp', 'blue', 'clean', 'nature'],
  {
    basic: { exposure: 0, contrast: 14, highlights: -46, shadows: 16, whites: -2, blacks: -8, temperature: -6, vibrance: 14 },
    presence: { clarity: 18, texture: 10, dehaze: 14 },
    hsl: {
      yellow: { hue: -4, saturation: -6 },
      green: { hue: 8, saturation: -6, luminance: -6 },
      aqua: { hue: 4, saturation: 12, luminance: -4 },
      blue: { hue: -4, saturation: 14, luminance: -18 },
    },
    curves: { master: [[0, 0], [0.25, 0.22], [0.5, 0.5], [0.8, 0.83], [1, 0.985]] },
    grading: { shadows: { hue: 220, saturation: 10 }, blending: 50 },
    effects: { vignette: -8 },
  },
),
```

### Golden Hour Glow

Turns late-afternoon light into molten gold: glowing highlights, warm haze and rich shadows, with natural skin.

**Best for:** sunsets, backlit people, fields, beaches  
**Tags:** golden, warm, sunset, glow

```ts
preset(
  'Golden Hour Glow',
  'signature',
  'Turns late-afternoon light into molten gold: glowing highlights, warm haze and rich shadows, with natural skin.',
  ['golden', 'warm', 'sunset', 'glow', 'nature'],
  {
    basic: { exposure: 0.05, contrast: 10, highlights: -30, shadows: 14, blacks: -4, temperature: 15, tint: 5, vibrance: 10 },
    presence: { clarity: -4, dehaze: -6 },
    hsl: {
      red: { hue: 6, saturation: 2 },
      orange: { hue: 4, saturation: 4, luminance: 8 },
      yellow: { hue: -10, saturation: 10, luminance: 6 },
      green: { hue: -24, saturation: -16 },
      aqua: { saturation: -14 },
      blue: { hue: -10, saturation: -6 },
    },
    curves: { master: [[0, 0.03], [0.25, 0.24], [0.5, 0.52], [0.8, 0.84], [1, 0.98]] },
    grading: { shadows: { hue: 20, saturation: 14 }, highlights: { hue: 42, saturation: 22 }, blending: 55, balance: 10 },
    effects: { vignette: -16 },
  },
),
```

### Deep Ocean Teal

Moody seascape: dense teal water, steel skies, controlled highlights and a cool, cinematic depth.

**Best for:** sea, lakes, rainy coasts, blue-water scenes  
**Tags:** ocean, teal, moody, cool

```ts
preset(
  'Deep Ocean Teal',
  'signature',
  'Moody seascape: dense teal water, steel skies, controlled highlights and a cool, cinematic depth.',
  ['ocean', 'teal', 'moody', 'cool', 'nature'],
  {
    basic: {
      exposure: -0.1,
      contrast: 16,
      highlights: -30,
      shadows: 6,
      whites: -4,
      blacks: -8,
      temperature: -12,
      vibrance: -2,
      saturation: -6,
    },
    presence: { clarity: 10, dehaze: 10 },
    hsl: {
      orange: { saturation: -10 },
      yellow: { saturation: -30 },
      green: { hue: 40, saturation: -30 },
      aqua: { hue: -6, saturation: 22, luminance: -14 },
      blue: { hue: -16, saturation: 8, luminance: -16 },
    },
    curves: { master: [[0, 0.03], [0.25, 0.2], [0.5, 0.48], [0.8, 0.81], [1, 0.96]] },
    grading: { shadows: { hue: 195, saturation: 26 }, highlights: { hue: 190, saturation: 8 }, blending: 50 },
    effects: { vignette: -18 },
  },
),
```

## Urban & Night

### Electric Night

Futuristic city night: electric cyan and magenta lights, inky blacks, glossy wet streets and controlled glow.

**Best for:** night city, neon signs, rain, cars at night  
**Tags:** night, neon, cyan, magenta

```ts
preset(
  'Electric Night',
  'signature',
  'Futuristic city night: electric cyan and magenta lights, inky blacks, glossy wet streets and controlled glow.',
  ['night', 'neon', 'cyan', 'magenta', 'urban'],
  {
    basic: { exposure: 0, contrast: 18, highlights: -28, shadows: 10, blacks: -14, temperature: -14, tint: 10, vibrance: 22 },
    presence: { clarity: 10 },
    hsl: {
      red: { hue: 14, saturation: 6 },
      orange: { hue: -18, saturation: -20 },
      yellow: { hue: -30, saturation: -40 },
      green: { hue: 40, saturation: -30 },
      aqua: { hue: 6, saturation: 20 },
      blue: { hue: -10, saturation: 16 },
      purple: { hue: 10, saturation: 16 },
      magenta: { hue: -8, saturation: 18 },
    },
    curves: { master: [[0, 0.01], [0.25, 0.19], [0.5, 0.49], [0.8, 0.83], [1, 0.99]] },
    grading: { shadows: { hue: 225, saturation: 26 }, highlights: { hue: 320, saturation: 14 }, blending: 50 },
    effects: { vignette: -20, grain: 8 },
  },
),
```

### Concrete Teal

Modern urban editorial: teal-grey concrete, warm skin pop, crisp structure and a clean, desaturated city palette.

**Best for:** architecture, street fashion, skateparks, city portraits  
**Tags:** urban, teal, street, crisp

```ts
preset(
  'Concrete Teal',
  'signature',
  'Modern urban editorial: teal-grey concrete, warm skin pop, crisp structure and a clean, desaturated city palette.',
  ['urban', 'teal', 'street', 'crisp'],
  {
    basic: {
      exposure: 0,
      contrast: 18,
      highlights: -26,
      shadows: 10,
      whites: 2,
      blacks: -12,
      temperature: -6,
      vibrance: -8,
      saturation: -10,
    },
    presence: { clarity: 18, texture: 10 },
    hsl: {
      red: { saturation: -10 },
      orange: { hue: -2, saturation: 8, luminance: 6 },
      yellow: { hue: -14, saturation: -30 },
      green: { hue: 50, saturation: -40 },
      aqua: { hue: -8, saturation: 14, luminance: -6 },
      blue: { hue: -20, saturation: -6 },
    },
    curves: { master: [[0, 0.02], [0.25, 0.21], [0.5, 0.5], [0.8, 0.82], [1, 0.98]] },
    grading: { shadows: { hue: 190, saturation: 26 }, highlights: { hue: 40, saturation: 10 }, blending: 50 },
    effects: { vignette: -12, grain: 6 },
  },
),
```

### Sodium Streetlight

Gritty after-midnight realism: orange sodium-lamp glow against cold teal shadows, heavy grain and crushed blacks.

**Best for:** late-night streets, parking lots, documentary, urban grit  
**Tags:** night, gritty, orange, grain

```ts
preset(
  'Sodium Streetlight',
  'signature',
  'Gritty after-midnight realism: orange sodium-lamp glow against cold teal shadows, heavy grain and crushed blacks.',
  ['night', 'gritty', 'orange', 'grain', 'urban'],
  {
    basic: {
      exposure: -0.05,
      contrast: 22,
      highlights: -26,
      shadows: 8,
      blacks: -18,
      temperature: 6,
      vibrance: -6,
      saturation: -8,
    },
    presence: { clarity: 16, texture: 12 },
    hsl: {
      red: { hue: 8, saturation: -10 },
      orange: { hue: -6, saturation: 14 },
      yellow: { hue: -18, saturation: 4 },
      green: { hue: 40, saturation: -40 },
      blue: { hue: -20, saturation: -10 },
      purple: { saturation: -40 },
    },
    curves: { master: [[0, 0.01], [0.22, 0.16], [0.5, 0.48], [0.8, 0.82], [1, 0.97]] },
    grading: { shadows: { hue: 185, saturation: 28 }, highlights: { hue: 35, saturation: 26 }, blending: 50 },
    effects: { vignette: -26, grain: 28, grainSize: 34, grainRoughness: 65 },
  },
),
```

## Verification record

- **Schema:** all 30 parse with `PartialAdjustmentsSchema` with no value changed (no clamping).
- **Distinctness** (RMS on the library test palette, closest other preset): lowest are Silver Gelatin /
  Couture Monochrome 0.016 and Storybook Pastel / Peach Soft Light 0.018; all others 0.019–0.065.
- **Highlight clipping** on the bright beach photo: untouched 12.1 %; presets 0–8.5 %.
- **Rendered and reviewed** as contact sheets on all 9 test images (two tuning rounds).
- **Not yet verified:** real portraits with real skin (only a synthetic face was available) and the GPU
  renderer (the preview used the CPU reference, which the GPU path mirrors). Check both in the app after adding.
