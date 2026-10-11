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
