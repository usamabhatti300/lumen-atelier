# Reference matching: target-aware colour and tone transfer

_2026-10-11. Branch of the reference studio work; rules in `docs/AI_ARCHITECTURE.md` ("Target-aware matching")._

## The problem

The owner matched a vivid jungle-leaf photo (saturated yellow-greens, brown dead leaves) to a moody forest
reference (muted grey-teal greens, foggy low contrast, cool, no pinks). The result was only darker and a bit
cooler: the greens stayed vivid, contrast stayed punchy, and the **brown leaves turned pink/mauve**.

Diagnosis (confirmed):

- `mapping.ts` builds an absolute "departure from a canonical neutral photo" preset, and `adaptToTarget` only
  adds exposure and a cast correction. Nothing compares the target's own colours with the reference's, so the
  per-band saturation deltas are the same for a dull or a vivid target.
- The reference's cool/green cast (white balance) and zone grades act on every pixel. On low-chroma browns they
  rotate the hue toward magenta, and nothing checked the rendered result.
- Extra finding: in a muted reference almost every pixel is "near-neutral", so its measured *cast* is the scene
  itself (teal foliage). Transferring it as white balance (tint −30) is what pushed colours around most.

## What changed

- **`src/lib/analysis/match.ts`** (new): target-aware matching.
  - Relative transfer: tone goals from both distributions (keeps 50% of the target's own brightness, spreads
    scaled to the reference's, end points pulled toward the reference's black point and roll-off); fitted
    hue-preserving tone sliders plus a gentle residual curve; white balance that removes the target's cast and
    applies part of the reference's (scaled by support, ignored when the "cast" is the scene); global saturation
    plus per-band hue/chroma/relative-lightness moves toward the reference's colours of a similar hue; zone
    grades for the target's neutral pixels.
  - Protection: target colours without a counterpart in the reference (σ-weighted hue correspondence over the
    reference's 24 hue bins) keep their hue and get only a softened global chroma change; skin-like hues are
    limited further; tints are capped relative to protected chroma; a protected band right next to a band that
    follows the reference moves with it (one surface does not tear into two hues).
  - Closed loop: the target (≤ 360 px, ≤ 24k pixels) is rendered with the CPU reference pipeline (`pixel.ts`),
    re-measured with the same features and corrected per feature (damped, bounded) for up to 8 passes; the best
    pass is kept. Mean 0.3 s per match in Node on this machine (max 0.44 s).
  - Explanations ("why each change"), notes (protected colours, colour-poor references) and warnings (night vs
    day, capped brightness move, residual drift, slider limits).
- **`src/lib/analysis/features.ts`** + **`src/lib/schema/matchFeatures.ts`** (new): compact, Zod-validated match
  features (luminance quantiles, chroma, cast, zone tints, 24 hue bins). `computeStats` now includes them.
- **Worker/client**: `analysis.worker.ts` runs matching and posts pass-count progress; `client.ts` adds
  `matchInWorker` and `matchSampleFor`.
- **Reference studio** (`ReferenceStudio.tsx`): "Apply to your photo" now uses the matched result by default,
  with a *Matched to this photo / Generic look* switch, an honest progress line ("refinement pass n of up to 8"
  with an indeterminate bar), "Show how it was matched to this photo", and mismatch warnings. Intensity works as
  before. The brightness toggle reads "Match the reference's brightness fully" (keeps 0% instead of 50%). The
  cast toggle and the compare-suggestions remain for the generic look. If matching fails, the generic look is
  used and the error is shown.
- **Presets**: "Save as preset" still saves the generic look, plus `reference.features` (optional field in
  `ReferenceInfoSchema`, no format version change). Applying such a preset shows **Match to this photo** in the
  applied-preset bar (`LeftPanel.tsx`), which matches it to the current photo (pass count shown on the button).
- **Evaluation**: `matchEval.ts` (metrics, old/new method, renderer), `evalScenes.ts` (procedural scenes and the
  seven known looks), `match.test.ts` (unit tests and thresholds), `match.eval.test.ts` (opt-in real-photo
  harness with contact sheets).
- **Docs**: `docs/AI_ARCHITECTURE.md` rules table. **e2e**: the critical journey now checks that the applied
  look is the matched one and runs "Match to this photo" on the saved preset.
- No pixel maths changed (`pixel.ts`, `shaders.ts` untouched).

## Evaluation

References: seven looks applied with the CPU renderer to one photo each (muted teal forest → generated misty
forest; warm golden hour → `ThemeC/img29`; faded matte film → `ThemeC/img30`; high-contrast cool →
`ThemeC/img31`; desaturated pastel → `ThemeC/img29`; black and white → `Spotlight/img14`; orange-teal →
`ThemeB/img25`). Targets (7): generated jungle (yellow-greens + brown leaves), generated portrait (skin, hair,
blue top, green background), generated street (sky, beige/grey/brick, red sign), `Spotlight/img50` (beach,
blossom, purple lake), `ThemeC/img28` (lake, pines, sky), `ThemeB/img24` (vivid ribbons on black),
`ThemeD/img33` (sage sculpture). 49 pairs. Only Windows wallpapers and generated scenes were used.

Metrics (method-independent, lower is better):

- **lum**: mean |error| of 11 luminance quantiles vs the reference, in percentile points.
- **chroma**: |log2| of result/reference mean chroma.
- **band hue / band chroma**: bands with ≥ 5% share in both reference and target, result band vs reference band
  (share-weighted mean |hue error| in degrees, |log2 chroma ratio|).
- **zone**: zone tints of the target's own neutral pixels vs the reference's near-neutral tints (OKLab a/b × 1000).
- **drift / driftMax**: protected bands (≥ 5% of the target, no reference colour within 60°): hue drift of those
  pixels, in degrees.

| Metric (lower is better) | Old | New |
| --- | --- | --- |
| lum | 16.82 | 11.13 |
| chroma | 0.64 | 0.37 |
| band hue (°) | 6.13 | 3.80 |
| band chroma | 0.32 | 0.13 |
| zone | 11.56 | 6.18 |
| drift (°) | 5.74 | 1.08 |
| driftMax (°) | 6.71 | 1.45 |

Per look (old / new):

| Look | lum | chroma | band hue | band chroma | zone | drift |
| --- | --- | --- | --- | --- | --- | --- |
| muted teal forest | 7.54 / 7.36 | 0.63 / 0.20 | 5.25 / 1.69 | 0.18 / 0.04 | 19.02 / 12.49 | 11.82 / 5.84 |
| warm golden hour | 17.17 / 10.33 | 0.80 / 0.13 | 7.03 / 9.95 | 0.48 / 0.14 | 18.78 / 12.40 | 13.06 / 0.63 |
| faded matte film | 13.42 / 8.16 | 0.77 / 0.58 | 11.24 / 7.81 | 0.60 / 0.31 | 10.23 / 7.07 | 2.14 / 0.32 |
| high-contrast cool | 21.80 / 14.08 | 0.70 / 0.40 | 8.33 / 3.70 | 0.30 / 0.16 | 12.18 / 4.02 | 4.16 / 0.25 |
| desaturated pastel | 16.95 / 11.51 | 0.92 / 0.73 | 3.96 / 1.35 | 0.17 / 0.11 | 6.36 / 1.91 | 8.07 / 0.47 |
| black and white | 17.27 / 9.54 | 0 / 0 | – | – | – | – |
| orange-teal | 23.62 / 16.95 | 0.65 / 0.51 | 7.13 / 2.08 | 0.49 / 0.14 | 14.33 / 5.35 | 0.90 / 0.04 |

The reported case (muted teal forest → generated jungle): lum 4.73 → 2.93, chroma 1.11 → 0.10, band hue
36.8° → 9.1°, band chroma 1.27 → 0.27, brown-leaf hue drift **27.1° → 1.2°**.

Notes on the numbers:

- The luminance error is not driven to 0 on purpose: half of the brightness difference is kept as scene
  exposure, and spreads are scaled, not copied.
- The teal-forest drift average is raised by one pair (lake and pines, 34°): its blue band (228°) sits next to
  the aqua water band (216°), which follows the reference, so it moves with it by design; the metric still counts
  it as "protected" because no reference colour is within 60°. Visually the water stays one coherent teal.
- Golden hour band hue is worse (7.0° → 10.0°), mostly from one pair (lake and pines, 29°): pixels move across
  the aqua/green band boundary, which this hard-membership metric penalises.

Contact sheets (reference | target | old | new) were made for every look plus a larger sheet of the reported
case, and checked by eye:

- **Reported case**: the old result is olive-green with mauve-grey browns (the bug reproduces); the new one is
  muted grey-teal with brown leaves still brown, close to the reference.
- Portrait under muted teal: background goes grey-teal, skin stays natural. Street: sky stays blue (muted),
  bricks stay brick. Pastel and orange-teal: convincing. Black and white: tones follow the reference.
- Bright references (golden hour, high-contrast cool) brighten dark targets noticeably even with 50% of the
  exposure kept and a 0.2 cap; this is "matching the light", but can look washed out on dense foliage.

Sheets used during development surfaced and fixed: blue skies turning lavender (RGB curve compressing highlights;
fixed with hue-preserving tone sliders), saturated blue rings in near-black gradients (multiplicative black lift;
fixed by keeping Blacks ≤ 0 and limiting contrast/brightness), green mountains and lavender skies (the muted
reference's scene "cast" transferred as white balance; fixed by the content rule and support scaling), a cooled
portrait (dark hair read as the target's cast; fixed by support scaling), fiery skin under orange-teal (chroma
gain caps for skin-like hues) and blotchy, posterised tones (slope limits and curve smoothing).

To reproduce: `MATCH_EVAL=1 MATCH_EVAL_OUT=<dir> npx vitest run src/lib/analysis/match.eval.test.ts`
(needs `sharp`, present as a transitive dependency; Windows wallpapers are optional, generated scenes always run).

## Design decisions

- **Sliders, not a LUT.** The output is ordinary, editable slider values (tone, WB, saturation, HSL, grades,
  master curve), so intensity, overrides and refinement keep working.
- **Same features everywhere.** Reference, target and every trial render are measured by one function, so the
  loop compares like with like. The loop uses the CPU reference renderer, which the GPU shader mirrors.
- **Exposure kept at 50%.** Brightness differences between two photos are mostly the scene; the owner can match
  it fully with the toggle. The median move is capped at 0.2 and flagged.
- **Tone by sliders first.** RGB curves shift hues (light blues go purple when highlights compress); the basic
  tone sliders act on luminance only. The curve does only the residual, the black point and the roll-off.
- **Protection by correspondence, not by fixed colours.** A target colour is protected when the reference has
  nothing of a similar hue, so browns are protected against a teal forest but follow an autumn reference.
- **Best-of loop.** Corrections are proportional and damped; the best pass is kept, so the closed loop never
  returns something worse than the closed-form estimate.
- **Saved presets stay generic**, with the reference's features attached for later matching.

## Tests run

- `npm run typecheck`: clean.
- `npm run lint`: 0 errors, 10 warnings (all pre-existing, none in new files).
- `npm test`: 14 files passed, 1 skipped (the opt-in harness); 177 tests passed, 1 skipped. New:
  `src/lib/analysis/match.test.ts` (13 tests: features and preset schema, tone goals and slider fit, band
  planning and protection, the reported case, old-vs-new on the reported case, identity, black-and-white,
  extreme mismatch, speed, and old-vs-new thresholds on six generated pairs).
- `MATCH_EVAL=1 … match.eval.test.ts`: passed; numbers above.
- `e2e/critical-journey.spec.ts` alone (ports 5205/8805): passed (4.7 min, and again on the final code in 4.6 min), including the new matched-apply and
  "Match to this photo" checks. One earlier run failed before the analysis step (the reference file never
  loaded while another heavy test process was running); the immediate re-run alone passed.

## Known limits

- Statistics cannot separate scene from style: a reference with a large bright sky still brightens a dark
  target somewhat (capped), and muted references are read as tinted scenes.
- Spatial parts of a look (local contrast, glow, vignette shape) are not matched; grain/vignette/texture are
  taken from the generic look unchanged.
- Hue correspondence is per HSL band (8 bands); two different objects of similar hue get the same move.
- Near-black gradients in 8-bit sources can still show faint banding when the look lifts blacks.
- The matched settings assume the photo's other sliders are at defaults (the preset is blended from the current
  baseline as before).
- Real-browser timing was not measured separately; Node timing is ~0.3 s per match, and the worker reports
  passes, not percentages.
