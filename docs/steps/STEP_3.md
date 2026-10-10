# Step 3: Remove tool (MI-GAN inpainting)

_Branch `worktree-agent-a94d521273b32b33b`, 2026-10-11._

## What users can do now

A new **Remove** tab (eraser icon, shortcut **E**) in the right panel. Paint over a person, wire or
sign. When you let go, the painted area is filled in from its surroundings, on this device. Each
stroke is one removal; hold **Shift** while painting to add a stroke to the previous removal (better
for large objects than several separate removals). The **Removals** list lets you hide (eye) or delete
each one, and **Ctrl+Z** undoes stroke by stroke. Areas still being filled show a soft amber wash and
a "Removing…" chip. The original file is never changed: removals are stored as strokes and the export
fills them again at full resolution.

**How to try it:** `npm run setup:models` (downloads MI-GAN, 28.1 MB, SHA-256 checked), `npm run dev`,
open a photo, click **Remove**, set **Brush size**, and paint over a small object so it is fully
covered. Toggle the eye in the list to compare, then **Export**.

## Model and verified ONNX contract

- `migan_pipeline_v2.onnx` from `andraniksargsyan/migan` at revision `406830d0…`, 28,079,181 bytes,
  SHA-256 `6f1f3530…c40b` (unchanged from the registry; licence MIT for code and weights). The registry
  entry is now `status: 'ready'`; `npm run setup:models` downloaded and verified it.
- Inspected with `onnxruntime-node` 1.30 (scratch script) and pinned by `src/lib/removal/migan.test.ts`:
  - inputs `image` uint8 `[B,3,H,W]` (planar RGB, 0–255, any size) and `mask` uint8 `[B,1,H,W]`;
  - output `result` uint8 `[B,3,H,W]`, the same size as the input;
  - mask: **255 = keep, 0 = fill**. Values in between are treated as partly known (128 gave a dark
    smear), so the app sends a strictly binary mask;
  - kept pixels come back within a few levels (max diff 1–7), not byte-exact, hence the app's own composite;
  - the pipeline crops around the hole and runs the GAN at 512 px internally: 1.4–2.6 s on native CPU at any
    input size; memory grows with input size (≈1.9 GB RSS for a 12 MP input), so crops are capped.

## Design

- **Edit state:** additive optional field `EditState.removals?: Removal[]`, where
  `Removal = { id, visible, strokes: { size, points[] }[] }` (normalized source coordinates, like brush
  masks). Zod: `RemovalSchema` (limits 64 removals, 32 strokes, 4000 points; size clamped to 0.2–40 %).
  A damaged `removals` list is dropped (`.catch(undefined)`) instead of resetting the whole edit.
  **The schema version was not bumped**: older edits simply have no field. `Reset all` clears removals;
  paste/presets/sync never copy them (they copy adjustments only).
- **Pipeline position:** removals apply to the **original pixels before every adjustment**, like healing.
  Preview: `src/engine/removalPreview.ts` copies the preview-resolution original to a canvas, applies
  the removals in order and the controller hands that canvas to the renderer as its source (CPU fallback
  reads it too). Export: `exportEdited` builds the same at output resolution before tiling
  (`applyRemovalsToBitmap`), so the tiled renderer is unchanged. No pixel maths in `pixel.ts`/`shaders.ts`
  changed.
- **Region maths** (`src/lib/removal/removal.ts`, pure, unit-tested): per stroke, distance to the path minus
  the brush radius r. Fill where `d ≤ dilate` (`max(1.5 px, 0.12 r)`), feather band of `max(2 px, 0.22 r)`
  outside it, alpha 0 beyond. The model crop is the affected box plus context of `max(0.75 × box, 3 % of
  the long edge)`, clamped; crops over 2048 px are downscaled for inference (fill mask grown by 1.5 px at
  that scale) and the result upscaled. Composite: weight 0 → pixel not written (byte-identical), 255 →
  exact fill, in between rounded blend.
- **Ordering and cache:** each removal is filled from the image left by the ones before it. Patches are
  cached under a key that hashes the working size plus the strokes of that removal and all earlier ones
  (ids excluded, so undo/redo and show/hide reuse results). Two tiers: memory LRU (128 MB) and, for preview
  patches, the browser's Cache Storage on this device (raw RGBA, survives reloads; cleared when the photo,
  its project or all local data is deleted). With no cache the strokes are simply re-run on reload.
- **Runtime:** existing `loadModel`/`runModel` client API, unchanged. Calls are serialized (one session
  must not run twice at once). A change during filling does not abort inference: the patch is cached and
  the loop restarts. **Cancel** aborts the model load (real byte progress) or abandons the running fill;
  the removals stay in the edit marked "not applied" with **Resume**. Missing model → the worker's
  `ModelMissingError` text ("Run npm run setup:models…") with **Try again**.

### Runtime change outside the Remove feature (please review when merging)

- `src/lib/ml/ort.ts`: without WebGPU it now loads **`onnxruntime-web/wasm`** (plain SIMD-threaded build)
  instead of `onnxruntime-web/webgpu`, whose WASM path is the slower "asyncify" build. Measured for
  MI-GAN: 13 s vs 2 s per fill in Node, and in headless Chrome ~90 s before vs 2.8 s after (4 threads).
  With WebGPU the `/webgpu` bundle is used as before. `scripts/copy-wasm-runtimes.mjs` now also copies
  `ort-wasm-simd-threaded.wasm` to `public/ort/`; **run `node scripts/copy-wasm-runtimes.mjs` (or
  `npm install`) in the main checkout after merging.** `vite.config.ts` pre-bundles
  `onnxruntime-web/wasm`. This also speeds up Steps 2, 4 and 5 on machines without WebGPU.
- `src/lib/portrait/mediapipe.ts`: **privacy fix.** MediaPipe Tasks 1.1.0 POSTs usage telemetry to
  `https://odml.pa.googleapis.com/v1/log` every 60 s after a task is created. The production CSP blocks it,
  but the dev server sent it, and the extended network-isolation test caught it (it now runs longer than
  60 s). The task's usage logger is switched off right after creation (minified field names of the pinned
  1.1.0 bundle; the e2e test fails if that ever stops working).
- `vite.config.ts`: `cacheDir` can be overridden with `VITE_CACHE_DIR` (default unchanged). Parallel
  worktrees share one `node_modules` junction, and their dev servers kept overwriting each other's
  pre-bundle cache (`onnxruntime-web` missing → "Failed to fetch dynamically imported module").
  `.vite-cache` is git-ignored.
- `playwright.config.ts`: ports from `E2E_WEB_PORT` / `E2E_API_PORT` (defaults 5199/8799 unchanged).

## Files

New: `src/lib/removal/{removal.ts,inpaint.ts,cache.ts,removal.test.ts,migan.test.ts}`,
`src/engine/removalPreview.ts`, `src/features/editor/panels/RemovePanel.tsx`,
`src/features/editor/overlays/RemoveToolOverlay.tsx`, `e2e/remove.spec.ts`, this file.
Changed: `src/lib/schema/adjustments.ts`, `src/state/editorStore.ts` (tool `remove`, tab `remove`,
`addRemoval`/`setRemovalVisible`/`deleteRemoval`/`clearRemovals`), `src/engine/controller.ts`,
`src/engine/exporter.ts`, `src/engine/batch.ts`, `src/engine/autosave.ts` (thumbnail refresh when fills
land), `src/features/editor/{RightPanel,Viewport,useShortcuts}.tsx|ts`, `src/screens/EditorScreen.tsx`
(mobile "More" tabs), `src/lib/storage/db.ts` (clear cached patches on delete), `src/lib/image/decode.ts`
(`bitmapToImageData` accepts canvases), `src/lib/ml/registry.ts` (migan ready), `src/lib/ml/ort.ts`,
`src/lib/portrait/mediapipe.ts`, `scripts/copy-wasm-runtimes.mjs`, `vite.config.ts`, `playwright.config.ts`,
`e2e/network-isolation.spec.ts`, `.gitignore`. `ml.worker.ts`, `protocol.ts` and `client.ts` are untouched.

## Tests actually run

- `npm run typecheck`: clean. `npm run lint`: 0 errors (10 pre-existing warnings).
- `npm test`: 10 files, **120 passed** (adds 20 removal tests: crop/margin, resolution independence, mask
  encoding, feather weights, tensor layout, compositing byte-identity, cache keys, schema/repair; plus the
  MI-GAN contract test on the real model through `onnxruntime-node`).
- Playwright (desktop, ports 5202/8802, `VITE_CACHE_DIR=.vite-cache`):
  - `e2e/remove.spec.ts` **passed**: paint over the skin-coloured block → the region turns to sky; undo
    restores it; redo re-applies (cache); hide/show; export (900×600) contains the removal and the field
    stays untouched.
  - `e2e/network-isolation.spec.ts` (now also runs Remove and checks the MI-GAN file was fetched from
    `/models/`) **passed** after the MediaPipe telemetry fix; it **failed** before the fix with two requests
    to `odml.pa.googleapis.com`.
  - `e2e/editor.spec.ts` (regression check, run together with remove.spec): 6 of 7 passed on the first run;
    "applies EXIF orientation and exports rotated dimensions" timed out on the Export click while the
    machine was loaded, and **passed** when re-run alone. That test has no removals.
- `npm run build`: succeeds.
- Visual checks (Playwright screenshots, read by me): generated scene (block removed cleanly) and
  `C:\Windows\Web\Wallpaper\ThemeB\img24.jpg` (a glass ribbon tip removed with a seamless dark
  background). A deliberately huge, partly covered removal (≈40 % of the frame) left smears, as expected
  for MI-GAN on large areas.

## Known issues / limits

- Large removals are MI-GAN's weak spot (smears, repeated texture); LaMa (guide "later") is the upgrade.
  The GAN works at 512 px, so very large fills at full resolution are softer than the photo.
- Before/after compare shows removals on both sides (one source texture); use the eye toggle to compare.
- Headless SwiftShader timings: model load + first fill took 20–30 s with the WebGL preview competing for
  CPU; a bare inference is ~3 s on WASM. WebGPU was not exercised (not available headless).
- Inference cannot be interrupted mid-run (ONNX Runtime limitation); Cancel discards the result.
- Semi-transparent PNGs: pixels of the image pass through a 2D canvas when removals exist, so partially
  transparent pixels can shift by rounding. Opaque photos are exact outside the removal.
- The preset thumbnails in the left panel still show the photo without removals (they render from the
  original preview); the filmstrip thumbnail updates.
- Under the shared `node_modules` junction, Vite logs 403s for Fontsource fonts in worktrees (fs.allow);
  this is a worktree artefact, not an app bug.
