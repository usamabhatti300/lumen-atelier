# Adding open-source AI models to Lumen Atelier: step by step

This guide adds six free, commercially usable AI features. Follow the steps **in order**: each one
builds on the previous one, and you test after each step before moving on.

**Two ways to do each step**

- **Easy way (recommended):** open Claude Code in this project folder and paste the prompt shown in the
  step. It already knows the project (it reads `CLAUDE.md`). Then do the "Check it works" part yourself.
- **Manual way:** follow the "What it involves" notes. You'll need to be comfortable with TypeScript.

Licences were checked on 2026-10-10. Links are at the bottom.

---

## Step 0: save your current work (2 minutes)

Before changing anything, take a snapshot you can return to if something goes wrong. In a terminal
in the project folder:

```bash
git add -A
git commit -m "Working editor before AI model integrations"
```

(Or paste into Claude Code: *"Commit all current work with the message 'Working editor before AI model integrations'."*)

To undo a later step that broke something: `git checkout .` throws away uncommitted changes.
**Commit after every step that works.**

---

## Step 1: install the AI runtime (5 minutes)

All models run inside the browser on the user's GPU, so photos never leave their computer.

```bash
npm install --save-exact onnxruntime-web@1.30.0 @huggingface/transformers@4.3.1
```

- `onnxruntime-web` (MIT): runs `.onnx` model files using WebGPU, falling back to WASM.
- `@huggingface/transformers` (Apache-2.0): a friendlier wrapper with ready-made pipelines for some models.

**Prompt for Claude Code:**

> Read HANDOFF.md and docs/INTEGRATION_GUIDE.md. Do Step 1: install onnxruntime-web 1.30.0 and
> @huggingface/transformers 4.3.1 (exact versions). Create `src/lib/ml/` with a small model registry
> (id, file URL under /models, size, licence, input/output notes) and a Web Worker that loads ONNX
> sessions with WebGPU first and WASM fallback, with download progress, cancellation and clear
> errors. Configure Transformers.js to load models only from our own `/models/` folder
> (allowRemoteModels = false) so the production Content-Security-Policy keeps working. Add a
> "AI models" section to Settings listing each model, its size, licence and whether it is downloaded.
> Run typecheck, lint and unit tests.

**Check it works:** `npm run dev`, open Settings, and confirm an "AI models" section lists the models as not downloaded. No errors in the browser console (F12).

**Commit:** `git commit -am "Add ML runtime"`

---

## Step 2: click to select any object (SlimSAM). Biggest win.

**What users get:** in the Masks tab, choose "Select object", click the sky, a jacket or a car, and get a precise mask they can adjust (exposure, colour, blur…).

- Model: **SlimSAM** (`Xenova/slimsam-77-uniform`), Apache-2.0, a compressed Segment Anything.
- Later upgrade: SAM 2.1 once a browser export with a clear licence is available.

**Prompt for Claude Code:**

> Do Step 2 of docs/INTEGRATION_GUIDE.md. Add click-to-select masks using SlimSAM
> (Xenova/slimsam-77-uniform, Apache-2.0) through Transformers.js (SamModel, AutoProcessor,
> post_process_masks). Extend `npm run setup:models` to download its files into public/models/.
> Compute the image embedding once per photo in the ML worker (show progress), then each click (and
> shift-click to add / alt-click to subtract points) produces a mask. Store the result as a new
> non-destructive mask component (store the clicked points and cache the raster) inside the existing
> layer system, so masks still survive crop/rotate and export at full resolution. Add a "Select object"
> tool to the Masks panel. Add unit tests for the new mask component and an e2e test that clicks the
> canvas and checks a mask appears. Verify in the browser with a screenshot.

**Check it works:** open a landscape photo → Masks → Select object → click the sky → a red overlay
covers the sky → lower Exposure on that mask → only the sky darkens → export → the sky is darker in the file.

---

## Step 3: remove objects and people (MI-GAN)

**What users get:** a "Remove" brush. Paint over a person, a wire or a sign and it's filled in realistically.

- Model: **MI-GAN** pipeline ONNX, MIT code and MIT weights.
- File: `https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx`
- Inputs: the image (uint8 RGB) and a mask (uint8; **255 = keep, 0 = fill**). It handles resizing internally.
- Heavier alternative for later: **LaMa** (Apache-2.0), better on large areas, best run on the server.

**Prompt for Claude Code:**

> Do Step 3 of docs/INTEGRATION_GUIDE.md. Add a non-destructive "Remove" tool using MI-GAN
> (migan_pipeline_v2.onnx, MIT). Add the model to setup:models. The user paints a removal mask; the
> worker runs MI-GAN on a crop around the painted area (with margin) at preview resolution, and again
> at full resolution on export. Store removals as a new edit-state layer (stroke vectors + cached
> result) so they can be undone, hidden and deleted, and are reapplied on reload. Inspect the ONNX
> graph to confirm the input/output names and dtypes before writing code. Add tests and verify visually
> on a real photo.

**Check it works:** paint over a small object → it disappears with a believable background → undo
brings it back → export contains the removal.

---

## Step 4: realistic portrait lens blur (Depth Anything V2 Small)

**What users get:** "Lens blur" that blurs more the further things are from the subject, like a real
camera, instead of one flat background blur.

- Model: **Depth Anything V2 Small** (`onnx-community/depth-anything-v2-small`), Apache-2.0.
- ⚠️ Use **Small only**. The Base/Large/Giant versions are **non-commercial**.

**Prompt for Claude Code:**

> Do Step 4 of docs/INTEGRATION_GUIDE.md. Add depth estimation with Depth Anything V2 Small
> (onnx-community/depth-anything-v2-small via Transformers.js 'depth-estimation', Apache-2.0; do not use
> Base/Large). Add it to setup:models. Compute depth once per photo in the worker. Add a "Lens blur"
> section (amount, focus distance picked by clicking the photo, falloff) implemented as a depth-weighted
> blur pass in both the GLSL pipeline and the CPU reference (pixel.ts / cpuRender) with tests, applied
> in export tiles too. Combine with the existing person segmentation so the subject stays sharp.
> Verify visually.

**Check it works:** a portrait with depth in the background → Lens blur 60 → click the face to focus →
the background blurs progressively and the face stays sharp.

---

## Step 5: AI upscaling and detail recovery (Real-ESRGAN)

**What users get:** export at 2× or 4× with recovered detail, which helps small or old photos.

- Model: **Real-ESRGAN general x4v3**, BSD-3-Clause, **4.6 MB**.
- File: `realesr-general-x4v3.onnx` from `huggingface.co/jonathanst29/tinier-upscale-models`
- Input: float32 `[1, 3, H, W]`, RGB 0–1. Output: `[1, 3, 4H, 4W]`.

**Prompt for Claude Code:**

> Do Step 5 of docs/INTEGRATION_GUIDE.md. Add "AI upscale 2× / 4×" to the Export dialog using
> Real-ESRGAN realesr-general-x4v3.onnx (BSD-3, from huggingface.co/jonathanst29/tinier-upscale-models).
> Add it to setup:models. Run it in the ML worker on overlapping tiles (e.g. 256 px with 16 px overlap,
> blended seams) after the edit is rendered, with real per-tile progress and cancel. 2× = run 4× then
> downscale with high quality. Respect the existing canvas-size limits and explain if the result would be
> too large. Add an e2e check that a 2× export has double the dimensions.

**Check it works:** export a small photo at 2×. The file is twice as wide and high, and edges and textures are sharper than a normal 2× enlargement.

---

## Step 6: hair-accurate cut-outs (BiRefNet), optional, large download

**What users get:** a "High-quality subject" option with very clean hair edges for background
replacement and blur.

- Model: **BiRefNet** general, Swin-tiny ONNX, MIT. **214 MB**, the smallest official export.
  Download it once and cache it; show the size before downloading.
- File: `https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx`

**Prompt for Claude Code:**

> Do Step 6 of docs/INTEGRATION_GUIDE.md. Add an optional "High-quality subject (214 MB download)"
> mask using BiRefNet Swin-tiny ONNX (MIT). Don't add it to the default setup:models: download on demand
> after the user confirms the size, cache it (Cache Storage), and show real download progress. Inspect
> the ONNX graph for input size/normalisation first. Use its output as a segment-type mask component
> alongside the existing MediaPipe masks. Verify on a portrait with loose hair.

**Check it works:** on a portrait, compare the "Subject" mask with the "High-quality subject" mask at
100% zoom around the hair.

---

## Later / advanced (ask before doing)

| Feature | Model | Note |
| --- | --- | --- |
| Face restoration | GFPGAN (Apache-2.0) | No verified browser export, so it needs ONNX conversion or a server. Check bundled third-party parts. |
| One-click AI auto-enhance | Image-Adaptive 3D LUT (code Apache-2.0) | Its pretrained weights come from a research-only dataset, so retrain before commercial use. Fits our existing LUT engine. |
| Better large-area removal | LaMa (Apache-2.0) | Heavy; best on the server. |
| Better object selection | SAM 2.1 (Apache-2.0) | Once a browser export with a stated licence is available. |

## Do not use (licence problems)

CodeFormer (non-commercial), Depth Anything V2 Base/Large/Giant (non-commercial), BRIA RMBG-2.0
(non-commercial), and code copied from GPL/AGPL apps (darktable, RawTherapee, Upscayl).

## Privacy and security rules (mandatory for every step)

The owner's requirement: **no photo or user data may leave the device** through any of these integrations.

1. **Self-host everything.** Model files and runtime engine files (ONNX Runtime `.wasm`/`.mjs`) are served
   from our own origin (`/models/`, `/ort/`), never from huggingface.co, jsdelivr or any CDN at runtime.
   Transformers.js: set `env.allowRemoteModels = false`, `env.localModelPath = '/models/'`, and point
   `env.backends.onnx.wasm.wasmPaths` to our own folder (by default it loads from a CDN).
2. **Integrity check.** Record each model file's SHA-256 and size in the model registry; `setup:models`
   and the on-demand downloader verify the hash and refuse mismatched files.
3. **Safe formats only.** Load only `.onnx` / `.safetensors`. Never load `.pth`, `.pt`, `.pkl` or other
   pickle-based files, which can execute code.
4. **Keep the Content-Security-Policy strict** (`connect-src 'self'` in `server/app.ts`). Do not add external
   domains to it. If something only works by loosening the CSP, stop and ask the owner.
5. **Network-isolation test.** Add an e2e test that loads the app, runs every AI feature, and fails if any
   request goes to a host other than the app's own (the Claude endpoint is excluded only when the user
   explicitly runs reference analysis with consent).
6. **Dependencies.** Exact pinned versions, `npm audit` (0 high/critical) at each step, no packages from
   unknown publishers, and no telemetry/analytics libraries.

## Rules for every step

1. Commit before and after each step.
2. Each model shows its **download size** and **licence** in Settings → AI models, and in README.
3. Models run in a **Web Worker** with progress and a cancel button; nothing fakes progress.
4. Everything stays **non-destructive**: results are stored as editable layers, never baked into the original.
5. After each step: `npm run typecheck`, `npm run lint`, `npm test`, then check it in the browser.
6. Update `PROJECT_STATUS.md` and `HANDOFF.md` with what was added.

## Sources

- SlimSAM: https://huggingface.co/Xenova/slimsam-77-uniform (Apache-2.0)
- SAM 2: https://github.com/facebookresearch/sam2 (Apache-2.0)
- MI-GAN: https://github.com/Picsart-AI-Research/MI-GAN (MIT code; LICENSE-WEIGHTS is MIT)
- LaMa: https://github.com/advimman/lama (Apache-2.0)
- Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2 and https://huggingface.co/onnx-community/depth-anything-v2-small
- Real-ESRGAN ONNX: https://huggingface.co/jonathanst29/tinier-upscale-models (BSD-3-Clause)
- BiRefNet: https://github.com/ZhengPeng7/BiRefNet and its releases page (MIT)
- GFPGAN: https://github.com/TencentARC/GFPGAN (Apache-2.0)
- Image-Adaptive 3D LUT: https://github.com/HuiZeng/Image-Adaptive-3DLUT (Apache-2.0 code)
