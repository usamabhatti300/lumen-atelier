# Step 4: depth-aware lens blur (Depth Anything V2 Small)

## What users can now do

**Detail → Lens blur** blurs the photo by distance, like a fast lens, instead of one flat background blur.

1. Open a photo, go to the **Detail** tab, raise **Amount** (e.g. 60).
2. The first time, the depth model (49.6 MB, served by this app) loads with real byte progress, then
   "Estimating depth…" runs on this device (GPU via WebGPU when it supports fp16, otherwise the CPU via
   WebAssembly). **Cancel** works at any point. Nothing is uploaded.
3. The blur focuses automatically on the detected person (or, without one, on the nearest central part of
   the frame). **Pick focus** → click anywhere on the photo to focus there; a focus marker shows the point.
4. **Focus distance** (0 nearest … 100 farthest), **Falloff** (how gradually blur grows away from the
   focal plane), **Bokeh highlights** (out-of-focus lights stay bright and form discs) and **Keep subject
   sharp** (uses the existing MediaPipe person segmentation so each person sits on one focal plane with
   clean edges; separate people keep separate depths) refine it. Everything is undoable.
5. Export renders the blur at full resolution (tiled), and batch export estimates depth for other photos
   when their edit uses lens blur.

Depth is stored per photo (IndexedDB database `lumen-atelier-depth`, keyed by photo and model file), not
baked into pixels; it is recomputed if missing and deleted with the photo / project / "clear all data".
After a reload, a photo whose edit uses lens blur gets its depth back automatically.

## Model, files and dtype

- `onnx-community/depth-anything-v2-small` at revision `4472b7362082ad9968fee890ca0f1e5aca36b93d`
  (current `main`), licence Apache-2.0 (checked on the model card / HF API). Small only.
- Graph checked with `onnxruntime-node` and `onnxruntime-web` (scratch script): input `pixel_values`
  float32 `[B,3,H,W]`, output `predicted_depth` float32 `[B,H,W]` (relative inverse depth, larger = nearer).
  All variants (fp32, fp16, q8) keep float32 inputs/outputs.
- **Chosen: `onnx/model_fp16.onnx` (49.6 MB) for both backends.** On ONNX Runtime Web 1.30 WASM it runs fine
  (no unsupported-kernel errors) at the same speed as fp32 (fp32 is 99 MB) with a mean error of 0.19 % of
  the depth range vs fp32; the q8 `model_quantized.onnx` (27 MB) was faster but 2.9 % off, visibly worse.
  On WebGPU, fp16 is used only when the adapter has `shader-f16`; otherwise the worker uses WASM.
- Transformers.js requests exactly: `config.json` (38 B, sha256 `3aee5b9b…`), `preprocessor_config.json`
  (461 B, `03576db3…`) and `onnx/model_fp16.onnx` (49,642,442 B, `2df6223f…`), all registered in
  `src/lib/ml/registry.ts` and served through `guardedFetch` (observed in the dev server log: no other
  model URL is requested). `status: 'ready'`; `npm run setup:models` downloaded and verified them.
- Transformers.js 4.3.1 lists no devices when it uses our pre-registered ONNX Runtime, so a named
  `device` throws "Unsupported device". Workaround (same as Step 2): `device: 'auto'` plus
  `session_options.executionProviders: ['webgpu' | 'wasm']`.

## Rendering design

See `docs/RENDERING_PIPELINE.md` → "Lens blur". In short: linear-light, source-space pass after
retouching; CoC from depth; highlight expansion before blurring; per-level block prefilter that never
mixes depths; scatter-as-gather golden-angle disc kernel with per-texel coverage (no halos, sharp subject
never receives background colour, blurred foreground can spill over); a fine level for small blur so blur
grows progressively; depth-aware upsample; amount 0 = exact identity. Same maths in GLSL and the CPU
reference; export tiles are padded and grid-aligned so they match the whole-image render exactly.

Depth refinement (main thread, ~0.5 s once per photo): resample → per-person flatten (optional) → joint
bilateral (half res, 2 passes) → guided filter.

## Files

- New: `src/lib/ml/depth.ts` (worker-side model), `src/lib/depth/raster.ts` (+ test), `src/lib/storage/depthCache.ts`,
  `src/features/depth/depthState.ts`, `src/features/editor/panels/LensBlurSection.tsx`,
  `src/features/editor/overlays/FocusOverlay.tsx`, `e2e/lens-blur.spec.ts`, this file.
- Changed: `src/lib/schema/adjustments.ts` (optional `lensBlur`, ranges, Zod), `src/lib/engine/params.ts`,
  `pixel.ts`, `cpu/cpuRender.ts`, `gl/shaders.ts`, `gl/renderer.ts`, `pixel.test.ts`; `src/engine/controller.ts`,
  `exporter.ts`, `batch.ts`; `src/lib/ml/registry.ts`, `protocol.ts`, `client.ts`, `ml.worker.ts` (one dispatch
  line); `src/lib/storage/db.ts` (cache cleanup); `src/state/editorStore.ts` (`setLensBlur`, `focus` tool);
  `Viewport.tsx`, `DetailPanel.tsx`, `EditorScreen.tsx` (autoload); `e2e/network-isolation.spec.ts`;
  `playwright.config.ts` (`E2E_WEB_PORT` / `E2E_API_PORT`, defaults unchanged); `docs/RENDERING_PIPELINE.md`.
- Edit schema version **not** bumped: `lensBlur` is an optional field, old edits parse unchanged and mean "off".

## Tests run (results)

- `npm run typecheck`: clean. `npm run lint`: 0 errors (10 pre-existing react-refresh warnings).
- `npm test`: 9 files, **114 tests passed** (new: 9 lens-blur tests in `pixel.test.ts` — identity at amount 0
  and without depth, CoC mapping, invertible highlight expansion, level plan, no background spill over a
  sharp centre, sharp focused half / blurred other half, no halo next to a sharp bright subject, flat
  disc bokeh for a point light, tiles identical to the whole image for single- and two-level plans,
  progressive fine→coarse blending; 5 depth-raster tests — filters, edge snapping, per-person
  flattening, auto-focus, robust normalization).
- `E2E_WEB_PORT=5203 E2E_API_PORT=8803 npx playwright test e2e/lens-blur.spec.ts --project=desktop`:
  **passed** (7.6 min): real model download + WASM inference, click-to-focus on the near ground, near
  detail kept (> 75 %), far detail removed (< 60 %), undo/redo, full-resolution export shows the same.
- `e2e/network-isolation.spec.ts` (same ports): the new depth part **passed** (depth estimated, the fp16
  model file requested from this origin), but the test **failed** at the final check because MediaPipe
  1.1.0 posts telemetry to `odml.pa.googleapis.com` every 60 s — the longer test now outlives that timer.
  This is the issue Step 2 fixed in `src/lib/portrait/mediapipe.ts`; with that merged it should pass.
  No request from the depth/lens-blur code left the origin.
- Visual checks (scratch Playwright script, dev server on 5213/8813): `C:\Windows\Web\Wallpaper\ThemeC\img28.jpg`
  (lake landscape: clicking the grass keeps it sharp while mountains and near water blur by distance) and
  `ThemeB\img24.jpg` (3D objects on dark background). The second exposed glowing, blocky halos around
  in-focus objects; fixed by per-texel coverage in the gather, the fine level, and the joint bilateral
  depth refinement, then re-checked at full preview resolution.

## Known issues / limits

- CPU (WASM) inference is slow on this shared, heavily loaded machine: 14 s standalone in headless Chrome,
  46–160 s inside the editor while SwiftShader rendering and other agents' test runs compete for the CPU.
  On a GPU with WebGPU + shader-f16 it should take well under a second (not measured here: headless
  Chromium has no WebGPU).
- Depth Anything gives relative depth; flat, textured objects can get small depth variations, which show as
  gentle blur differences inside an object when the falloff is short.
- No real portrait photo was available (the Pictures folder is off-limits; the Windows wallpapers are
  landscapes and renders), so the person path (subject flattening) is covered by unit tests and the
  segmentation run in the e2e test rather than a visual check on a real portrait.
- The focus marker is shown while the Pick focus tool is active.
