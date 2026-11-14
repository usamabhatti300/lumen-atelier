# Preset library notes

> **Superseded on 2026-11-14.** The 186-look library described below was replaced by a curated set
> of 41 looks in 8 rolls (`src/lib/presets/library.ts`; reasons, measurements and the full
> keep / retune / cut list are in `PRODUCT_AUDIT_AND_IMPROVEMENT_PLAN.md`, section 5). This file and
> the recipe documents it refers to (`PHOTO_EDITOR_SIGNATURE_PRO_PRESETS.md`, `PREMIUM_PRESETS.md`,
> `PRO_PRESET_LIBRARY.md`) are kept as history only. House rules for new looks are in the header of
> `library.ts` and enforced by `src/lib/presets/blend.test.ts`.

_Last updated: 2026-10-11._ Covers the recipes from `docs/PHOTO_EDITOR_SIGNATURE_PRO_PRESETS.md` (80 recipes,
"Signature Pro"). Earlier additions are recorded in `docs/PREMIUM_PRESETS.md` and at the end of
`docs/PRO_PRESET_LIBRARY.md`.

## Result

- **75 of the 80 recipes added**; 5 skipped because they already existed (below). The library now has
  **186** built-in presets.
- All recipes are ordinary partial adjustment sets in `src/lib/presets/library.ts`, using the existing
  `preset()` helper. They go through the real renderer (GPU and the CPU reference), Intensity, undo/redo,
  history, export and the cached real-render thumbnails exactly like every other preset. No new
  dependencies and no renderer changes (`pixel.ts` / `shaders.ts` untouched).

### Categories

The doc's 15 groups map to these tabs (the first eight existed; six are new):

| Doc group | Tab | Added |
| --- | --- | --- |
| A. Signature / Editor's Picks | Signature Collection | 10 |
| B. Cinematic | Cinematic | 6 |
| C. Film & Analog | Film & Analog | 5 |
| D. Icy / Pale Blue | Pale & Blue | 5 |
| E. Luxury Editorial | Luxury & Fashion | 4 |
| F. Portrait & Skin | Portrait | 6 |
| G. Matte & Muted | **Matte & Muted** (new) | 4 |
| H. Golden Hour | **Golden Hour** (new) | 4 |
| I. Earthy & Forest | **Earthy & Forest** (new) | 4 |
| J. Wedding & Romance | **Wedding & Romance** (new) | 4 |
| K. Street & Flash | **Street & Flash** (new) | 4 |
| L. Travel & Landscape | Travel & Landscape | 6 |
| M. Black & White | **Black & White** (new) | 4 |
| N. Creator / Social and O. Experimental | Social & Experimental | 9 |

Existing presets were not moved between tabs (for example, the older monochrome presets stay in their
original tabs; search for "black and white" finds them all).

### Skipped because they already exist

| Recipe | Existing preset |
| --- | --- |
| 13 Desert Epic | Desert Epic (same name) |
| 16 Bleach Bypass Lite | Bleach Bypass |
| 22 Expired Summer | Expired Summer Gold |
| 34 Champagne Editorial | Champagne Editorial (same name) |
| 68 Silver Gelatin | Silver Gelatin (same name) |

Every other recipe was also compared with all 111 existing presets on the library test palette; the
closest is 0.018 RMS apart (the library test requires > 0.01), so none duplicates an existing look.

## How the doc's notation was mapped

- `B`, `WB`, `Color`, HSL and grade values map 1:1 to the app's controls (same Lightroom-style units and
  sign conventions; HSL hue + moves a band toward the next band, e.g. green + toward aqua).
- Prose curve hints became real master-curve points: gentle S-curve = quarter points moved 0.024,
  subtle = 0.014, medium-soft = 0.019, strong = 0.036-0.038; "lifted blacks / faded toe" = black point
  0.03-0.07; "soft shoulder / roll-off" = white point 0.96-0.98.
- Prose colour hints became grading wheels, e.g. "warm highlights" = highlights 40°/6-10,
  "slightly cool shadows" = shadows 210-215°/3-10, "faint rosy highlights" = highlights 350°/5.
- "Fine / subtle grain" = grain 6-12, size 20-25.
- B&W recipes use real monochrome (100) with the "B&W mix" as HSL luminance, which is how this renderer's
  monochrome works (colour grading cannot tint a monochrome image, as monochrome is applied last).
- **Cross Process Cyan** uses real red and blue channel curves for the crossover.
- **Infrared Garden** is a false-colour look (greens shifted toward yellow and brightened, skies darkened).
  It is clearly visible on bright, saturated foliage but subtle on very dark foliage (e.g. dense pines),
  because HSL luminance acts on colour, not on near-black pixels. A channel-mixer version was tried and
  rejected: it made skies paler, the opposite of the recipe.
- **Duotone Velvet** is honestly a near-monochrome **split-tone** (saturation -55 plus grading), not a true
  duotone; its description says so.

## Tuning against rendered images

Measured with the CPU reference renderer on a generated bright-sky fixture and five Windows wallpapers
(lake, sunset, beach/blossom, pale studio still life, misty dunes), then reviewed visually in the app.

1. **Highlight clipping.** 36 recipes made more pixels pure white than the untouched photo (up to +11 % on a
   pale image), mainly from positive exposure and whites. They keep the doc's values but get a soft white
   point of 0.98 on the master curve (smooth highlight roll-off, like the rest of the Signature
   Collection): 2, 3, 6, 8, 10, 21, 24, 25, 26, 27, 29, 31, 32, 35, 37, 38, 39, 46, 47, 48, 50, 52, 53, 54,
   55, 61, 63, 64, 65, 67, 69, 71, 72, 73, 74, 78. After this no added recipe clips more than the original
   on any test image (unit-tested on the sky fixture).
2. **Near-duplicates inside the doc.** Some recipes rendered almost identically (0.005-0.010 apart). Each
   was nudged toward its own description:
   - Platinum Noir: luminous-midtone curve (vs Fashion Silver 0.005).
   - Arctic Dream: misty lift, black point 0.04 and white point 0.98 (vs Pale Blue Hour 0.008).
   - 35mm Nostalgia: warmer highlights, 40°/10 instead of /6 (vs Urban Sunfade 0.009).
   - Rosewater Film: rose highlights 350°/10 instead of /6 (vs Softbox Cream 0.009).
   - Softbox Cream: creamy highlights 48°/9 (vs Porcelain Light 0.010).
   - Windowlight Poet: cooler shadows 215°/10, highlights 38°/7 and a gentle S-curve for directional
     window light (vs Softbox Cream 0.007).

   Afterwards the closest pair of added recipes is 0.011 apart. Many of these recipes are intentionally
   subtle, so neighbours in the same family (e.g. the soft portrait looks) remain close cousins.
3. **Skin.** On light, medium and deep skin swatches no added recipe raises skin saturation by more than
   0.05 or shifts skin hue by more than 4° (except the black-and-white and split-tone looks, by design).

## Tests

`src/lib/presets/blend.test.ts` checks, for all 186 presets: unique ids and names, expected category counts,
a label, description and 2-5 tags, schema-valid values that survive validation unchanged (finite, in range,
valid curves, HSL and grading), more than five settings each, at least 0.01 RMS apart on the test palette,
and intensity 0 leaving the photo untouched. It also checks that every preset added after the original 70
does not clip a bright sky more than the untouched render. Results of the latest run are in
`PROJECT_STATUS.md`.

## Not implemented / limitations

- The doc's extra metadata fields (`mood`, `bestFor`, `strength`, `version`) are not separate fields; the
  "best for" information is written into each description and tags, which search covers.
- No "recent presets" list (not requested for this change).
- Thumbnails are real renders of the user's open photo (or the built-in test scene), cached per photo and
  preset; there is no fixed six-image thumbnail set.
- No selective skin protection is claimed; recipes rely on global controls (vibrance already protects
  skin hues in this renderer).
- 15 of the original 70 presets (e.g. Clean Bright Lifestyle, Snow and Ice, Icy Blue, Dreamy Glow) clip the
  bright-sky fixture more than the untouched render; they were not changed here.
- Not tested on real portraits (none available on the development machine).
