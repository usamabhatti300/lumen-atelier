# Project status: Lumen Atelier

_Last updated: 2026-11-14. Source of truth for requirements: `PHOTO_EDITING_STUDIO_MASTER_SPEC.md`._

## Summary

All eight staged phases from spec §18 have a working implementation. The signature workflow
(reference → analysis → editable preset → preview on target → refine → save → reuse) works end to
end, with or without an AI key. Items still open are listed under **Remaining work**. Nothing
there is presented as finished in the UI.

**2026-11-15 (newest): trend features, the first three of eight** (the owner asked for Gen Z trend
research, then "build the top three"; the eight picks and their order are in HANDOFF.md).

1. **Digicam kit.** A new roll, 09 Pocket Digicam (CCD Daylight, Mall 2004, Blue Screen, and Pocket
   Flash moved in from roll 07), and **overlays** in the Finish step: Camcorder (REC dot, battery,
   date, and the time only when the photo's EXIF has one) and Viewfinder (corner brackets, a centre
   cross, the date, and real EXIF exposure values when present; nothing is invented). Drawn by one
   function for preview and export (`src/lib/finish/overlay.ts`), burned in after any AI upscale,
   per photo in batch export, hidden for the contact sheet. With Camcorder on, the orange date
   stamp is off (one date at most).
2. **"Blurry on purpose" effects**, in the schema, both renderers and export tiling: Motion blur,
   Shutter drag (highlights leave one-sided light trails) and Soft focus. Formulas in
   `docs/RENDERING_PIPELINE.md`. The Effects panel now opens with **one-tap tiles** that show each
   effect on the open photo; the sliders stay below.
3. **Trend rolls and stronger looks.** Rolls 10 "2016" (Golden Feed, Blog Matte, Cali Haze, Pool
   Party), 11 Camcorder (Home Video, Tape Sunset, Night Shot) and 12 Lofi Dusk (Lofi Dusk, Rooftop
   Pink, Arcade): the library is now **54 looks in 12 rolls**. A look's **Amount runs to 150%**
   (values carry on past the look, clamped to their ranges; `MAX_LOOK_AMOUNT`).

Also from the second audit (`POST_IMPLEMENTATION_AUDIT.md`): the adaptive exposure fit no longer
brightens a photo whose top 3% of pixels is already near white (nine looks were blown out by about
+1.2 EV on the sample; now at most +0.55 there), a cancelled crop rewinds instead of adding
history, Auto reports what it changed, each phone tool opens at its own compact sheet size, and
the remaining "preset" / "favourites" wording is gone.

Tests run after the last change: typecheck clean; lint 0 errors (13 warnings). Vitest **310 passed,
1 failed, 1 skipped**: the failure is `match.test.ts` "is fast enough for the UI" (4.2–5.0 s against
a 4 s limit), which **fails the same way on the untouched previous commit** on this laptop today
(5.5 s): the machine is thermally throttled after hours of test runs; the code under it did not
change. New unit tests: 14 overlays, 10 blur effects and schema, 1 look strength, library rules
for the 54 looks. Playwright (after the final edits unless noted): `effects` (11 effects; its
timeout was raised to 12 min for software rendering), `mobile-effects`, `audit-pass` (7),
`editor` (7), `mobile-audit-pass` (3), `mobile` (4), `mobile-sheet`, `mobile-swipe`, `afterimage`
passed; `finish` (2) and `mobile-finish` passed in the overlays work (before the last library edit,
which does not touch them). Two tests were changed for reasons other than their subject: the
phone strip test uses one atomic tap (two separate touch commands arrived more than 380 ms apart
on the throttled machine, which is a press-and-hold), and it now expands Colour itself.
**Not re-run in this session after these features:** `critical-journey`, `reference-name`,
`reference-replace`, `export-rotated`, `home-sample`, `intro`, `lens-blur`, `network-isolation`,
`portrait-auto`, `preview-cache`, `remove`, `select-object`, `upscale`, `adaptive-looks`,
`mobile-home-sample`, `mobile-intro`, and `test:e2e:pwa` (they passed in the full run earlier the
same day, before the trend features). The GPU path of the blur effects was checked in headless
Chromium against the CPU path (max 1 level apart for the streak effects), not on a real GPU.
Checked by eye at 1440 px only: effect tiles, both overlays, the 13 new looks on the sample.
**Not checked:** the new features at 390 px by eye, a real phone, the overlays on a portrait photo.

**2026-11-14: full product audit and improvement pass.** Reports:
`PRODUCT_AUDIT_AND_IMPROVEMENT_PLAN.md` (three independent audits: design walk-through, technical,
and a measured review of all 186 looks) and `POST_IMPLEMENTATION_AUDIT.md` (a second, independent
audit of the result). What changed:

- **Looks**: the library is now **41 looks in 8 rolls** (was 186 in 14). Measured first: 45 of the 186
  were under 2.5 ΔE from the untouched photo and the set collapsed to about 75 distinct looks; 20
  clipped highlights, 15 crushed shadows, about 20 broke skin. 5 looks kept, 29 retuned, 7 new
  (Daylight, Open Shade, Tungsten Hours, Sherbet, Pocket Flash, Newsprint, Tea Stain); several now
  use the 2.5 effects (flash, halation, bloom, fringe, dreamy). House rules are in the header of
  `library.ts` and tested (`blend.test.ts`): every look changes a test palette by more than 2% RMS,
  no two looks render alike, none clips a bright sky, no positive Whites, vignette ≥ −22.
  Kept and Last roll carry over (`LOOK_ALIASES`, `migrateLookIds`); edits made with removed looks
  are unaffected (an applied look stores its own values); retired category ids stay valid.
- **For this photo** (`src/lib/presets/recommend.ts`): the first roll in the editor, six looks picked
  from measured traits of the photo. **Auto** in Light (`src/lib/analysis/autoEnhance.ts`). Rules
  for both in `docs/AI_ARCHITECTURE.md`. No AI, no new library.
- **Adaptive looks fixed**: white balance is fitted to the photo's own cast only (least colourful
  quarter of its pixels, caps ±18 / ±10). Before, the fit measured through the look and undid graded
  looks (Teal and Orange got temperature +15, tint +20), and a pale sky read as a cast.
- **Bugs fixed**: the export preview was black (drawn before the pixels arrived; this happened on
  every device, not only under software rendering); crop had no cancel; the dock's More was dead
  inside a tool; the look chip covered tool controls; the photo moved when a look was applied on
  phones; the star button sat over the middle of a selected tile.
- **Home**: your edits come right after the two actions once you have any; the story moves below;
  GSAP removed (CSS entrance); hero uses about four times the particles.
- **Editor**: near-neutral chrome beside the photo; one vocabulary (look, roll); 44 px targets in the
  looks sheet and phone top bar; previews about twice as sharp; tiles follow the photo's shape; the
  look library page shows looks on a real photo.
- **Engineering**: 40 MB of duplicate ONNX runtime files no longer emitted; `gsap`, `@gsap/react`,
  `@react-three/fiber`, `class-variance-authority`, `jsdom` removed; root error boundary; storage
  failures no longer leave blank screens; Match a look reads the render asynchronously; engine store
  keeps size objects stable; mask keys cached; WebGL context restore (untested: no way to trigger a
  real loss here); thumbnail renderer recovers from context loss.
  Entry chunk 874 kB → 753 kB (276 → 242 kB gzip).

Tests run after the last change: typecheck clean; lint 0 errors (13 warnings, all
`react-refresh/only-export-components`); Vitest **286 passed, 1 skipped** (24 new: looks library
rules, id migration, traits and picks, Auto). Playwright: the full suite ran once (39 tests, 57 min):
35 passed, 4 failed. The four: a test using a group name this pass renamed (test updated); the star
button over a selected tile (fixed); `afterimage` and the `finish` contact-sheet colour check, which
**also fail on the previous commit** (the ghost's pixels now take longer than the test's 3 s under
software rendering since the dissolve was added, so the wait is 20 s; the sheet's corner colour
expectation predated the Lit ground colour `#0a090e`). After the fixes: `adaptive-looks`, `afterimage`,
`finish` (2), `mobile` (4), and the new `audit-pass` (7) and `mobile-audit-pass` (3) all passed.
**Not re-run after the final small edits** (cast share 0.25, top-bar button size, dead CSS removal):
the other 25 specs; `test:e2e:pwa` was not run in this pass. Production build passes.
Not checked on a real phone. Not measured: main-thread long tasks before/after on a production
build (AGENTS.md asks for this for background work; the picks take a few ms per photo and previews
are about 1.8× the pixels each but 41 instead of 186).

**2026-11-14: home hero background and the story.** Owner feedback: the hero's coloured
ambient gradient looked wrong, and the scroll-pinned "How a look travels" confused. Home now has a
black, lightly grained top (`.home-void`) instead of the ambient light; the particle photo stays (a
frame-stream replacement was tried and rejected by the owner). `MatchStory` plays by itself once
when in view, with clickable steps and a replay link; no pinning, normal page height.
Tests run: typecheck clean, lint 0 errors, Vitest 262 passed, 1 skipped; e2e `home-sample`,
`mobile-home-sample`, `intro` passed. Looked at 390, 834 and 1440 px.

**2026-11-14: new app icon and an opening animation** (owner: the phone still showed the
old logo, and wanted a logo animation on open). The icon keeps the "lu" mark and gains the Lit
light and glass rim; files renamed to `public/icons/lumen-*` (manifest and index.html updated, old
`icon-*` files removed) so installed apps and caches fetch them. Android refreshes an installed
app's icon by itself after it next opens the updated site (can take a day or more); on iPhone the
home-screen icon only changes when the app is removed and added again. `Intro.tsx` plays over the
app while it loads: full (~2.1 s) on the first open, short (~1 s) after, tap to skip, off with
reduced motion and under automation (`?intro=full|short` forces it).
Tests run: typecheck clean; lint 0 errors; Vitest 262 passed, 1 skipped (4 new, `Intro.test.ts`);
e2e `intro` (plays, spells "lumen", leaves, tap skips, off by default under automation; manifest
points at the new icon files and each returns an image) and `mobile-intro` passed. Frames checked
at 390, 834 and 1440 px. **Not checked on a real phone; nothing is deployed from here** (the phone
only shows this after the host is updated).

**2026-11-10: roadmap 2.5, the Effects tool.** A new **Effects** tile in the More grid
(phone/tablet) and an **Effects** tab on desktop, with eight one-slider effects, all 0 by default:
Light (light leak, lens flare, bloom, halation, flash) and Lens & film (dreamy blur, colour fringe,
dust & scratches). Each is a control in the schema (`effects.*`; edits saved before them load with
them off, and partial looks don't reset them), `params.ts` (`fx`, `glowActive`), both renderers
(`pixel.ts` + `cpuRender.ts`, `shaders.ts` + `renderer.ts`: a glow pass after the layers, the rest in
the output pass) and the UI (`EffectsPanel.tsx`). All procedural: no new files, libraries or models.
Export tile padding grows by the glow's reach. Looks can carry them (`effects` is already part of a
look's partial adjustments); no library looks were changed.
Tests run: typecheck clean; lint 0 errors; Vitest 258 passed, 1 skipped (10 new in `pixel.test.ts`:
identity at 0 for every effect and for a whole CPU render, each effect changes a render, direction
checks, dust density and preview/export consistency, old edits load); e2e `effects` (desktop: each
effect changes the photo, all at 0 is pixel-identical to the original, leak warms the right edge,
flash brightens the centre, section reset, undo/redo, PNG export) and `mobile-effects` (More →
Effects, slider changes the photo, no new dock tab, back chevron) passed. Checked in the running app
at 390, 834 and 1440 px (wallpaper photo and the A Coruña sample). Halation is deliberately a thin
rim: strong around lights, subtle on daylight scenes (~3 % of the sample's pixels change at 100).
Desktop tab labels went to 10 px so eight tabs fit.

**2026-11-10: roadmap 2.1, swipe between looks** (owner chose "swipe looks + effects" as the
next features). A one-finger sideways swipe on the photo steps to the next/previous look in whatever
the Looks browser shows (open roll, Kept, Last roll, Yours, after search), wrapping around, keeping
the amount; it applies like a tile tap (adaptive looks, haptic tick, afterimage, readout). Not when
zoomed (a finger pans), with a tool active, during a pinch, or after hold-to-compare engaged. Code:
`src/features/editor/lookSequence.ts`, gesture in `Viewport.tsx`.
Tests run: typecheck clean; lint 0 errors; Vitest 248 passed, 1 skipped (4 new); e2e `mobile-swipe`
(new, real touch events: swipe left/right, vertical drag ignored, hold-to-compare, pinch, pan when
zoomed) passed 3 of 3 after the test lets the page settle between swipes (software rendering keeps
the dev page busy ~3 s after a look change, which made a quick test swipe register as 3 s long);
`mobile`, `mobile-sheet`, `mobile-finish`, `editor`, `adaptive-looks`, `afterimage` passed. Checked
on a production build at 390 and 834 px: three swipes stepped 01·01 → 01·02 → 01·03. Desktop (mouse)
is unchanged; the swipe is touch only.

**2026-11-09: roadmap 1.7, phone part only (owner's choice).** Sheet detents on phones: the
docked sheet now follows your finger while you drag its handle and settles on the nearest stop
(closed, compact, tall); a flick (≥ 0.5 px/ms) goes to the next stop in its direction, however short;
a tap still toggles. Logic in `src/lib/sheetDetents.ts`. **Not done, by the owner's decision:** the
labelled desktop top bar, and the real Android/iPhone check (needs the owner's phones and an HTTPS
host). The owner then asked to move on to the more exciting Phase 2/3 features.
Tests run: typecheck clean; lint 0 errors (same 10 warnings); Vitest 244 passed, 1 skipped (4 new in
`sheetDetents.test.ts`); e2e `mobile-sheet` (new) passed 6 of 7 runs (the one failure was the first
run right after an edit, while the dev server recompiled; it checks drag-to-close by distance because
software rendering makes simulated flick speed vary 0.14–0.72 px/ms between runs, so flick speed is
covered by the unit tests), `mobile`, `mobile-finish`, `mobile-home-sample` passed. Checked at 390 and
834 px, mid-drag and settled (desktop has no sheet).

**2026-11-09: roadmap 1.6, name the matched look.** Saving a matched look now suggests a
short roll-style name and mood from the measured statistics ("Moss Hour" · "soft, green, faded")
instead of "Reference look 8 Nov"; both are editable, the mood is saved as searchable tags, and the
suggestion is taken once per reference (saving doesn't change the field). Rules and vocabulary in
`docs/AI_ARCHITECTURE.md`; they use the readout's thresholds, and the info list is unchanged. Known
limit: "muted" follows the median saturation, so a vivid subject on a large black background reads
"muted" (as the info list also says).
Tests run: typecheck clean; lint 0 errors (same 10 warnings); Vitest 240 passed, 1 skipped (6 new in
`lookName.test.ts`; the 1.5 eviction test got a 30 s timeout after timing out once in a full parallel
run, then passed twice); e2e `reference-name` (new), `critical-journey` (passed first time),
`reference-replace`, `mobile` passed. Checked at 390, 834 and 1440 px (a wallpaper reference on the
sample: "Ember Night" · "dark, muted, clean").

**2026-11-09: roadmap 1.5, fast look previews.** Measured first (production build,
SwiftShader, CPU profile): the 2–4 s stalls when a look is applied came from **synchronous GPU
readback**, not from where previews render. The histogram (320 px), the autosave thumbnail and each
preview tile read pixels with `readPixels`, and encoding JPEGs from GPU-backed 2D canvases did the
same, so the page waited for the full-size render every time. Changed: a fenced pixel-buffer read
(`readTargetAsync` / `readTargetScaledAsync` in the GL renderer) for the histogram, autosave
thumbnail, preview tiles and the afterimage snapshot; CPU-backed (`willReadFrequently`) canvases for
JPEG encoding; up to 4 previews in flight; and an IndexedDB cache of previews per photo (DB v2 store
`thumbs`, keyed by photo, tile size, look and a hash of the rendering code; capped at 2,000 with
oldest-first eviction; deleted with the photo and by "delete all data"; only for sources that never
change). **Deviation from the roadmap text:** previews still render on the main thread's GL context,
not in an OffscreenCanvas worker. A worker's GL context shares the GPU process and stalled the page
the same way in 1.3 (MediaPipe's GPU delegate), and the measured cause was the readback, which a
worker would not have removed for the histogram, autosave and snapshot reads.
Long tasks, before → after (two runs each; `perf15.mjs` method in the 1.5 notes):

| | 390 px | 1440 px |
| --- | --- | --- |
| Applying 3 looks: longest | 3.8–4.0 s → 0.54–0.67 s | 2.0–2.2 s → 0.30–1.48 s |
| Applying 3 looks: total | 7.2–7.6 s → 1.4 s | 6.8–7.4 s → 2.2–3.9 s |
| Previews filling: longest | 0.63–0.69 s → 0.71–0.93 s | 1.3–1.5 s → 0.79–0.80 s |
| First 6 previews (fresh) | 1.5–1.8 s → 1.7–1.8 s | 2.9–3.8 s → 3.5–4.3 s |
| First 6 previews (reopened) | (re-rendered) → 7–50 ms | (re-rendered) → 35–135 ms |

Still open: the remaining ~0.7–0.9 s tasks while a photo opens (decode and first render, not
previews), and one 1.48 s outlier on desktop in one apply run (SwiftShader is noisy).
Tests run: typecheck clean; lint 0 errors (same 10 warnings); Vitest 234 passed, 1 skipped (4 new in
`thumbCache.test.ts`, the first IndexedDB tests: v1 → v2 upgrade keeps data, round trip, eviction,
deletion with the photo and on clear-all); e2e `preview-cache` and `afterimage` (new; the ghost
holds the previous frame's pixels after the async read), `editor`, `home-sample`, `adaptive-looks`,
`finish`, `mobile`, `mobile-finish`, `mobile-home-sample` passed; `test:e2e:pwa` 4 passed;
`critical-journey` failed once at the reference-analysis step (the same flake seen on older commits),
then passed twice in a row (45 s, was ~2.5 min). Long tasks measured at 390 and 1440 px; previews
checked by eye at 834 px on the production build.

**2026-11-09: roadmap 1.4, sample photo for a first visit.** A CC0 photo chosen by the owner
("Perspective view of a narrow uphill street leading to A Coruña City Hall" by diaz827, WordPress.org
Photo Directory, CC0 1.0; no identifiable people) ships in `public/samples/` at 2048 px (480 KB) and
480 px (36 KB), re-encoded without EXIF; source and original SHA-256 in `src/lib/samples.ts`, credit
in README. On a first visit the roll covers render on it instead of blank cards, and the empty
contact sheet shows "add a photo" plus a **try a sample** frame that opens it as an ordinary edit.
No paragraphs or step cards were added. It is part of the offline app shell.
Tests run: typecheck clean; lint 0 errors (same 10 warnings); Vitest 230 passed, 1 skipped (3 new in
`samples.test.ts`); e2e `home-sample` + `mobile-home-sample` (new, 2), `editor` + `mobile` 11 passed,
`test:e2e:pwa` 4 passed. Checked at 390, 834 and 1440 px. Also, with the owner's OK, removed old
Playwright temp profiles (~77 MB) and `dist/` to free disk space.

**2026-11-09: roadmap 1.3, automatic face detection.** When a photo opens, faces and the
person are found in the background (on-device MediaPipe), so portrait tools are ready without the
"Detect faces & subject" step. It starts at an idle moment after the photo is on screen, can be
stopped (Stop in Portrait; a stopped photo isn't re-run automatically), stops when you leave the
photo, and Settings → "Detect faces automatically" (on by default) turns it off. The button stays as
the retry ("Detect again").
**Found while checking, and fixed:** running detection automatically froze the page for ~11 s after
opening a photo (one main-thread long task, measured at 390/834/1440 px). MediaPipe now runs in a
Web Worker (`src/lib/portrait/portrait.worker.ts`) on its CPU delegate: a GPU delegate in the worker
still stalled the page 5–6 s on phones by sharing the GPU process with the editor's WebGL. Longest
main-thread task after opening a photo, detection on → off: 390 px 0.63 s → 0.45 s, 834 px 0.59 →
0.52 s, 1440 px 1.0 → 0.58 s (was 10.7–11.1 s with detection on; SwiftShader numbers). Two
production-only issues were found by testing the built app and fixed: MediaPipe's ES-module glue
must be re-run per model (unique `?instance=n` URL; the service worker matches runtime files
ignoring the query), and Vite dev can't `import()` files in public/ (blob URL in dev only). The
worker falls back to the main thread if it can't start (then for the session). Batch export also
uses the worker.
Tests run: typecheck clean; lint 0 errors (same 10 warnings); Vitest 227 passed, 1 skipped (5 new in
`portraitState.test.ts`: auto start, setting/ready/photo-change guards, stop, quiet stop on leaving,
retry); e2e `portrait-auto` (2, new), `editor`, `mobile`, `lens-blur` passed; `test:e2e:pwa` 4
passed (production build, offline detection); `network-isolation` passed on the third run (first: ENOSPC, disk full; second: the Select object
step found the page back on its default tab after ~12 min, consistent with Vite re-bundling a
late-found dependency; `@mediapipe/tasks-vision` is now in `optimizeDeps.include` and the run took
1.7 min). With detection off the main thread, `portrait-auto` went from ~1.1 min to 13 s per test. Production
build checked by hand: detection runs in the worker with no fallback. Not re-run: `critical-journey`,
`select-object`, `remove`, `upscale`, `reference-replace`.
**The C: drive is full** (≈270 MB free of 138 GB) and one e2e run failed with ENOSPC; see HANDOFF.md.

**2026-11-08: roadmap 1.2, adaptive looks** (1.1 HEIC skipped for now by the owner).
Applying a library look first evens out the photo's exposure and white balance toward what the look
was made for (`src/lib/analysis/lookAdapt.ts`, rules in `docs/AI_ARCHITECTURE.md`): the look's intent
is measured on a neutral grey ramp, the photo's on a 2,500-pixel sample with the matcher's CPU
pipeline; exposure closes half the gap (±1.25 EV, with highlight and shadow guards so low-key photos
aren't blown out), and a capped white-balance offset is kept only if it measurably reduces the cast.
The offsets are added to the look's values (they scale with Amount and show in Light), recorded on
the applied look ("Fitted to this photo: exposure −0.40" on desktop), and can be turned off in
Settings → Adaptive looks (on by default). Matched looks are never adapted. ~30–50 ms per tap.
Found in the visual check and fixed before commit: a dark, low-key photo was pushed to the +1.25 EV
cap and blew out its highlights (now +0.83 with the ring intact).
Tests run: typecheck clean; lint 0 errors (same 10 warnings); Vitest 222 passed, 1 skipped (9 new:
bright, dark, backlit, low-key, warm and cool casts, black-and-white, offsets, speed); e2e
`adaptive-looks` (new), `editor`, `finish` passed; `mobile` + `mobile-finish` 5 passed (one earlier
`mobile` failure happened while the PC slept, 6.4 h test time; passed on re-run); `critical-journey`
is flaky here: on this code it failed once (reference analysis still running after 45 s, a step this
change doesn't touch) and passed once; it also failed once on the 1.0 commit and passed on the
pre-1.0 commit. Not re-run: `test:e2e:pwa`, AI-tool suites. Checked at 390, 834 and 1440 px.
Known limits: look previews in the strip are not adapted (they show the look as made); the phone
shows the fitted values only in Light (the desktop panel also lists them).

**2026-11-08: roadmap 1.0, export date stamp and contact sheet** (Finish step, DESIGN.md).
The export dialog opens with **finish**: a live preview drawn by the same code as the export, an
opt-in orange date stamp (capture date from EXIF, else today; editable; four corners) burned in after
any AI upscale, and a **Contact sheet** share format (up to 12 of the project's photos, each with its
own edit, numbered and dated, 4:5 or 9:16 at 2160 px wide). Code: `src/lib/finish/` (stamp, sheet
layout and drawing, palette mirrored from the CSS tokens), `exportEdited({ stamp })`,
`exportContactSheet` in `src/engine/batch.ts`, `src/features/export/Finish.tsx`. No new library.
Also committed first: the leftover phone pass (Photos in the More grid, the look chip on the stage).
Tests run: typecheck clean; lint 0 errors (same 10 warnings); Vitest 213 passed, 1 skipped (17 new in
`src/lib/finish/finish.test.ts`); e2e `finish` (2, new), `mobile-finish` (1, new), `editor`, `mobile`,
`export-rotated` 15 passed; `test:e2e:pwa` 4 passed. Not re-run: `critical-journey`,
`reference-replace`, `select-object`, `remove`, `lens-blur`, `upscale`, `network-isolation`. Checked
in the running app with Playwright at 390, 834 and 1440 px (stamp preview, contact sheet, frame
picker). Not checked on a real phone. Known limits: the contact-sheet preview uses thumbnails for
photos other than the open one (the export renders them fully); stamp settings are not remembered
between exports.

**2026-11-08 (earlier that day): "Afterimage" redesign** (owner's brief: no neon lime, rainbow gradients,
glows or glass). New identity per `DESIGN.md`: lilac `#c8b8ff` on night black, ivory text, orange date
stamps, Martian Mono + Geist, a hard lilac offset as the signature. Added (UI only, no pixel-maths change):
rolls over the 14 categories, Last roll (recent looks) and Kept, roll covers on home, frame numbers and a
date stamp on the chosen look, the afterimage transition on look change (`engine.snapshot()`), a
compare readout, viewfinder crop corners with a ratio readout, and a measured info list on the match
result. Tests run for this change: typecheck clean; lint 0 errors (the same 10 warnings as before); Vitest
196 passed, 1 skipped (3 new readout tests); e2e `editor` + `mobile` 11 passed, `critical-journey` 1
passed, `test:e2e:pwa` 4 passed. Not re-run: `reference-replace`, `select-object`, `remove`,
`lens-blur`, `upscale`, `network-isolation`, `export-rotated`. Checked by hand in the running app at
390 px and 1440 px (home, editor looks, afterimage frame, desktop rails, crop). Not checked on a real phone.

**2026-11-08 (earlier): second critic pass on Afterglow** (same brief, `docs/CRITIC_BRIEF.md`; tested in
the running app with Playwright at 390, 834 and 1440 px, real photos, frame sequences and layout-shift
/ long-task measurements). Before: 6.4/10 average (crave 6, motion 5), a fail. Verdict: the identity
(dark, photo-led, one lime accent) is right for the category and was kept; the execution failed.
Worst problems found: applying a look on a phone moved the photo (the Amount card grew the sheet; CLS
0.19); a fresh photo showed no looks (two taps to the first useful thing); the lumen sweep fired before
the new look rendered and was invisible on bright photos; the match result showed the reference and a
paragraph first and your photo below the fold, and on phones the results column overlapped the
reference; library previews were still empty after 5 s (every tile queued in list order, including
off-screen ones) and the library's app-bar buttons overflowed on phones; lime on toggles, links,
warnings and a red "Low confidence"; 36 px touch targets in the phone sheet; 10.5 px desktop tab labels;
a phone home card that repeated the Open button.
Changed: Looks sheet opens with a fresh photo; the dock is a tab bar; the phone amount row has a fixed
height (CLS 0 measured) and fills from zero; sweep + photo "landing" on the first rendered frame of a
new look; spring sheets; haptic ticks on Android (`src/lib/haptics.ts`); press and hold the photo to
see the original; match result leads with your photo and a reference inset; overlap fixed; previews
render only for on/near-screen tiles and drop queued work when they scroll away; icon-only library
actions on phones; lime limited to the main action and changed values; 44 px phone targets; 11 px tab
labels; a three-step *How it works* card on touch screens' first visit. After: 7.4/10 average (crave 7,
motion 7.5): it clears the motion and crave floors but not the 8.0 average; see the scorecard in
HANDOFF.md for what is still open.

**2026-11-08 (later): critic review and second redesign, "Afterglow"** (brief: `docs/CRITIC_BRIEF.md`).
The Film Stock Box UI scored 5.6/10 (crave 4, motion 4) and failed on identity: it read as vintage
packaging, sat close to a film brand's trade dress and put bright paper chrome next to the photo. It was
replaced, not recoloured: dark graphite chrome, one lime "lumen" accent (`#d4ff3f`), a prism spectrum only
at signature moments, Geist / Geist Mono / Instrument Serif italic, pills and 16-28px cards, springs.
Every screen was rebuilt: home (headline with a serif word, photo-led continue card, category rail with
real look renders on your last photo), editor (floating phone dock with a lime Match look lens, raised
sheets, look readout pill, photo-filled look tiles with a lime glow, prism-edged Match a look card, segmented
tool tabs, mask tools shown as tiles when there are none), match studio (step pills, prism scan while
analysing, the look as the hero, sticky action bar), export (summary card, pill controls, prism progress,
finish ring), paste, library and settings. Signature motion: the lumen sweep across the photo and the
readout rising in when a look loads, the photo developing in, a GSAP-staged home, screen enter; all
reduced-motion safe. `carton.ts`, `CartonBar`, `EdgePrint` and the Barlow fonts are gone (`codes.ts`,
`AppBar`, `LookReadout`, `Wordmark.tsx`). New mark and PWA icons. Tests run after: typecheck, lint
(0 errors), Vitest 193 passed (two `match.test.ts` timing tests failed once under heavy CPU load and passed
alone and in the next full run), e2e `editor` + `mobile` 11 passed, `test:e2e:pwa` 4 passed (production
build), `critical-journey` and `reference-replace` passed. Other AI-feature e2e specs were not re-run.
Open: real-phone check of the new UI (iOS Safari untested); shadcn/ui components still unused (no
component in this redesign needed one); React Three Fiber still installed and unused.

## Stage checklist

| Stage | Status | Notes |
| --- | --- | --- |
| 1 Foundation | Done | Vite 8 + React 19 + TS 6 (strict) + Tailwind 4, design tokens, workspace, dev runner |
| 2 Working editor | Done | Import (drag/drop, picker, multi), GPU render, basic adjustments, undo/redo, export |
| 3 Advanced colour | Done | HSL ×8, RGB curves, 3-way + global wheels, mixer, levels, versioned schema |
| 4 Preset library | Done | 54 curated looks in 12 rolls (2026-11-15; 186 in 14 before the 2026-11-14 curation), real previews, picks for the open photo, search, Kept, Last roll, Amount. History: `docs/PRESET_LIBRARY_NOTES.md` |
| 5 Reference → preset | Done | Stats worker, optional Claude interpretation, deterministic mapping, adaptation, suggestions, save |
| 6 Portrait & masks | Done | MediaPipe landmarks + segmentation, retouch tools, healing, brush/gradient/segment masks, layers |
| 7 Persistence & interop | Done | IndexedDB projects + autosave/recovery, preset JSON, `.cube` import/export, XMP export, batch apply/export |
| 8 Polish | Mostly done | Motion system, responsive layout, a11y basics, lint, CSP. See remaining work |

### AI model integrations (`docs/INTEGRATION_GUIDE.md`)

| Step | Status | Notes |
| --- | --- | --- |
| 0 Commit | Done | On GitHub (`origin/main`) |
| 1 ML runtime | Done | ONNX Runtime Web 1.30.0 + Transformers.js 4.3.1 in a Web Worker (WebGPU → multi-threaded WASM), checksum-verified same-origin model loading, Settings → AI models, network-isolation e2e test |
| 2 SlimSAM select object | Done | `docs/steps/STEP_2.md`. New `object` mask component (points stored; mask cached in IndexedDB) |
| 3 MI-GAN remove | Done | `docs/steps/STEP_3.md`. `EditState.removals` (strokes), applied to the original before adjustments; weak on very large areas |
| 4 Depth Anything V2 Small lens blur | Done | `docs/steps/STEP_4.md`. `EditState.lensBlur`; disc bokeh pass in GLSL + CPU; fp16 model on WebGPU and WASM |
| 5 Real-ESRGAN upscale | Done | `docs/steps/STEP_5.md`. Export 2×/4×, 256 px tiles with ≥32 px blended overlap, 64 MP cap |
| 6 BiRefNet (optional, 214 MB) | Needs owner's OK | Not in the registry |

### Installable app (PWA) and mobile (2026-10-11)

| Area | Status | Notes |
| --- | --- | --- |
| Manifest, icons | Done | `public/manifest.webmanifest`; any + maskable PNGs and Apple touch icon from `scripts/generate-icons.mjs`; shortcuts (Match look, Presets); Android share target; desktop file handlers |
| Service worker | Done | `src/pwa/sw-template.js` → `dist/sw.js` (`scripts/pwa-plugin.ts`, build only). App shell precached per build (47 files, 2.5 MB); `/models`, `/mediapipe`, `/ort` cached on first use (also answers MediaPipe's HEAD checks); `/api` never cached; adds COOP/COEP when a host doesn't; update waits for the user's "Reload" |
| Offline | Done | Whole editor offline after first load; Settings → App & offline → *Save AI models offline* (real byte progress, ~200 MB without WebGPU, 223 MB with); persistent-storage request |
| Install UI | Done | Install button (Chromium prompt) or iPhone/iPad instructions; offline pill; update banner |
| Mobile layout | Done | Panels dock under the photo (or beside it in phone landscape); full left panel in the Presets sheet (Photos tab, Save look, Amount); histogram; ⋮ menu below 1024 px; top bar fits 320–1023 px |
| Touch | Done | Pinch / two-finger pan / double-tap zoom; touch-mode chip for Remove (Add to last), Select object (Add / Subtract), Heal (Delete spot); larger targets via `coarse:`; hover-only controls visible on touch (`fine:`); no tooltips on touch |
| Export on phones | Done | Touch devices that can share files get *Save / Share* (system share sheet → Save to Photos) and *Download* (≤10 files) |
| Owner's phone feedback (2026-10-11) | Fixed | Presets panel too small (now a strip of large cards + expandable panel); faces not found on a full-length portrait (second detection pass on face-skin crops for small faces, plus a CPU retry when a phone GPU returns nothing); tone curve hijacked scrolling and added points (fixed for curve, wheels and sliders: scrolling never changes edits); Install button wrapping (install banner on phones). Audit with real touch input also fixed: reference studio overlap on phones, crop box not touch-locked, small icon buttons, mouse-only wording |
| Real phones | Partly verified | Only Chromium mobile emulation (Pixel 7, 320–1023 px, landscape). iOS Safari, WebGPU on phones and phone performance are untested. Install needs an HTTPS host (not chosen yet) |

### UI/UX pass (2026-11-08)

Based on a design critique plus phone-editor patterns researched on Mobbin (Halide, LinkedIn, X, CapCut, Telegram):
phone home is now an app home (two big actions *Edit photos* / *Match a look*, *Continue editing*, *Your edits*),
with the landing-page hero kept for `sm`+; the phone editor keeps the photo large (preset strip of 88 px square
thumbnails with names below and a content-sized sheet, tool sheet 40dvh with a slim histogram, no filmstrip for a
single photo, back arrow instead of the logo); bottom nav shows the active tab in amber with an indicator and
*Match look* as a filled featured action; Match look empty state has *Choose photo* and *Paste* (clipboard read)
buttons and example chips; desktop preset names wrap to two lines; jargon removed ("Session", "01A / FR",
"Projects"); `--color-faint` lightened to #8a8378 and `.edge-code` to #a8865a / 10 px for WCAG AA.
Tests: type-check clean; ESLint 0 errors (same 10 warnings); Vitest 193 passed, 1 skipped; Playwright
`editor.spec.ts` + `mobile.spec.ts` **11/11 passed** (3.5 min). `e2e/pwa.spec.ts` heading updated to "Your edits"
but not re-run. Screens reviewed at Pixel 7 and 1440×900. Not tried on a real phone.

**One slider at a time on phones (2026-11-08).** The Light and Colour sheets open in a compact, content-sized
view (`src/features/editor/panels/FocusTools.tsx`): a sideways tool row (amber dot = edited) chooses what one large
slider controls (`Slider size="lg"`: tick ruler, bigger value, Reset button). Light has 15 tools. Colour has *Mix*
(8 band swatches + Hue / Saturation / Luminance), *Grade* (zone picker + one wheel) and *Curve* (opens the full panel).
*All*, or dragging the handle, shows the full panels as before; landscape and desktop are unchanged. The last tool is
remembered while the app is open. HSL swatch helpers moved to `panels/colorBands.ts`. Tests: type-check clean; ESLint
0 errors (same 10 warnings); Vitest 193 passed, 1 skipped (on an idle machine; 8 slow maths tests timed out while
e2e ran in parallel). `mobile.spec.ts` touch test extended (one slider only, vertical swipe ignored, sideways drag
changes it, edited mark, tool switch, Reset, Mix band / mode, Grade, *All* → full panel scroll + curve checks).
Playwright `editor.spec.ts` + `mobile.spec.ts`: 9 passed, 2 failed in the full run (EXIF export download timeout,
a known flake under load; and a test bug, fixed); both **passed when re-run alone** (2.0 min).

**Phone visual redesign, "lit by your photo" (2026-11-08).** Owner feedback: the curve hid the photo and the UI
did not feel like a premium iOS app for a young audience. Phone only (desktop unchanged apart from the ivory
segmented highlight): true-black base; frosted `glass` / `glass-strong` utilities; `light-leak` gradient (drift
animation off with reduced motion); `--color-glow` (#e8b26b, amber lifted for OLED) for primary actions;
`--font-hero` = Unbounded (OFL, `@fontsource-variable/unbounded` 5.3.0) for a few big headlines. Home: the latest
edit as a large photo card (full-resolution original on phones) whose blurred colours glow behind it, "Continue
editing" glass pill, *Make it glow.*, pill buttons *Edit a photo* / *Match a look*; light-leak card before the first
edit; glass install banner. Editor: the active photo glows behind the canvas, glass top bar with round buttons,
floating glass tab-bar capsule, glass sheet (sentence-case titles, expanded height 64dvh), ivory selected chips and
segmented pills. Colour → *Curve* is now a compact curve in the one-slider view, so the photo stays visible.
Default project names are "Edit 8 Nov" (no middle dot).

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

- **PWA + mobile (2026-10-11)**: type-check clean; ESLint 0 errors (same 10 warnings); Vitest 15 files, 186
  passed, 1 skipped. New `npm run test:e2e:pwa` (production build, Pixel 7 profile): **4/4 passed**:
  Chromium reports no installability errors, manifest/icons valid, page cross-origin isolated; offline
  (network cut verified for page and service worker) gallery, editor, preset apply, export, presets and settings
  work; a multipart share-target POST opens the shared photo in a new project; after *Save AI models
  offline*, the AI runtime check and MediaPipe portrait detection run with no connection.
  `e2e/mobile.spec.ts` **3/3 passed** (docked panels, Presets sheet with Photos tab and Amount, ⋮ menu copy /
  paste / side by side, pinch zoom and double-tap fit, Remove touch modes and Done, phone landscape side
  panel, no overflow measured against the device width). Full suite (desktop + mobile): 18/20 in one
  32-minute run; both failures were in the reference studio. `reference-replace` passed on re-run alone.
  The critical journey also failed **on the untouched previous commit**: Ollama with the local model is now
  running on this PC (so the test server had AI), and the test expected copy that changed in the local-AI
  commit. Fixed by `AI_PROVIDER: 'none'` in `playwright.config.ts` plus the current message; it then
  **passed alone** (3.7 min). Manual phone-size screenshot review at 320×640, 360×740, 390×844 and
  844×390 / 915×412 landscape; it found and fixed: the top bar overflowing at 640–1023 px with touch-sized
  buttons (the page was zoomed out to 954 px), hidden tooltips widening the page, hover-only preset / project
  buttons that were invisible on touch, and the Remove brush staying on after switching to Crop.

- **Signature Pro recipes (2026-10-11)**: 75 of the 80 recipes in `docs/PHOTO_EDITOR_SIGNATURE_PRO_PRESETS.md`
  added (5 already existed), with six new categories; library **111 to 186**. Details, mapping and tuning in
  `docs/PRESET_LIBRARY_NOTES.md`. Type-check clean; ESLint 0 errors (same 10 warnings); production build
  passes. Vitest **16 files, 193 passed, 1 skipped** (an earlier run during the e2e run had the timing test
  "closed-loop matching is fast enough for the UI" fail at 5.1 s under CPU load; it passed on the idle re-run).
  Preset tests now cover all 186: counts per category, metadata, schema-exact, distinctness, intensity 0 =
  untouched, and no extra clipping for every preset added after the original 70. Playwright
  `editor.spec.ts` + `mobile.spec.ts`: **9 passed, 2 failed**; the presets test (51 Signature cards, new
  Black & White tab) and all 4 mobile tests passed. The EXIF export test failed under load and **passed
  when re-run alone**. The crop/PNG export test failed twice (no download within 60 s) and **fails the same
  way on the code without this change**, so it is a pre-existing issue to investigate. Manual check on the
  dev server (Playwright, real GPU): all 14 tabs in order with the right counts and real thumbnails; 26 new
  presets applied to 4 wallpaper photos and reviewed; no page errors. Not tested on real portraits.
- **Signature Collection (2026-10-11)**: 30 presets from `docs/PREMIUM_PRESETS.md` added unchanged, plus
  11 from `docs/PRO_PRESET_LIBRARY.md` (overlaps merged; record at the end of that doc), so the library grows from
  **70 to 111** presets. All 41 parse with `PartialAdjustmentsSchema` with no value changed. Type-check clean;
  ESLint 0 errors (same 10 warnings); Vitest **15 files, 186 passed, 1 skipped**, including a new test that
  renders a bright sky fixture with `cpuRender` and checks no Signature preset clips more pure white than the
  untouched render. Playwright `e2e/editor.spec.ts` + `e2e/mobile.spec.ts`: **8/8 passed** (3.5 min; the presets
  test now checks the default tab, 41 cards, favourites, intensity and library-wide search). Manual check on the
  dev server (Playwright, real GPU): Signature Collection is the first, selected tab in the editor and the
  preset library page; all 41 cards have real rendered thumbnails; search, favourites and Intensity work
  (50 % gives about half the change of 100 %); 23 presets applied to 4 wallpaper photos (lake, beach and
  blossom, sunset, night glow) and reviewed as contact sheets; no page errors. **Not verified:** real
  portraits (no portrait photos on this machine). The haze/matte looks (Golden Hour Glow, Moody Forest Fog,
  Soft Pastel Dream) lift a near-black night background to flat grey, which is their style but a poor fit
  for night photos.
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
- Steps 2–5 were built in parallel git worktrees by separate agents and merged on 2026-10-11; see
  `docs/steps/STEP_N.md` for each step's verified ONNX contract, design and tests. Without WebGPU the
  plain `onnxruntime-web/wasm` build is used (the WebGPU bundle's asyncify CPU path was ~5× slower).
- MediaPipe Tasks 1.1.0 sent usage telemetry to `odml.pa.googleapis.com` every 60 s (blocked by the
  production CSP, not in dev). Disabled in `src/lib/portrait/mediapipe.ts` (relies on the pinned
  version's internals; the network-isolation test waits 65 s to catch a regression).
- CPU-only (no WebGPU) inference is slow on this machine: depth 14 s – 2.5 min, Select object analysis
  8 s – minutes, AI upscale minutes for a small photo. WebGPU speed is unmeasured here.
- Remove (MI-GAN) smears on very large areas (~40% of the frame); before/after compare shows removals on
  both sides (use the eye toggle).
- WebGPU is not available in headless Chromium, so automated tests cover the WASM path only. WebGPU
  has to be confirmed in a real browser (Settings → AI models → Check AI runtime).
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
