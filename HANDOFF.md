# Handoff: read this first in a new session

_Last updated: 2026-10-10. Owner: Usama (usama@doppellabs.ai)._

## What this project is

**Lumen Atelier**: a local-first, browser-based premium photo editor built from scratch to the spec in
`PHOTO_EDITING_STUDIO_MASTER_SPEC.md` (the source of truth). Its signature feature is
**reference photo → analysis → editable preset → apply to your photo → refine → save and reuse**.

Stack: React 19 + TypeScript 6 (strict) + Vite 8 + Tailwind 4 + Zustand + Zod + Motion; a WebGL2/GLSL
render engine with a CPU fallback; MediaPipe (on-device face landmarks + person segmentation);
IndexedDB storage; a small Node/TypeScript API server (`server/`) that calls Claude
(`claude-opus-5-5`) for optional style interpretation. Vitest + Playwright tests.

More detail: `README.md` (setup, features), `PROJECT_STATUS.md` (status, tests, known issues),
`AGENTS.md` (architecture map and coding rules), `docs/RENDERING_PIPELINE.md`,
`docs/AI_ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`.

## How to run

```bash
npm install
npm run setup:models   # MediaPipe models into public/models (already done on this machine)
npm run dev            # web app + API. Port 5173 is used by another app on this PC, so Vite picks 5174/5175
```

No `ANTHROPIC_API_KEY` is configured. Reference analysis uses the **local Ollama model `qwen3-vl:4b-instruct`** (Apache-2.0,
server/ollama.ts, loopback only) when Ollama is running, otherwise measurements only. The owner's laptop is an
i7-8665U with 16 GB RAM and Intel UHD 620, so local inference is CPU-only (slow).
To enable AI: create `.env` with `ANTHROPIC_API_KEY=...` and restart `npm run dev`. Never use `VITE_` for secrets.

## State as of the last session

- All spec stages are implemented; see `PROJECT_STATUS.md` for the checklist and limitations.
- Tests: 83 Vitest tests pass; 9 Playwright e2e tests (the critical journey passes, ~5 min under
  SwiftShader software GL in headless Chrome). Type-check, lint (0 errors) and production build are clean.
- Last change the user asked for (done): in the reference studio, the generated look is now
  **auto-applied** to the target photo when analysis finishes, and **Save as preset / Intensity /
  Refine** sit directly under the preview (`src/features/reference/ReferenceStudio.tsx`).
- Git: committed and pushed to `origin` (https://github.com/usamabhatti300/lumen-atelier, `main`); one commit per integration step.
- **AI integration progress** (`docs/INTEGRATION_GUIDE.md`): **Steps 0–5 done** (2026-10-11): Select object,
  Remove, Lens blur and AI upscale. Steps 2–5 were built in parallel worktrees and merged; details in
  `docs/steps/STEP_2.md` … `STEP_5.md`. **Step 6 (BiRefNet, 214 MB) needs the owner's OK.**
- Open owner questions: AI upscale 64 MP cap OK? Warn about slow CPU-only upscaling? Keep AI upscale in
  batch export? Keep the MediaPipe telemetry workaround (vs another approach)?

## What the user wants next

The user said the app works but **doesn't yet feel like a premium-level editor**, and wants **free,
open-source projects that would make photo results dramatically better**. Recommendations were given
(below); the user will choose which to integrate. **Ask the user which ones before implementing.**
They may also want a visual/UX polish pass.

### Recommended integrations (licences checked 2026-10-10)

All run **in the browser** via **ONNX Runtime Web** (MIT) with WebGPU/WASM, or **Transformers.js** (Apache-2.0),
which keeps the local-first privacy model. Load models lazily with progress and cancel, as with MediaPipe.

| Priority | Project | What it adds | Licence (verified) |
| --- | --- | --- | --- |
| 1 | **SAM 2** (facebookresearch/sam2), or a light variant such as EfficientSAM/MobileSAM | Click-to-select any object (sky, dress, car), far better masks | Apache-2.0 (code + checkpoints) |
| 2 | **BiRefNet** (ZhengPeng7/BiRefNet), ONNX weights in releases | Hair-accurate subject/background separation for blur, replace, relight | MIT |
| 3 | **MI-GAN** (Picsart-AI-Research/MI-GAN), ONNX | Object removal / content-aware fill, a big upgrade over spot healing | MIT (code) + MIT (LICENSE-WEIGHTS) |
| 3b | **LaMa** (advimman/lama) | Higher-quality, heavier inpainting (could be server-side) | Apache-2.0 |
| 4 | **Depth Anything V2 – Small** | Depth map, enabling realistic lens blur (bokeh) and depth-aware light/fog | Small = Apache-2.0; **Base/Large/Giant are CC-BY-NC (non-commercial): use Small only** |
| 5 | **Real-ESRGAN** (`realesr-general-x4v3`, ~4.6 MB ONNX) | 2×/4× AI upscaling and detail recovery for low-res photos | BSD-3-Clause |
| 6 | **GFPGAN** | Face restoration for blurry/old photos | Apache-2.0 (check bundled third-party parts before shipping) |
| 7 | **Image-Adaptive 3D LUT** (HuiZeng) | Learned one-click "Auto enhance" that outputs a 3D LUT (we already render LUTs) | Code Apache-2.0; pretrained weights use the MIT-Adobe FiveK dataset (research terms), so retrain or confirm before commercial use |

**Avoid for a commercial/free product:** CodeFormer (S-Lab licence, non-commercial), Depth Anything V2
Base/Large (CC-BY-NC), BRIA RMBG-2.0 (non-commercial weights), and copying GPL/AGPL code (darktable,
RawTherapee, Upscayl) into this codebase. Their *ideas* (e.g. darktable's sigmoid / Blender AgX tone mapping)
can be re-implemented from scratch.

Non-ML upgrades that also lift quality:
- An **AgX/sigmoid-style filmic tone mapper** for highlight roll-off (own implementation).
- **HEIC** via libheif-js (LGPL; dynamic linking/WASM is fine) and **RAW** via LibRaw-WASM (LGPL/CDDL); verify first.

**Step-by-step plan the user is following:** `docs/INTEGRATION_GUIDE.md` (Step 0 commit → Step 1 ML runtime →
Step 2 SlimSAM click-to-select → Step 3 MI-GAN removal → Step 4 Depth Anything V2 Small lens blur →
Step 5 Real-ESRGAN upscale → Step 6 optional BiRefNet). Check which steps are already done (git log,
`src/lib/ml/`) before continuing.

### ML runtime notes (Step 1, 2026-10-10)

- `onnxruntime-web@1.30.0` + `@huggingface/transformers@4.3.1`. Transformers.js pins its own
  `onnxruntime-web` dev build; an npm `overrides` entry in `package.json` dedupes it to 1.30.0, and
  `src/lib/ml/ort.ts` registers our ORT instance on `globalThis[Symbol.for('onnxruntime')]` before
  Transformers.js loads, so only one runtime ships.
- ORT's WASM binary is copied to `public/ort/` on install (`scripts/copy-wasm-runtimes.mjs`); `wasmPaths`
  points at the `.wasm` only, because Vite dev refuses runtime `import()` of `.mjs` files in `public/`
  (the `/webgpu` bundle embeds its JS loader anyway).
- COOP + COEP (`require-corp`) are now sent by `server/app.ts` and the Vite dev/preview servers, so the
  page is cross-origin isolated and WASM runs multi-threaded (4 threads here).
- `src/lib/ml/registry.ts` lists every model with a pinned revision URL, size and SHA-256 (verified at the
  source on 2026-10-10). Planned models have `status: 'planned'`; flip to `'ready'` in the step that ships
  the feature so `setup:models` downloads it. The SlimSAM (fp32) and Depth (fp16) file choices are
  provisional: confirm them against the real graphs in Steps 2 and 4. BiRefNet is deliberately not in
  the registry (no upstream digest; Step 6 needs the user's OK and an on-demand downloader).
- Transformers.js ends up with an empty device list because ORT is pre-registered: pass `device: 'auto'`
  plus explicit `session_options.executionProviders: [backend]` (see `src/lib/ml/sam.ts`, `depth.ts`).
- Without WebGPU, `ort.ts` loads `onnxruntime-web/wasm` (plain `ort-wasm-simd-threaded.wasm`, also
  copied to `public/ort/`); with WebGPU the `/webgpu` bundle (asyncify binary).
- Transformers.js: `allowRemoteModels = false`, `localModelPath = '/models/'`, browser/WASM caches off,
  and `env.fetch = guardedFetch` (same origin only, registry files only, SHA-256 verified, 404 for anything
  unregistered). Model loads report byte progress via `setTransformersContext`.
- Graph inspection: Python `pip install onnx` fails here (Windows long-path limit); use the installed
  `onnxruntime-node` (`inputNames`, `outputNames`, `inputMetadata`) from a scratch script instead.
- `vite.config.ts` has `optimizeDeps.include` for the ML packages. Without it Vite discovered them late and
  force-reloaded the page mid-test (broke the critical journey). `exclude` instead made every e2e test
  ~3× slower, so don't switch to it.
- Local AI (server/ollama.ts) gotchas, all measured on the owner's laptop: use the **-instruct** tag (the default
  `qwen3-vl:4b` is a thinking model that spends its whole budget on hidden reasoning); do **not** pass a JSON-schema
  `format` (the grammar made it emit whitespace for 5+ minutes), use the template prompt + Zod instead; stream the
  response (Node's fetch drops requests with no headers after 300 s). ~1.5–3.5 min per analysis on CPU, so the studio
  applies the measured look first and refines in the background.
- Headless Chromium has no WebGPU, so tests cover the WASM path; WebGPU is only exercised on a real browser.

### Suggested integration architecture

`src/lib/ml/` with a model registry (URL, size, licence, input/output contract), an
`onnxruntime-web` session per model running in a Web Worker (WebGPU first, WASM fallback), model files
downloaded on first use (or via `npm run setup:models`), and results fed into the existing systems:
masks → `SegmentComponent`-like components, inpainting → a new non-destructive "patch" layer,
depth → a new lens-blur pass in `src/lib/engine/gl`, upscaling → export option. Every model needs
licence notes in README/Settings and must disclose download size.

## Conventions to keep

Read `AGENTS.md`. Key rules: change pixel maths in **both** `pixel.ts` and `shaders.ts` with tests;
the AI returns only categorical descriptions (`shared/ai-schema.ts`); no fake progress; report only
tests actually run; amber is the only accent colour.
