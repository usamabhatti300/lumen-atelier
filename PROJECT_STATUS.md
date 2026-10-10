# Project status: Lumen Atelier

_Last updated: 2026-10-10. Source of truth for requirements: `PHOTO_EDITING_STUDIO_MASTER_SPEC.md`._

## Summary

All eight staged phases from spec §18 have a working implementation. The signature workflow
(reference → analysis → editable preset → preview on target → refine → save → reuse) works end to
end, with or without an AI key. Items still open are listed under **Remaining work**. Nothing
there is presented as finished in the UI.

## Stage checklist

| Stage | Status | Notes |
| --- | --- | --- |
| 1 Foundation | Done | Vite 8 + React 19 + TS 6 (strict) + Tailwind 4, design tokens, workspace, dev runner |
| 2 Working editor | Done | Import (drag/drop, picker, multi), GPU render, basic adjustments, undo/redo, export |
| 3 Advanced colour | Done | HSL ×8, RGB curves, 3-way + global wheels, mixer, levels, versioned schema |
| 4 Preset library | Done | 70 original presets, real previews, search, categories, favourites, intensity |
| 5 Reference → preset | Done | Stats worker, optional Claude interpretation, deterministic mapping, adaptation, suggestions, save |
| 6 Portrait & masks | Done | MediaPipe landmarks + segmentation, retouch tools, healing, brush/gradient/segment masks, layers |
| 7 Persistence & interop | Done | IndexedDB projects + autosave/recovery, preset JSON, `.cube` import/export, XMP export, batch apply/export |
| 8 Polish | Mostly done | Motion system, responsive layout, a11y basics, lint, CSP. See remaining work |

### AI model integrations (`docs/INTEGRATION_GUIDE.md`)

| Step | Status | Notes |
| --- | --- | --- |
| 0 Commit | Done | On GitHub (`origin/main`) |
| 1 ML runtime | Done | ONNX Runtime Web 1.30.0 + Transformers.js 4.3.1 in a Web Worker (WebGPU → multi-threaded WASM), checksum-verified same-origin model loading, Settings → AI models, network-isolation e2e test |
| 2 SlimSAM select object | Next | Registry entry verified (planned) |
| 3 MI-GAN remove | Not started | Registry entry verified (planned) |
| 4 Depth Anything V2 Small lens blur | Not started | Registry entry verified (planned) |
| 5 Real-ESRGAN upscale | Not started | Registry entry verified (planned) |
| 6 BiRefNet (optional, 214 MB) | Needs owner's OK | Not in the registry |

## Technical decisions

- **TypeScript backend instead of Python/FastAPI** (spec allows it): the server only proxies one
  vision call, and Node 24 runs TypeScript natively, so the browser and server share the same Zod
  schema (`shared/ai-schema.ts`). No Python toolchain is needed.
- **Default model** `claude-opus-5-5` with structured outputs (JSON schema, enums only), effort
  `medium`, server-side refusal fallback. Override via `ANTHROPIC_MODEL`.
- **WebGL2 + GLSL** pipeline with a CPU reference implementation (shared parameter derivation). The CPU
  path is the worker fallback and is what the unit tests exercise.
- **OKLab/OKLCh** for HSL, vibrance and grading; linear light for exposure/WB/blur; sRGB-encoded
  luminance for tone. See `docs/RENDERING_PIPELINE.md`.
- **MediaPipe Tasks Vision** (Apache-2.0) for face landmarks (478 pts, irises) and multiclass person
  segmentation; WASM served from our origin, models downloaded by `npm run setup:models`.
- **No OpenCV.js**: the CV needs (statistics, k-means, healing source search, bilateral surface blur)
  are small and implemented directly; OpenCV.js would add ~8 MB for little gain.
- **No GSAP**: Motion for React plus CSS covers every animation.
- **React Router 8** (declarative), **Zustand 5**, **idb 8**.
- Pinned exact dependency versions; `npm audit`: 0 vulnerabilities at install time (re-checked after adding the ML packages).
- **On-device ML runtime** (`src/lib/ml/`): ONNX Runtime Web 1.30.0 (MIT) is shared with Transformers.js
  4.3.1 (Apache-2.0) via an npm `overrides` entry and ORT's global registration symbol, so one runtime
  ships. Sessions run in a dedicated worker, WebGPU first with WASM fallback. Pages are cross-origin
  isolated (COOP + COEP `require-corp`), so WASM runs multi-threaded. Model files are served from
  `/models/` and the WASM binary from `/ort/`; every model file is size- and SHA-256-checked against
  `src/lib/ml/registry.ts` (pinned upstream revisions), only safe formats are accepted, and
  Transformers.js has remote loading disabled plus a same-origin fetch guard. The CSP is unchanged
  (`connect-src 'self' blob: data:`).

## Tests actually run (2026-10-10)

- **Step 1 (ML runtime)**: Vitest **8 files, 99 tests passed** (adds the model registry: hashes, pinned
  URLs, safe formats, no non-commercial Depth Anything sizes; verified fetch: progress, checksum mismatch,
  truncated/oversized files, 404/HTML fallback, cancel, unsafe paths; origin guard; the hand-built
  self-test ONNX model run through onnxruntime-web; install-state logic; the `/api/models` file listing).
  Type-check clean; ESLint 0 errors (same 10 warnings); production build passes. E2E: see the Step 1
  run below. Manual check (Playwright screenshots) of Settings → AI models on the dev server and on the
  production server under the real CSP: models listed with size/licence/state, runtime check reports
  WASM working with 4 threads, ONNX Runtime 1.30.0, Transformers.js 4.3.1, remote models blocked;
  only same-origin requests and no console errors.
- **Before Step 1** — Vitest: 7 files, **83 tests passed**: pixel maths (identity at defaults, exposure, WB, HSL,
  grading, curves, levels, mixer, extremes), geometry, preset blending and library distinctness,
  schema/clamping/repair, preset import/export (unknown keys, clamping, invalid files), history,
  reference statistics/mapping/adaptation/suggestions, `.cube`/XMP, API server (missing key,
  validation, malformed/non-JSON model output, refusal, timeout/auth mapping, body limit, rate limit,
  path traversal).
- **Production build** (`npm run build`): passes. **ESLint**: 0 errors, 10 warnings
  (react-refresh "only export components" hints). **Type-check**: clean.
- **Production server smoke test**: SPA fallback, CSP/security headers, WASM MIME, `/api/health`;
  face detection verified working under the production CSP.
- **Playwright e2e** (headless Chromium, SwiftShader software WebGL): see the latest run below.
- **Manual visual checks** (Playwright screenshots, reviewed): gallery, editor, preset application,
  before/after split, reference workflow (all stages), portrait detection, skin smoothing close-ups,
  background blur, colour panel.

### Step 1 e2e runs

- New `e2e/network-isolation.spec.ts`: runs MediaPipe face/subject detection and the AI runtime check,
  and fails on any request to another host or any CSP violation. **Passed** (41 s).
- First full run: 9 passed, 1 failed (critical journey). Cause: Vite discovered the ML packages late and
  reloaded the page mid-test, losing the uploaded reference. Fixed with `optimizeDeps.include`. (Trying
  `exclude` instead made each test ~3× slower; measured against the pre-Step-1 baseline: EXIF export test
  47 s before, 36 s with the final config.) Critical journey re-run alone: **passed** (6.6 min).
- Final full run: 8 passed, 2 failed. The critical journey and the EXIF export test timed out because a
  click waited more than 60 s for a busy page under software GL (this whole run took 11.8 min vs 6.8 min for
  the baseline). For comparison, **the unmodified pre-Step-1 commit run the same day also failed the
  critical journey** with the same click timeout (8 passed, 1 failed). The EXIF test passed in three
  other runs with the Step 1 code (36–52 s), and `editor.spec.ts` as a file passed **7/7** with COEP on
  (3.4 min) and off (3.2 min). Conclusion: the critical journey is flaky on this loaded machine under
  SwiftShader. It passes when run alone (6.6 min), and that's how to verify it until it's made more
  robust (e.g. longer action timeouts for the analyse/export clicks).

### Pre-Step-1 e2e run

9 Playwright tests (8 desktop, 1 mobile/Pixel 7):

- Final full-suite run: **8 passed, 1 failed**. The failure was the critical journey: under heavy
  software-GL load the `/api/health` check timed out (5 s) and the app correctly, but wrongly for this
  case, reported "App server unreachable". Fix: 10 s timeout, one retry, and failures are no longer
  cached. The critical journey was then **re-run on its own and passed** (5.4 min under SwiftShader).
- Covered: the full critical journey (reference upload → analysis without AI key → apply → intensity →
  save preset → refine exposure → reload → reapply saved preset → export; exported JPEG has original
  dimensions and measurably different pixels; stored original is byte-identical, verified by
  SHA-256); unsupported, corrupt and HEIC files; slider → render change → undo/redo; keyboard slider
  control and split; EXIF orientation 6 → rotated preview and export; 1:1 crop export size and PNG
  transparency; preset previews, favourites and intensity; radial mask with local exposure; mobile
  bottom nav, presets sheet, reference entry point and no horizontal overflow.
- Earlier runs found and led to fixes for: an autosave feedback loop (save state stuck on "Saving…"),
  the canvas not re-attaching after the per-photo reveal remount, the reference display copy being
  slow, and responsive top-bar classes being overridden (horizontal overflow on phones).

## Performance observations

- Measured on this machine in headless SwiftShader (software GL), i.e. a worst case: the editor
  stays usable but preset thumbnails and analysis are slow (seconds). On real GPUs these are much
  faster, but this hasn't been benchmarked here yet. Use **Settings → Performance → Run benchmark** on
  a target device for real numbers; no frame-rate claims are made.
- Preview resolution 1280/2048/3072 (setting); export is tiled at 2048 px.
- Main JS chunk ≈ 539 kB (170 kB gzip); editor, reference studio, MediaPipe, settings and library
  screens are code-split.

## Known issues and limitations

- HEIC/HEIF, AVIF and camera RAW are rejected with an explanation (not supported).
- Working space is sRGB; wide-gamut images are converted at import, and exports are sRGB without EXIF.
- Detail controls (sharpening, noise) preview at preview resolution; export applies them at full resolution.
- Grain amplitude in the preview is an approximation when grain is finer than a preview pixel.
- Segmentation (subject, background, hair, skin, clothes) is trained on people; other subjects aren't detected.
- Skin smoothing, healing and mask blur need WebGL2 (the CPU fallback discloses this).
- Reference matching approximates a look; scene colours can leak into HSL estimates (damped and
  flagged as low confidence). It cannot recover original editing settings.
- XMP export is approximate (different colour maths); omitted settings are listed on export.
- Batch export triggers one download per file (no ZIP).
- WebGPU is not available in headless Chromium, so automated tests cover the WASM path only. WebGPU
  has to be confirmed in a real browser (Settings → AI models → Check AI runtime).
- The production build also emits ORT's WASM binary as a hashed asset (27 MB, unused, because the app
  loads it from `/ort/`). Harmless, but it adds to `dist/` size.
- The AI path has been tested with mocked provider responses; a live call needs a real
  `ANTHROPIC_API_KEY`, which wasn't available in this environment.

## Remaining work and next recommended stage

1. **Live AI verification** with a real key: run the reference workflow on a varied set of
   references and tune `MAPPING` constants against human judgement (build a small eval set).
2. **Performance budget on real hardware**: run the benchmark on a mid-range laptop and phone,
   and set preview defaults from the results. Consider moving thumbnails to an OffscreenCanvas worker.
3. **Accessibility audit** (axe + screen reader pass) and a formal colour-contrast check of the faint text tokens.
4. **Editable gradient handles** (masks can currently be added and removed, not dragged after creation).
5. HEIC decoding (WASM) and RAW evaluation; ZIP for batch export; project export/import as a file.
