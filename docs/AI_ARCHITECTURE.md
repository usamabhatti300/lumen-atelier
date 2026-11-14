# Reference-to-preset architecture

```
reference image ──► [Worker] deterministic statistics ─────────────┐
        │                                                          ▼
        └─(optional, with consent)─► /api/analyze-style ─► vision model ─► categorical
                                     (server, holds key)    (structured JSON)   interpretation
                                                                               │  (Zod-validated
                                                                               │   on server + client)
                                                                               ▼
                         deterministic mapping (src/lib/analysis/mapping.ts) ──► editable preset
                                                                               │  (PartialAdjustments,
                                                                               │   clamped + validated)
target pixels ─► [Worker] target-aware matching (src/lib/analysis/match.ts) ─► matched sliders (default)
                     relative transfer ─► render ↔ re-measure loop ─► apply with intensity
target stats ─► optional adaptation (exposure / cast) ─► generic look ─► compare result ─► capped suggestions
```

## What the model does and does not do

- The model **describes** the look with enums only (contrast very_low…very_high, shadow tint
  hue + strength, greens subdued/shifted, grain none/fine/…/uncertain, content warnings…), plus a
  one-to-two-sentence summary and short uncertainty notes. Schema: `shared/ai-schema.ts`.
- The model **never** returns slider values or code. Its JSON schema has no numeric fields (enforced
  by a server test). The response is rejected if it is not valid JSON or fails the strict Zod schema;
  the app then continues with measurements only.
- Default model: `claude-opus-5-5` (override with `ANTHROPIC_MODEL`), called with structured outputs
  (`output_config.format = json_schema`), effort `medium`, and server-side refusal fallback
  (`fallbacks: "default"`). Refusals, timeouts, auth errors and rate limits map to typed error codes
  the UI explains.

## Deterministic measurements (`src/lib/analysis/stats.ts`)

Luminance percentiles and zone distribution; black floor / white ceiling; clipping; global cast of
nearly colourless pixels (OKLab a/b, chroma < 0.035); tints of near-neutral pixels per tonal zone;
chroma distribution; per-HSL-band share, chroma, lightness and hue offset; k-means palette (OKLab,
deterministic seeding); skin-like colour share; grain (median residual in flat areas of a 1:1 crop);
vignette (corner/centre ratio + symmetry); flags for screenshots (uniform UI bars), multiple photos
(internal separators), illustrations (flat areas), low resolution, night/neon, under/over-exposure;
and a suggested crop that trims uniform borders.

## Mapping rules (`MAPPING`, `CANONICAL` constants)

| Setting | Rule | Model's role |
| --- | --- | --- |
| Tone curve | Map canonical "neutral photo" percentiles (5/25/50/75/95) to the reference's, after removing 65% of the median shift (scene exposure); 80% strength (40% for night scenes). Black lift from p1 > 0.055; highlight roll-off from p99 < 0.9. | `blacks: lifted/faded` can enable the black lift. |
| White balance | Inverse of the app's WB model fitted to the global neutral cast × 0.8 (× 0.4 for night). Only with ≥5% neutral support. | None. Only mentioned when there are too few neutrals. |
| Colour grading | Zone tint minus the cast used by WB → wheel hue/saturation (sat = C/0.11 × 115%, midtones ×0.5, max 60). | Agreement within 60° raises confidence; disagreement is flagged. Used only at half strength when measurement is inconclusive. |
| Saturation | 40 × log2(median chroma / 0.055), within -60…30. Monochrome when p90 chroma < 0.02. | A "monochrome" reading without measured monochrome only produces a warning. |
| HSL | Per band with ≥4% share: relative chroma, lightness and hue offset, damped (0.6 / 0.4 / 0.6). Orange/red limited when skin is present. | Small fixed nudges: greens subdued −20 sat, toward yellow −12 hue, etc. |
| Grain | Requires measured texture above the JPEG-noise baseline **and** the model's fine/moderate/heavy. Without AI, only strong evidence, flagged as uncertain. | Gate. |
| Vignette | Corners ≥12% darker, symmetric (≥0.6), **and** the model sees one (or ≥30% without AI). | Gate. |
| Softness | Model only: dreamy glow → clarity −22, texture −10; soft → clarity −10; crisp → +10/+8. Skipped at low model confidence. | Source, small and flagged as low confidence. |

Every rule produces an explanation shown under "How the preset was built", tagged *measured*,
*interpreted* or both, with weak estimates marked. Confidence drops for screenshots, multiple
photos, illustrations, low resolution, mixed lighting and when AI is unavailable.

## Target-aware matching (`src/lib/analysis/match.ts`, constants `MATCH`)

The generic look describes the reference's departure from a canonical neutral photo, so it ignores the
photo it lands on (a vivid target stayed vivid; a cool cast turned brown leaves mauve). "Apply to your
photo" therefore defaults to a **matched** result: ordinary slider values computed for this photo by
comparing the reference's features with the target's own. Everything is measured and deterministic; the
AI interpretation is not used here.

**Features** (`features.ts`, schema `src/lib/schema/matchFeatures.ts`): 11 perceptual-luminance quantiles,
mean OKLab L, chroma mean/median/p90, share of coloured pixels (C ≥ 0.03), cast of colourless pixels
(C < 0.035), near-neutral (C < 0.06) tints of shadows/midtones/highlights, and 24 OKLCh hue bins (share,
mean chroma, mean lightness, circular-mean hue). About 1–2 KB; stored in reference presets.

| Setting | Rule |
| --- | --- |
| Tone goals | Target distribution re-centred on a goal median (keeps `keepExposure` = 50% of the target's own brightness difference; median moves at most 0.2) with its lower/upper spreads scaled to the reference's (×0.45…1.4); then pulled toward the reference's own quantiles, 75% at p1/p99 (black point, fade, roll-off), 50% at p5/p95, 25% in the mid-tones, at most 0.15 per quantile. "Match the reference's brightness fully" sets the kept share to 0. |
| Tone sliders | Blacks/whites/shadows/highlights/contrast/brightness fitted to the goals (Levenberg–Marquardt, small pull to 0). They act on luminance only, so they do not shift hues. Blacks may only darken and contrast ≥ −35, brightness ≤ +50: lifting near-black pixels multiplicatively turns their noise into saturated colour. |
| Tone curve | Master curve through the post-slider quantiles (identity where the sliders already fit) plus black point / white point extrapolated from p1/p99. Local slope 0.35…2.2, lightly smoothed. Refined by the loop. |
| White balance | Removes 70% of the target's colourless-pixel cast and applies 60% of the reference's, each scaled by its support (full from 15% of pixels). A reference whose pixels are almost all near-neutral (support > 60…98%) is a tinted scene, not a lighting cast: its cast is handled by zone grades instead. Capped at ±35 temperature, ±12 tint. |
| Bands | Every HSL band holding ≥ 2.5% of the target's coloured pixels is planned. Its counterpart is the reference's hue bins weighted by a Gaussian on hue distance (σ 38°, ≤ 60°; skin-like red/orange σ 22°, ≤ 40°). Correspondence mass ≥ 0.12 → the band follows the reference (hue move ≤ 30°, ≤ 8° for skin-like hues; chroma ×0.12…1.6, skin ×0.5…1.3; lightness relative to the image mean at 50% weight). Mass ≤ 0.03 → **protected**; in between, blended. |
| Protection | Protected bands keep their original hue (the loop counter-rotates any drift caused by WB, grades or curve, up to ±24°) and get only a softened global chroma change: ratio^0.6 within 0.4…1.5 (skin-like ≥ 0.6). Their pixels are excluded from zone-tint measurement. |
| Saturation | Global saturation carries the share-weighted geometric mean of the band chroma changes (or the global chroma ratio when bands cover < 40% of coloured pixels); band sliders hold each colour's own difference. |
| Zone grades | Shadow/midtone/highlight wheels move the target's originally neutral pixels to the reference's near-neutral tints. At most 0.04 OKLab (wheel ≈ 36), and with protected colours present at most 45% of their goal chroma (≥ 0.012), so a tint cannot overpower them. |
| Closed loop | The target (≤ 24k pixels of a ≤ 360 px copy) is rendered with the candidate sliders by the CPU reference pipeline (`pixel.ts`, same maths as the shaders; spatial effects excluded), re-measured with the same features, and each group is corrected in proportion to its own error (gain 0.7: curve anchors by quantile error, band hue/chroma/lightness by tracked pixels of that band, zone offsets by tint error). Up to 8 passes; stops when the mismatch score stops improving by 1% twice. The best pass is kept, so refinement never ends worse than the closed-form estimate. Progress is reported as a pass count. |
| Kept from the generic look | Texture (presence) and effects (grain, vignette). |

**Limits and warnings.** Night vs day mismatch, capped brightness moves, protected colours that still drift
more than 12°, tone residuals that stay large, and bands that hit a slider limit are reported as warnings;
protected colours and colour-poor references are reported as notes. A black-and-white reference converts to
monochrome and matches tones only; a black-and-white target can only receive tone and tints.

**Presets.** "Save as preset" still stores the reusable generic look, now with the reference's compact
features in `reference.features` (optional, Zod-validated; no format version change). Applying such a preset
shows **Match to this photo** in the applied-preset bar, which runs the same matching against the current photo.

**Evaluation.** `src/lib/analysis/match.test.ts` holds thresholds on generated scenes;
`MATCH_EVAL=1 MATCH_EVAL_OUT=<dir> npx vitest run src/lib/analysis/match.eval.test.ts` runs the old-vs-new
comparison on real photos and writes contact sheets (see `docs/steps/REFERENCE_MATCHING.md`).

## Target adaptation and comparison (`src/lib/analysis/adapt.ts`, generic look)

- **Neutralise cast** (default on): counters 60% of the target's own neutral cast, capped at ±30
  temperature / ±20 tint, because strong "casts" are often scene colours.
- **Match brightness** (default off): moves exposure 70% of the way to the reference median (±1.5 EV).
- Warnings when images differ too much (brightness, night vs day, skin present in only one).
- After applying, the rendered result is measured and compared with the reference. Suggestions
  (exposure, contrast, saturation, shadow tint) close at most half the gap, are capped, and are
  skipped when the difference is a scene property (more than 2 stops).
- The saved preset contains only the transferable look at the chosen intensity, not the
  per-photo adaptation or the matched settings (plus the reference's features for later matching).
- These adaptation options and suggestions apply to the **Generic look** mode; the matched mode does its
  own comparison in the closed loop.

## Adaptive looks (`src/lib/analysis/lookAdapt.ts`, constants `LOOK_ADAPT`)

Library looks are designed on well-exposed, neutral photos. When "Adaptive looks" is on (Settings,
default on), applying a library look first evens out this photo's exposure and white balance toward
what the look was made to do. Measurements and fixed rules only; no AI.

- **Intent:** the look rendered on a neutral grey ramp (perceptual lightness 0.03–0.97, no cast) with
  the CPU pipeline (`renderPixels`, same maths as the shader); its output median lightness and cast.
- **Photo:** the look rendered on ~2,500 pixels of the photo's original preview, measured the same way.
- **Exposure:** an offset (bisection, ±1.0 EV) that closes `keep` = 50% of the gap between the photo's
  output median and the intent's; gaps under 0.025 are left alone.
  Guards: brightening stops before the brightest 0.5% of pixels pass lightness 0.95 (or where they
  already were), and before the top 3% pass 0.90 or rise more than 0.03 above where they were;
  darkening stops before the darkest 0.5% fall below 0.03. So low-key, night and sun-and-shade
  photos keep their highlights instead of being blown out to an average brightness. (The 3% guard
  was added on 2026-11-14: a sunlit street with deep shade was being pushed +1.2 EV, because its
  few brightest pixels were already white and the 0.5% guard never engaged.)
- **White balance** (changed 2026-11-14): only the photo's **own** cast is corrected. Cast = mean OKLab
  a/b of the least colourful quarter of the photo's pixels with no edit at all (a quarter, so a large
  pale sky is not mistaken for grey) (skipped when even those
  exceed chroma 0.12), measured against neutral grey. 50% of it becomes temperature/tint via
  `inverseWhiteBalance` (caps ±18 / ±10), kept only if a trial render shrinks the cast by at least 10%.
  Before this change the cast was measured through the look and compared with the look on a grey
  ramp; a blue sky or warm walls under a graded look then read as an error, and the correction pulled
  the look's colour back out (Teal and Orange got temperature +15, tint +20 on the sample). Looks
  that leave the photo without colour (black and white) get no white-balance change.
- The offsets are added to the look's own exposure/temperature/tint (or the baseline's, when the look
  doesn't set them), so they scale with Amount, stay editable, and are listed under the applied look
  ("Fitted to this photo: exposure −0.40 · temperature −6"). Matched looks are never adapted.

## Looks picked for a photo (`src/lib/presets/recommend.ts`, constants `TRAIT_RULES`)

The first roll in the editor's Looks browser, **For this photo**, lists six built-in looks chosen for
the open photo. Measurements and fixed rules only; no AI.

- **Traits**, from the same ~2,500-pixel sample the adaptive fit uses:
  `dark` (median lightness < 0.30 and the brightest 5% below 0.62: night, low key), `bright` (median
  > 0.58), `flat` (5%–95% spread < 0.50), `contrasty` (spread > 0.80, or a dark median with bright
  highlights: sun and deep shade), `warm` / `cool` (mean OKLab b of the less colourful half beyond
  ±0.012), `muted` / `vivid` (mean chroma of the lit pixels < 0.04 / > 0.10), `greens` / `blues`
  (coloured pixels in OKLCh hue 110–175° / 200–285° holding more than 14% of the photo), and `face`
  when on-device detection found one.
- **Looks** each list the traits they were made for (`suits` in `library.ts`, most important first;
  `any` marks an all-rounder).
- **Score** = 1 per matching trait, 1.5 for `face`, 1.25 for `any` (so a safe all-rounder outranks a
  single matching trait). Best first; ties keep library order; no roll fills more than two places.
- The measured traits are shown above the picks ("picked for this photo · hard light · muted"), so
  the choice is never a black box. Until the photo has been measured the roll shows Editor's Picks.

## Auto (`src/lib/analysis/autoEnhance.ts`, constants `AUTO`)

One tap in Light. Measured from the photo's pixel sample rendered through the CPU pipeline; fixed
rules, no AI; the result is ordinary slider values, one undo step.

- **No look on:** absolute values, measured with the eight sliders at zero and the rest of the edit
  as it is, so a second press changes nothing. Exposure and white balance come from the adaptive fit
  against a neutral photo (exposure half way, highlights and shadows guarded; white balance halved
  again so a real sunset keeps its warmth). Then, on the corrected render: highlights down when the
  brightest 1% is above 0.93 (10–45), shadows up when more than 20% of the photo is below 0.15 (up
  to 40), contrast up when the 5%–95% spread is under 0.50 (up to 22), blacks down when the darkest
  1% sits above 0.05 (up to 18), vibrance +16 / +10 when mean chroma is under 0.05 / 0.09.
  A black-and-white edit gets no colour changes.
- **On top of a look:** the look stays in charge. Auto sets the exposure, adds to the look's
  highlights and shadows only when the result still needs it, and leaves contrast, black point,
  white balance and vibrance alone.

## Matched look names (`src/lib/analysis/lookName.ts`)

A saved matched look gets a suggested roll-style name and mood instead of a date, both editable. Fixed
rules on the measured statistics, with the readout's thresholds (`readout.ts`), so they never disagree:
- **First word**, the heaviest palette colour with OKLab chroma ≥ 0.04, by hue: Ember (0–40°), Amber
  (40–75°), Honey (75–115°), Moss (115–165°), Lagoon (165–225°), Harbour (225–285°), Violet (285–330°),
  Rose (330–360°); else Silver (black and white), Ash (muted), Paper.
- **Second word**, first that applies: Diary (black and white), Night (median < 0.3 or night), Postcard
  (lifted blacks), Static (visible grain), Morning (median > 0.62), Hour (warm cast), Tide (cool cast),
  Frame.
- **Mood**: light (dark / bright / soft / punchy / even), colour (black & white / muted / hue / warm /
  cool / neutral), finish (faded / grainy / vignetted / crisp / clean). Saved as tags, so it's searchable.
- Never a roll's name or one of the user's own look names (then "II", "III"…). No AI is involved.

## Privacy and security

- The API key lives only in the server environment (`ANTHROPIC_API_KEY`). It is never in a
  `VITE_` variable and is not reachable from the browser bundle.
- The browser asks before the first upload; consent can be revoked in Settings. Only a ≤1024 px JPEG
  of the (cropped) reference is sent, never the photos being edited.
- The server validates content type and body size (6 MB), validates JSON with Zod, rate-limits per
  client (default 10/min), aborts the provider call when the browser disconnects, never writes
  images to disk and never logs them.
- Without a key the UI says so and builds the preset from measurements; nothing is faked.

## Limits (honest)

A finished JPEG doesn't contain its editing history, so the original settings cannot be recovered.
Measurements describe the reference's pixels, which mix scene colour and grading; the mapping
damps and caps everything to avoid over-fitting, but some scene colour can leak into the preset.
Results are approximations meant to be refined.
