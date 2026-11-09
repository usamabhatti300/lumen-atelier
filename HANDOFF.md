# Handoff: read this first in a new session

_Last updated: 2026-11-08 (newest: roadmap 1.0, Finish step: export date stamp and contact sheet). Owner: Usama (usama@doppellabs.ai)._

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

- **2026-11-08 (newest): building `docs/ROADMAP.md` Phase 1 in order, one item per commit.** Owner's
  rules for this run: ask before any library/model ([ask] items), before naming new rolls; stop at the
  end of Phase 1 for review. **1.0 done**: the **Finish** step (wording agreed, now in DESIGN.md) at
  the top of the export dialog, with an opt-in date stamp (capture date, else today) and a contact-sheet
  share image (this project's photos, up to 12). **1.1 HEIC: skipped for now by the owner** (asked
  about libheif-js). **1.2 done**: adaptive looks (Settings toggle, on by default). See
  PROJECT_STATUS.md for tests. **1.3 done**: automatic face detection, now in a Web Worker
  (it froze the page for ~11 s on the main thread). **1.4 done**: a CC0 sample photo
  (owner picked the A Coruña street) for roll covers and a "try a sample" frame on first visit.
  **Next: 1.5 fast look previews** (OffscreenCanvas worker + IndexedDB cache; measure long tasks).
  **The C: drive is nearly full** (≈0.6 GB free after clearing test leftovers with the owner's OK):
  run long e2e suites with `--trace off`.

- **2026-11-08 (newest): third redesign, "Afterimage" (built, committed).** The owner's new brief banned
  neon lime, rainbow gradients, champagne gold, glassmorphism and glows (so Afterglow's lime and prism are
  gone). Three directions were explored (https://claude.ai/artifact/EiMuAQQsWDAyBroGwmHvN2); the owner
  picked "Afterimage" (digital nostalgia), refined on https://claude.ai/artifact/9EZchzYhzszRsEGsVCw24E,
  and chose the **Lilac** accent `#c8b8ff` and the **Offset** wordmark. `DESIGN.md` describes it
  (night-black chrome, ivory text, lilac, orange date stamp, Martian Mono + Geist, the hard lilac offset,
  the Three Props Rule). Built in this pass, all UI only (no pixel-maths change):
  tokens/fonts/wordmark/icons; hybrid slider (continuous rail + tick scale); rolls
  (`src/lib/presets/rolls.ts`, an editorial layer over the 14 categories) with **Last roll** (recent looks,
  `presetStore.recent`, IndexedDB setting `recentLooks`) and **Kept** (favourites); roll covers on home
  rendered on your last photo; frame numbers and a date stamp on the chosen look; the **afterimage**
  transition on look change (`engine.snapshot()` = a read-only copy of the last "after" render; GL
  readback comes back the right way up, verified); a camera-style compare readout; viewfinder crop corners
  with a ratio readout; a camera-style info list on the match result (`src/lib/analysis/readout.ts`,
  tested). Match a look uses the Lucide `Blend` icon (no wand).
  **Next, agreed with the owner (second step):** opt-in date stamp burned into exports and a "contact
  sheet" share image (both need exporter changes). Still open from the shared UX plan: sheet detents,
  export size presets, labelled desktop top bar; not yet checked on a real phone.
  **Follow-up the same day** (owner: "not like the mockups", home "too much text"): the phone top bar,
  dock icons (`src/components/icons.tsx`), film-frame looks strip, mono sheet titles and the More tool
  grid now follow the approved mockups; home rebuilt as headline + two actions + contact sheet + rolls.
- **2026-11-08 (earlier): second critic pass on Afterglow.** Scored in the running app at 390/834/1440 px:
  6.4 → 7.4 average. Kept the identity, fixed the execution (details and the list of problems in
  `PROJECT_STATUS.md`). Scorecard before → after: crave 6→7, identity/colour 6.5→7.5, type 7→7, layout
  5.5→7.5, motion 5→7.5, beginner on phone 6→8, enthusiast on desktop 7.5→7.5, consistency 7→7.5,
  accessibility 7→7.5, performance feel 6→7. **Still under the brief's 8.0 bar.** Open, in order of
  impact: (1) identity is still close to the common "dark + neon + one serif word" template; a more
  ownable signature probably needs real sample photography (none licensed in the repo) and a custom
  display treatment; (2) main-thread long tasks of 0.3–1 s when a look applies (dev build; preset
  thumbnails and the render share the main thread; an OffscreenCanvas worker for thumbnails is the
  likely fix); (3) the desktop top bar's 14 unlabelled icons; (4) shadcn/ui still unused; (5) not yet
  checked on a real phone.
- **2026-11-08 (later): critic review → second redesign, "Afterglow"** (dark graphite, lime lumen accent,
  prism for signature moments, Geist + Instrument Serif). It replaced "Film Stock Box", which failed the
  review (5.6/10). Before/after scorecard and test results are in `PROJECT_STATUS.md`. Read `DESIGN.md` before any UI work;
  `PRODUCT.md` holds product truth. Skills (Impeccable, shadcn, UI UX Pro Max, Vercel React, Web Design
  Guidelines) live in `.claude/skills`; MCP servers (Playwright, Context7, Chrome DevTools, shadcn) in
  `.mcp.json`. shadcn is set up (`components.json`, `cn()` in `src/lib/utils.ts`) but `shadcn init` was not
  run, so it doesn't overwrite the theme; restyle any added component to the role tokens.
- All spec stages are implemented; see `PROJECT_STATUS.md` for the checklist and limitations.
- Tests (2026-11-08, after the Afterglow redesign): 193 Vitest pass; e2e `editor` + `mobile` (11),
  `test:e2e:pwa` (4, production build), `critical-journey` and `reference-replace` pass (slow under
  SwiftShader software GL in headless Chrome). Type-check and lint (0 errors) are clean.
- Last change the user asked for (done 2026-10-11): an **installable PWA with every feature, fully
  mobile responsive**, so they can use it on their phone. Manifest + icons (`public/`,
  `scripts/generate-icons.mjs`), service worker (`src/pwa/sw-template.js`, generated into `dist/sw.js` by
  `scripts/pwa-plugin.ts`, production builds only), runtime in `src/pwa/` (update prompt, Install button +
  iOS instructions, offline pill, Settings → App & offline with "Save AI models offline", Android share
  target, file handlers, home-screen shortcuts). Mobile: panels dock under/beside the photo, ⋮ menu for
  hidden top-bar actions, pinch / double-tap zoom, touch-mode chip replacing Shift/Alt, `coarse:` / `fine:`
  Tailwind variants, Share / Save to Photos after export. Tests: `npm run test:e2e:pwa`, `e2e/mobile.spec.ts`.
  **Open:** the phone needs an HTTPS address to install; the user hasn't chosen a host yet (ask before
  deploying). Not yet tried on a real phone (Chromium Pixel 7 emulation only; iOS Safari untested).
- Previous change: in the reference studio, the generated look is **auto-applied** to the target photo when
  analysis finishes (`src/features/reference/ReferenceStudio.tsx`).
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
tests actually run; follow DESIGN.md (role tokens, the photo stage is `.theme-frame`, one lilac action per screen, the hard lilac offset instead of glows, orange only for date stamps, at most three analog props).
