# AGENTS.md: working on Lumen Atelier

The product specification is `PHOTO_EDITING_STUDIO_MASTER_SPEC.md`; progress is tracked in
`PROJECT_STATUS.md`. Read both before planning work.

## Commands

- `npm run dev`: web (Vite) + API (`node --watch server/index.ts`)
- `npm test`: Vitest (unit + server). `npm run test:e2e`: Playwright (ports 5199/8799, no API key)
- `npm run typecheck`, `npm run lint`, `npm run build`

## Architecture map

| Area | Location |
| --- | --- |
| Edit schema, ranges, validation | `src/lib/schema/adjustments.ts` (single source of truth for every control) |
| Colour maths | `src/lib/color/*` |
| Pixel maths (CPU reference) | `src/lib/engine/pixel.ts`; GLSL mirror in `src/lib/engine/gl/shaders.ts` |
| GPU renderer | `src/lib/engine/gl/renderer.ts` |
| Engine runtime (decode, preview, masks, render loop) | `src/engine/controller.ts` |
| Export / batch | `src/engine/exporter.ts`, `src/engine/batch.ts` |
| Reference analysis | `src/lib/analysis/*` (stats, mapping, adapt, client), UI in `src/features/reference` |
| AI contract | `shared/ai-schema.ts` (used by browser and server) |
| API server | `server/*` (Node http + Anthropic SDK; runs TS natively, so use erasable syntax and `.ts` imports) |
| State | `src/state/*` (Zustand). Engine status in `src/engine/engineStore.ts` |
| Storage | `src/lib/storage/db.ts` (IndexedDB via idb) |
| Portrait detection (MediaPipe) | `src/lib/portrait/*`: `portrait.worker.ts` runs segmentation + face landmarks off the main thread (CPU delegate; ES-module WASM glue loaded per model with `?instance=n`, blob URL in dev), `portraitClient.ts` (main-thread fallback), state and auto-run in `src/features/portrait/portraitState.ts` |
| On-device ML (ONNX Runtime Web, Transformers.js) | `src/lib/ml/*`: `registry.ts` (every model: pinned URL, size, SHA-256, licence), `verify.ts` (same-origin, checksum-verified downloads), `ml.worker.ts` + `client.ts` (WebGPU → WASM sessions, progress, cancel), `transformers.ts` (local-only config). Settings UI in `src/features/settings/AiModels.tsx` |

## Rules

- **Any change to pixel maths must be made in both `pixel.ts` and `shaders.ts`**, with a unit test in
  `pixel.test.ts`. Default settings must remain an identity (tested).
- New controls: add the range in `RANGES`, the default, Zod validation, `params.ts` derivation, both
  renderers, and the UI. Never ship a control that does not change the render.
- The vision model must only return categorical descriptions validated by `shared/ai-schema.ts`.
  Numeric settings come from `src/lib/analysis/mapping.ts`; document new rules in
  `docs/AI_ARCHITECTURE.md`.
- Never put secrets in `VITE_*` variables or browser code.
- ML models: register every file in `src/lib/ml/registry.ts` with its SHA-256; load only through
  `fetchVerified`/`guardedFetch` (same origin, no remote models); keep `e2e/network-isolation.spec.ts`
  exercising every AI feature.
- Don't fake progress: show percentages only for measurable work.
- Keep the app runnable; run `npm run typecheck && npm test` before finishing a change, and the
  e2e suite for workflow changes. Report only tests you actually ran.
- UI: follow `DESIGN.md` (Afterimage). Use the role tokens in `src/styles/index.css` (never raw colours); the photo stage is `.theme-frame`, secondary screens open with `AppBar`; lilac is the one main action per screen, the hard lilac offset is the only coloured shadow (no glows, gradients or glass), orange is for date stamps only, `danger` is for errors only, and the three analog props (frame numbers, date stamp, offset) stay in their places.
