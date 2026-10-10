# Step 2: click-to-select masks with SlimSAM

_Done 2026-10-10/11 on branch `worktree-agent-a1b36dcbfb7e75ecd` (merged by the lead)._

## What users can now do

**Masks → New mask → Select object**, then click anything in the photo (sky, a jacket, a car). A precise
mask appears (red overlay); every "Adjust masked area" control (exposure, colour, clarity, blur, …) then
applies only to that object.

- **Click**: starts a new selection (replaces the current one).
- **Shift-click**: adds a point to the selection (include more).
- **Alt-click**: adds an exclusion point (remove a part).
- **Add another object**: the next click starts a second object in the same layer.
- Undo/redo, invert, opacity, add/subtract mode and delete work like any other mask shape.
- The first use downloads nothing at runtime from the internet: it loads the model files that
  `npm run setup:models` installed into `public/models/` (39.8 MB). The panel and a canvas chip show the
  real byte progress while the files load and verify, then an honest "Analysing the photo (once per photo)…"
  state (no fake percentage) while the image embedding is computed, with **Cancel**.
- If the model is not installed the panel says so and tells the user to run `npm run setup:models`.

**Try it:** `npm run setup:models` (once), `npm run dev`, open a landscape (e.g.
`C:\Windows\Web\Wallpaper\ThemeC\img28.jpg`) → Masks → New mask → Select object → wait for "Click an
object" → click the sky → lower Exposure → only the sky darkens → Export → the sky is darker in the file.

## Design decisions

- **Model / runtime**: `Xenova/slimsam-77-uniform` (Apache-2.0, verified on the model card and the HF API
  at the pinned revision `5850ab45…`) through Transformers.js `SamModel` + `AutoProcessor` +
  `post_process_masks`, in the shared ML worker. **fp32** graphs on both WebGPU and WASM (Transformers.js
  would pick the `_quantized` q8 graphs on WASM by default; fp32 keeps quality identical on both backends
  and the registry ships exactly the two fp32 graphs). WebGPU first, WASM fallback.
- **Transformers.js device quirk (affects Step 4 too)**: because `src/lib/ml/ort.ts` pre-registers our ONNX
  Runtime on `Symbol.for('onnxruntime')`, Transformers.js leaves its supported-device list empty, so any
  named `device` ('wasm', 'webgpu', and the default) throws `Unsupported device`. Workaround used in
  `src/lib/ml/sam.ts`: `device: 'auto'` plus explicit `session_options.executionProviders: [backend]`.
- **Embedding once per photo**: the worker keeps the embeddings of the two most recent photos; each click
  runs only the prompt decoder. The photo is sent at ≤ 2048 px (long edge) so `post_process_masks`
  upsamples the logits straight to the cached raster size.
- **Mask choice**: SAM returns three candidates; the one with the highest predicted IoU is used.
- **Non-destructive storage**: a new mask component `{ type: 'object', id, mode, points: [{x, y, include}] }`
  (normalized source coordinates, 1–24 points, Zod-validated). It is an additive member of the existing
  discriminated union, so **the edit-schema version is unchanged** and older saved edits still validate.
  Only the points are stored in the edit; the raster is a cache:
  - in memory (16 most recent) and in a **separate IndexedDB database** `lumen-atelier-mask-cache`
    (keyed by photo id + exact points, 300 entries max, oldest evicted). A separate database avoids
    bumping the main `DB_VERSION` (other steps may add stores there).
  - Whenever a raster is missing (new click, undo, reload with an empty cache, export, an edit copied to
    another photo), `src/engine/objectMasks.ts` loads it from the cache or recomputes it from the points.
- **Geometry**: rasters live in source-image space like every other component, so crop, rotate, flip and
  straighten need nothing special.
- **Export**: `exportPhoto` (`src/engine/batch.ts`) first ensures every object raster exists (computing
  it from the full-resolution original if needed) and fails with a readable error rather than silently
  dropping a mask. The 2048 px raster is resampled bilinearly in JS to the export mask size (4096).
- **Edges**: coverage = clamp(0.5 + logit/2), giving a crisp, anti-aliased edge on SAM's decision
  boundary. SAM's masks stop a few pixels short of the image border, so the mask is extended to the edge
  where it continues just inside (`fillBorderGaps`). A guided-filter edge refinement was implemented and
  tested on the wallpaper photo and **rejected**: wherever the photo has no strong edge it box-blurs the
  mask, which showed as a bright halo along the mountain ridge after darkening the sky.
- **UI**: amber only for the active tool and include points; exclusion points are ink with an ivory
  minus. The overlay chip and panel use the existing `Progress`/`Indeterminate` components.

## Files

New: `src/lib/ml/sam.ts` (worker logic), `src/lib/ml/samProtocol.ts`, `src/lib/ml/samClient.ts`,
`src/lib/masks/objectMask.ts` (+ `objectMask.test.ts`), `src/lib/storage/maskCache.ts`,
`src/engine/objectMasks.ts` (service + status store), `src/features/masks/selectObject.tsx` (panel, chip),
`src/features/masks/selectObjectActions.ts` (activation, click handling), `e2e/select-object.spec.ts`.

Changed (small, additive): `src/lib/ml/registry.ts` (slimsam → `ready`), `protocol.ts` (`| SamRequest`),
`ml.worker.ts` (one dispatch branch), `client.ts` (`call` exported), `src/lib/schema/adjustments.ts`
(ObjectComponent + schema), `src/lib/masks/rasterize.ts` (object lookup, `missingObjects`),
`src/engine/controller.ts` (object lookup, background requests, re-render on new rasters),
`src/engine/batch.ts` (ensure rasters before export), `src/state/editorStore.ts` (`'object'` tool),
`MasksPanel.tsx`, `MaskToolOverlay.tsx`, `e2e/network-isolation.spec.ts`, `src/lib/portrait/mediapipe.ts` (telemetry off, see below), `playwright.config.ts`
(`E2E_WEB_PORT` / `E2E_API_PORT` env overrides, defaults unchanged).

## Registry changes

`slimsam` status `planned` → `ready`. Files unchanged and confirmed to be exactly what Transformers.js
requests for fp32 on both backends: `config.json` (379 B), `preprocessor_config.json` (466 B),
`onnx/vision_encoder.onnx` (23,276,014 B, sha256 `9f843327…`), `onnx/prompt_encoder_mask_decoder.onnx`
(16,557,892 B, sha256 `f4514391…`); sizes and LFS SHA-256 re-checked against
`/api/models/Xenova/slimsam-77-uniform/tree/5850ab45…`. Observed requests in the browser: only these four
files (no 404s). `npm run setup:models` downloaded and verified all four.

Graph inspection (onnxruntime-node): vision encoder `pixel_values f32[b,3,1024,1024]` →
`image_embeddings`, `image_positional_embeddings f32[b,256,64,64]`; decoder `input_points f32[b,pb,n,2]`,
`input_labels i64[b,pb,n]`, embeddings → `iou_scores f32[b,pb,3]`, `pred_masks f32[b,pb,3,256,256]`
(no box or mask inputs).

## Tests actually run

All on this machine, in the worktree, with ports 5201/8801 for e2e:

- `npm run typecheck`: clean.
- `npm run lint`: 0 errors, 10 warnings (all pre-existing `react-refresh/only-export-components`; none in new files).
- `npm test` (Vitest): **9 files, 114 tests passed** (includes 15 new tests in `src/lib/masks/objectMask.test.ts`:
  schema round-trip without a version bump, rejection of malformed selections, click modifiers,
  point caps / at-least-one-positive rule, cache keys, raster sizing, logit→coverage, border-gap fill,
  bilinear resampling, RGBA encoding).
- `e2e/select-object.spec.ts` (desktop): **passed (3.7 min)**. Generated scene: click the sky → mask shape
  listed and include marker shown → overlay tints the sky only → Shift-click (2 points) and Alt-click
  (3 points, exclude marker) → mask Exposure −2 darkens the sky by > 25 levels while the field changes
  < 4 → reload: the sky is still darker (mask restored from the local cache) → export: the file's sky is
  darker and the field unchanged. (Earlier attempts failed on a too-short wait for a still-running decode
  before reload and on a crashed Playwright worker when the machine ran out of processes; the click now
  marks the tool as "Selecting…" immediately and the reload check polls.)
- `e2e/network-isolation.spec.ts` (desktop): **passed (4.8 min)**, now including Select object and staying
  more than 60 s after MediaPipe starts (see the MediaPipe finding below).
- Manual check on a real photo (`C:\Windows\Web\Wallpaper\ThemeC\img28.jpg`, 3840×2400) via Playwright
  screenshots: one click on the sky selected exactly the sky (mountains, trees, sea and the sun disc
  excluded); mask Exposure −1.5 darkened only the sky; the selection survived a reload; the exported
  3840×2400 JPEG had a darker sky. The first export showed a light halo along the ridge and an unselected
  strip at the top edge; both were fixed (guided filter removed, border-gap fill added) and the reloaded
  preview afterwards was clean. A final real-photo export after these fixes timed out in my script while
  the shared CPU was saturated (the embedding step), so the post-fix export is covered by the e2e export
  check on the generated scene, not by a real-photo file.

Not run: `critical-journey`, `editor`, `mobile` e2e specs (not touched by this step except shared code
paths; left to the lead's merged run), `npm run build`.

## MediaPipe telemetry (pre-existing privacy leak, fixed here)

With the longer network-isolation test, it caught `POST https://odml.pa.googleapis.com/v1/log` twice:
`@mediapipe/tasks-vision` 1.1.0 batches usage statistics and sends them every 60 s (in the minified bundle,
class `Mh` with `setInterval(flush, 6e4)`). The Step 1 test finished within 60 s, so it never saw it; the
production CSP would block it, but the dev server has no CSP. `src/lib/portrait/mediapipe.ts` now replaces
the logger's `flush` with a no-op (on the shared prototype) right after each task is created, and the
isolation test waits until 65 s after MediaPipe starts. This touches minified internals of a pinned
version; an upgrade that renames them logs a console warning and the isolation test would fail.

## Known issues

- On this shared, fully loaded CPU the one-off image embedding took from ~8 s to several minutes
  (WASM, 4 threads, other agents running SwiftShader tests). It has not been measured on WebGPU here (headless Chromium has no WebGPU).
- Cancelling during "Analysing the photo" stops waiting immediately, but ONNX Runtime cannot interrupt a
  running graph, so the worker finishes that embedding in the background and discards it.
- Mask edges follow SAM's 256×256 logits (bilinear); very fine detail (hair, thin branches) is softer than a
  matting model would give. Step 6 (BiRefNet) is the planned upgrade for hair.
- Selecting the sky excludes the sun disc (SAM treats it as an object); Shift-click the sun to include it.
- In this git worktree Vite returns 403 for the self-hosted fonts because `node_modules` is a junction
  outside the worktree root; this does not happen in the main checkout.
