# Lumen Atelier

A local-first photo editing studio for photographers and creators. It has GPU colour grading,
portrait retouching, masks, seventy original presets, and **reference matching**: give it a
photo whose look you love and it builds an editable preset you can refine and reuse.

> The preset approximates a reference's look from the finished image. A JPEG doesn't contain its
> editing history, so the original Lightroom/Photoshop settings cannot be recovered.

## Quick start

Requirements: **Node.js 22.18+** (24 recommended; the API server runs TypeScript natively) and a
browser with WebGL2 (current Chrome, Edge, Firefox or Safari).

```bash
npm install            # also copies the MediaPipe and ONNX Runtime WASM files into public/
npm run setup:models   # downloads the on-device models (~20 MB today) into public/models/, checking SHA-256
npm run dev            # web app on http://localhost:5173, API server on :8787
```

Open the printed URL. If port 5173 is busy, Vite picks the next free one.

### Optional: AI style interpretation

Reference matching works without any key, using pixel measurements only. To add a vision model's
interpretation, create a `.env` file in the project root (never commit it):

```bash
ANTHROPIC_API_KEY=sk-ant-...
# optional
ANTHROPIC_MODEL=claude-opus-5-5
AI_RATE_LIMIT_PER_MINUTE=10
API_PORT=8787
```

Restart `npm run dev`. The key is read only by the Node server (`server/`) and is never exposed
to the browser. Do not use `VITE_` variables for secrets. The first time you analyse a reference,
the app asks before sending a downscaled copy of that reference (never your edited photos) to the
provider.

### Production build

```bash
npm run build   # type-check + Vite build into dist/
npm start       # serves dist/ and the API on http://127.0.0.1:8787
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + API server (watch mode) |
| `npm run build` | `tsc -b` then production build |
| `npm start` | Serve the built app and API |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; run `npx playwright install chromium` once) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run setup:models` | Download the on-device AI models the tools use (verified by SHA-256) |

## Features

- **Editor**: exposure, brightness, contrast, highlights, shadows, whites, blacks, temperature, tint,
  vibrance, saturation, B&W, texture, clarity, dehaze, sharpening, noise reduction, vignette and grain;
  HSL (8 bands); RGB tone curves; 3-way + global colour wheels; channel mixer; levels; `.cube` LUTs;
  crop, aspect presets, 90° rotation, flip and straighten.
- **Non-destructive**: originals are never modified; edits are versioned JSON, with bounded,
  gesture-grouped undo/redo, per-control and full reset, copy/paste settings, an adjustments
  visibility toggle, and autosave with session recovery.
- **Compare**: before/after split (draggable), side by side, hold for before; fit, 100% and wheel zoom
  with pan; live RGB histogram with clipping readout.
- **Presets**: 70 original presets in seven families with real previews rendered on your photo,
  search, category filters, favourites, intensity, and your own presets (create, duplicate, rename,
  delete, JSON import/export).
- **Reference matching**: crop or trim the reference (screenshot borders are detected), staged
  analysis with cancel and retry, palette and tonal-zone readout, plain-language description,
  confidence and warnings, preview on your photo, optional brightness and cast adaptation,
  comparison suggestions, then save and reuse.
- **Portrait**: on-device face landmarks and person segmentation (MediaPipe): skin smoothing that
  keeps pores, spot healing with automatic source selection, under-eye, eyes, teeth, face light,
  background blur, darken and mute.
- **Masks**: brush (paint/erase, size, softness, flow), linear and radial gradients, and subject,
  background, hair, skin and clothes masks; layers with visibility, opacity, invert, ordering and
  12 local adjustments.
- **Batch and interop**: apply settings or presets to many photos with progress and cancel; batch
  export; `.cube` LUT export; approximate Lightroom XMP export (limitations listed when exporting).
- **Export**: JPEG (quality), PNG, WebP; full resolution via tiled GPU rendering; real progress and
  cancellation.

## Documentation

- [docs/RENDERING_PIPELINE.md](docs/RENDERING_PIPELINE.md): order of operations, colour spaces, export tiling, performance.
- [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md): measurement → interpretation → mapping, privacy, limits.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): tokens, type, motion, layout, accessibility.
- [PROJECT_STATUS.md](PROJECT_STATUS.md): what's done, tests run, known issues, next steps.
- [AGENTS.md](AGENTS.md): conventions for contributors and coding agents.

## Formats and limits

Import: JPEG, PNG, WebP (validated by content, up to 150 MB and 150 MP). HEIC/HEIF, AVIF and camera
RAW are detected and rejected with an explanation (not supported yet). Working space is sRGB; wide-gamut
images are converted on import. Exports are sRGB without camera metadata.

## On-device AI models

All models run in the browser (MediaPipe via WebAssembly; the others via ONNX Runtime Web with WebGPU,
falling back to multi-threaded WebAssembly) in a Web Worker. Photos never leave the device. Model and
runtime files are served by this app from `/models/` and `/ort/`, never from Hugging Face or a CDN at
runtime, and every model file is checked against the SHA-256 recorded in `src/lib/ml/registry.ts`.
Only `.onnx`, `.json`, `.task` and `.tflite` files are loaded (no pickle formats). **Settings → AI
models** shows each model's size, licence and download state, and can check the runtime on your device.

| Model | Used for | Download | Licence | Status |
| --- | --- | --- | --- | --- |
| MediaPipe Face Landmarker | Portrait retouching | 3.8 MB | Apache-2.0 | In use |
| MediaPipe Selfie Multiclass | Subject/background/hair/skin/clothes masks | 16.4 MB | Apache-2.0 | In use |
| SlimSAM-77 (`Xenova/slimsam-77-uniform`) | Select object (planned) | 40 MB | Apache-2.0 | Not used yet |
| MI-GAN (`migan_pipeline_v2.onnx`) | Remove tool (planned) | 28 MB | MIT (code and weights) | Not used yet |
| Depth Anything V2 **Small** | Lens blur (planned) | 50 MB | Apache-2.0 (Base/Large are non-commercial and are not used) | Not used yet |
| Real-ESRGAN general x4v3 | AI upscale on export (planned) | 4.9 MB | BSD-3-Clause | Not used yet |

`npm run setup:models` downloads only the models a tool uses. Planned models are added to it as their
features ship (see `docs/INTEGRATION_GUIDE.md`).

## Licences

Code: project licence TBD by the owner. Third-party: React, Vite, Tailwind, Motion, Zustand, Zod,
idb, Lucide (MIT/ISC); ONNX Runtime Web (MIT); Transformers.js (Apache-2.0); MediaPipe Tasks Vision and its
models (Apache-2.0); the AI models listed above under their own licences; Inter, Instrument Serif and
IBM Plex Mono (SIL OFL). The built-in presets are original works and imply no affiliation with film
manufacturers or other preset makers.
