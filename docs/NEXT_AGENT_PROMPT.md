You are continuing work on **Lumen Atelier**, a local-first premium photo editor in this folder
(React 19 + TypeScript + Vite + WebGL2, Node/TS API server, MediaPipe, IndexedDB). Your job is to add
open-source AI models by following `docs/INTEGRATION_GUIDE.md` **exactly, one step at a time**.

## 1. Read first (do not skip)

1. `HANDOFF.md`: current state, decisions, environment quirks.
2. `AGENTS.md`: architecture map and coding rules (they are mandatory).
3. `docs/INTEGRATION_GUIDE.md`: the step plan. Each step contains a prompt; treat that prompt as the
   task specification for the step.
4. `PROJECT_STATUS.md`, plus `docs/RENDERING_PIPELINE.md` and `docs/AI_ARCHITECTURE.md` when a step touches those areas.
5. `PHOTO_EDITING_STUDIO_MASTER_SPEC.md` is the product source of truth; re-check it if anything conflicts.

Then run `git log --oneline` and look for `src/lib/ml/` to find which steps are already done. Start
at the first unfinished step. Step 0 (commit) is already done: the code is on GitHub at
`origin` = https://github.com/usamabhatti300/lumen-atelier (branch `main`).

## 2. How to do each step

For Step N (in order: 1 → 2 → 3 → 4 → 5, then Step 6 only if the user agrees):

1. **Verify before coding.** Confirm the model file URL still exists, its size, and its licence at the
   source (official repo or model card). Licences must allow commercial use. If something changed, stop
   and tell the user instead of substituting a different model on your own.
2. **Inspect the model.** Before writing pre/post-processing, check the ONNX graph's real input/output
   names, shapes, dtypes and value ranges (e.g. with onnxruntime in a scratch script). Don't guess.
3. **Implement** following the step's prompt and the project rules:
   - Models run in a **Web Worker** (WebGPU first, WASM fallback) via `src/lib/ml/`, loaded lazily,
     served from our own `/models/` folder (Transformers.js `allowRemoteModels = false`) so the production
     CSP keeps working. Add downloadable models to `scripts/setup-models.mjs` (except Step 6, which is on-demand).
   - Show **real** progress (download bytes, tiles), a working **cancel**, and clear, recoverable errors.
     Never fake progress or present unfinished features as working.
   - Results are **non-destructive**: stored as editable layers/components in the edit state (Zod-validated,
     versioned), reapplied on reload, and rendered at **full resolution in export** (tiled exporter).
   - Any pixel-maths change goes in **both** `src/lib/engine/pixel.ts` and `gl/shaders.ts`, with unit tests;
     default settings must remain an identity.
   - Settings → AI models lists each model's size, licence and download state; README/PROJECT_STATUS
     get licence notes.
4. **Test.** Run `npm run typecheck`, `npm run lint` (0 errors), `npm test`, and the e2e tests the step adds
   or touches (`npx playwright test <file>`; headless WebGL is SwiftShader, so it is slow: give generous timeouts).
5. **Verify in the real app.** Run `npm run dev` (port 5173 is taken by another app on this PC, so use the
   port Vite prints) and drive it with Playwright screenshots from your scratchpad. Look at the result:
   does the feature actually improve the photo? Fix problems before moving on. Use generated images or
   `C:\Windows\Web\Wallpaper\*`; **never** read the user's Pictures folder (it holds ID documents).
6. **Record and save.** Update `PROJECT_STATUS.md` (what's done, tests actually run with results, known
   issues) and the step list in `HANDOFF.md`. Then commit with a clear message (e.g.
   `Step 2: click-to-select masks with SlimSAM`) and `git push`. Git identity for this repo is already set
   to Usama Bhatti <usamabhatti3000@gmail.com>; don't change it.
7. **Report** to the user in a few plain sentences: what they can now do, how to try it, anything that
   didn't work. Then continue with the next step.

## Privacy is non-negotiable

The owner requires that **no photo or user data ever leaves the device** through these integrations.
Follow the "Privacy and security rules" section of `docs/INTEGRATION_GUIDE.md` on every step: self-host all
model and runtime files (no Hugging Face/CDN fetches at runtime), verify SHA-256 hashes, load only
`.onnx`/`.safetensors`, keep the CSP at `connect-src 'self'`, run `npm audit`, and keep the
network-isolation e2e test passing (add it in Step 1). If any of these can't be met, stop and ask.

## 3. When to stop and ask the user

- Before Step 6 (BiRefNet is a 214 MB download).
- If a model, URL or licence differs from the guide, or a step can't meet its "Check it works" criteria.
- Before anything destructive (force push, deleting user data, removing features).

## 4. Quality bar

The user wants this to feel like a **premium editor whose results are visibly better**. Each feature must
work on real photos with natural-looking results, stay responsive (do heavy work in workers, preview at
preview resolution), and match the existing design system (`docs/DESIGN_SYSTEM.md`: amber is the only
accent, restrained motion, accessible controls). Don't report tests you didn't run, and don't claim a step
is done until its "Check it works" list passes in the browser.
