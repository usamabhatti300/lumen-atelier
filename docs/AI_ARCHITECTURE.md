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
target stats ─► optional adaptation (exposure / cast) ─► apply with intensity ─► compare result ─► capped suggestions
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

## Target adaptation and comparison (`src/lib/analysis/adapt.ts`)

- **Neutralise cast** (default on): counters 60% of the target's own neutral cast, capped at ±30
  temperature / ±20 tint, because strong "casts" are often scene colours.
- **Match brightness** (default off): moves exposure 70% of the way to the reference median (±1.5 EV).
- Warnings when images differ too much (brightness, night vs day, skin present in only one).
- After applying, the rendered result is measured and compared with the reference. Suggestions
  (exposure, contrast, saturation, shadow tint) close at most half the gap, are capped, and are
  skipped when the difference is a scene property (more than 2 stops).
- The saved preset contains only the transferable look at the chosen intensity, not the
  per-photo adaptation.

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
