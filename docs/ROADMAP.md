# Roadmap: from a great editor to an app people are hooked on

_Written 2026-11-08 after a hands-on product review at phone size (390 px). Revised the same day after
the **Afterimage** redesign (re-walked at 390 px). Owner: Usama._

**Goal:** Gen Z should be hooked on Lumen Atelier, photographers should get Lightroom-grade results,
and the app should spread on its own, while staying **free, private and on-device**.

**The gap today:** the engine is already pro-level, and the Afterimage UI gives it an identity. But
the experience is still a tool, not a habit. Nothing yet makes people come back every day, post what
they made, or bring a friend.

## Rules for whoever builds this

- Read `HANDOFF.md`, `AGENTS.md`, `PRODUCT.md` and `DESIGN.md` first. Their engineering and design rules
  bind every item here: pixel maths in both `pixel.ts` and `shaders.ts` with tests, role tokens only,
  no fake progress, and every ML model registered with its SHA-256 in `src/lib/ml/registry.ts`.
- **Privacy is the product.** No photo leaves the device. No accounts, no cloud and no analytics by
  default. Anything network-based is opt-in and labelled.
- **Ask the owner before adding any new library or model** (licence, download size). Several items
  need one; they're marked **[ask]**.
- Build one item at a time, keeping the app runnable. For each item: unit tests, an e2e test for the
  workflow, a check at 390 / 834 / 1440 px, then a commit and push to `main`. Update
  `PROJECT_STATUS.md` as you go. Report only tests you actually ran.
- Skip **body and face reshaping** (slimming, jawlines). It harms young users' self-image and the app
  stores are tightening rules on it.

### Design rules that shape these features (from DESIGN.md, "Afterimage")

- **One lilac action per screen.** New screens and sheets get one filled lilac action at most.
- **The photo leads.** While editing, nothing sits on the photo except the afterimage ghost. Frames,
  text, stickers and date stamps are the user's own content, so they belong in a separate **Finish**
  step (see 1.0) rather than in the editing view. That step needs a line added to DESIGN.md; agree the
  wording with the owner first.
- **The Three Props Rule governs the app's UI, not the user's photos.** Light leaks, dust, grain and
  similar effects (2.5) are fine as photo effects the user chooses. Never use them as UI decoration,
  and don't add a fourth prop to the chrome.
- **Orange is for date stamps only.** The export date stamp (1.0) is the one place it reaches a photo.
- **No brand trade dress.** Frames and stamps are generic: no Polaroid, Instax, Kodak or Fuji
  look-alikes, logos or film-edge text.
- **Where new tools go:** the phone dock stays Looks · Light · Match · Colour · More. New tools become
  tiles in the **More** grid (name and one-line description, back chevron in the header). Sharing
  formats go in the export sheet. Don't add dock tabs.
- **Gestures already used on the photo:** press and hold (~0.2 s) shows the original; pinch and
  double-tap zoom; the dock slides away while you touch the photo. Any new gesture (swipe, drag, tap
  to pick a colour) must work alongside all of these. Anything that needs a plain tap on the photo
  gets an explicit picker mode.

---

## Done since the first draft (don't rebuild)

- **Long-press to see the original** (was 2.3): press and hold with a finger, mouse or pen, with a
  readout ("original", "let go for {look} · {amount}").
- **Collections** (part of 2.4): the 14 categories are numbered **rolls**, plus **Kept**
  (favourites), **Last roll** (recent looks) and **Yours**. Roll covers on home use your last photo.
- **Visible previews first** (part of 1.5): only tiles on or near the screen render.
- **Match result leads with your photo** (part of 1.6), with a measured info list
  (`src/lib/analysis/readout.ts`).

## Phase 1: Foundation (fix what stops people on day one)

| # | Item | Why | Done when |
| --- | --- | --- | --- |
| 1.0 | **Export date stamp and contact-sheet share image** (already agreed with the owner as the next step) | It finishes the Afterimage story and is the first shareable artefact | An opt-in digicam date stamp burned into exports (orange, editable date, a few placements), and a "contact sheet" share image (several edits as numbered, dated frames). Both are built in the exporter and previewed in a **Finish** step before export, never on the editing view |
| 1.1 | **HEIC import** [ask: libheif-js, LGPL via WASM] | iPhones shoot HEIC; today their photos can't open | HEIC opens from the picker, drag-drop and the share target; EXIF orientation is kept; the `ACCEPT` lists are updated (GalleryScreen, EditorScreen, ReferenceStudio) |
| 1.2 | **Looks adapt to each photo** | Still seen after the redesign: roll 01's first look, Golden Portrait Negative, at 100% washes out a backlit portrait | Before a look is applied, exposure and white balance are normalised toward the look's intent (reuse the matcher in `src/lib/analysis/match.ts`). Settings has an "Adaptive looks" toggle, on by default; tests on bright, dark and backlit images |
| 1.3 | **Auto face detection** | Portrait tools still hide behind "Detect faces & subject" | Detection runs in the background when a photo opens (on-device, cancellable). Controls enable when it finishes; the manual button remains as a retry |
| 1.4 | **Sample photo for first visit** | On a first visit the home contact sheet is empty and every roll cover is a blank card | A bundled, licence-clear sample photo. Roll covers render on it until the user has a photo, and a "try a sample" frame sits in the empty contact sheet. Keep home's rule: no paragraphs or step cards |
| 1.5 | **Fast look previews** | Applying a look still causes 0.3–1 s main-thread stalls; tiles fill slowly | Render previews in an OffscreenCanvas worker from a small downscale, and cache them in IndexedDB per photo. Measure long tasks before and after |
| 1.6 | **Name the matched look** | A match is saved as "Reference look 8 Nov" | Suggest a short roll-style name and mood from the measured readout ("Moss Hour · soft, green, faded"), editable before saving. The info list stays as it is |
| 1.7 | **Open UX items from the redesign** | Left open in HANDOFF.md | Sheet detents on phones; a labelled desktop top bar (it has 14 bare icons); first check on a real Android phone and iPhone, with findings in PROJECT_STATUS.md |

## Phase 2: Obsession (the daily-use features)

| # | Item | Done when |
| --- | --- | --- |
| 2.1 | **Swipe between looks on the photo** | A horizontal swipe on the photo moves to the next or previous look in the open roll, plays the afterimage ghost, updates the look readout and gives a haptic tick on Android. It must not trigger hold-to-compare, pinch, pan when zoomed, or the dock's slide-away in a way that feels broken |
| 2.2 | **Look strength by vertical drag** | Dragging up or down on the photo changes the amount and shows the % in the look readout. Same gesture constraints as 2.1. If it clashes with sheet dragging on phones, drop it and say so |
| 2.4 | **New rolls as drops** | Rolls become data-driven: a roll can list any looks, not just one category, so new rolls ship as JSON. A "new roll" mark on home's rolls rail. Names follow the existing style ("Basement Summer", "Flash at Midnight"); the owner picks them. Ideas for moods: clean and bright, old-money soft, early-2000s digicam, neon city night, harsh flash, golden hour |
| 2.5 | **Effects tool** (in More) | Each effect is a control in the schema and both renderers, identity at default, with unit tests: **light leaks**, **halation**, **bloom**, **lens flare**, **dust and scratches**, **chromatic aberration**, **dreamy soft blur**, **flash look**. Rolls can use them. (The date stamp is 1.0, not an effect) |
| 2.6 | **Frames and borders** (Finish step) | Generic instant-photo, film-strip, contact-sheet and solid or blurred padding frames. No brand look-alikes |
| 2.7 | **Text and stickers** (Finish step) | Text layers (a few self-hosted, OFL fonts; colour; shadow) and stickers, positioned, non-destructive and exported |
| 2.8 | **Cut-out sticker** | Use subject selection to export the subject as a transparent PNG / WebP sticker |
| 2.9 | **Pick a colour to edit it** | An eyedropper button in Colour → Mix turns on a picker mode; tap the photo to pick, and the matching band's Hue, Saturation and Luminance rows appear for that colour range only |
| 2.10 | **Camera with live looks** [ask: where the entry goes] | Shoot in-app through the current look (getUserMedia plus the GL renderer); the photo saves to a project |

## Phase 3: The viral loop (made to be shared, privacy kept)

| # | Item | Done when |
| --- | --- | --- |
| 3.1 | **Look links and QR codes** | A look's settings, never the photo, encode into a compact URL and QR. Opening it previews the look and lets you save it to Yours. Validate with Zod and cap the size; works offline once opened |
| 3.2 | **Look card** | A 9:16 card in the Afterimage style (frame number, roll name, date stamp, lilac offset): before/after, palette, look name and QR. Reuse the contact-sheet renderer from 1.0. Export plus share sheet |
| 3.3 | **Before/after reveal video** | Export an MP4 / WebM (WebCodecs, GIF fallback) of a wipe from the original to the edit, at 9:16 and 4:5, made on the device. The afterimage ghost can be the transition |
| 3.4 | **Edit replay video** | The edit's history played as a short video (before, adjustments moving, after) |
| 3.5 | **Steal the look from a screenshot** | Share a screenshot from any app into Match a look directly. Auto-crop the photo out of UI chrome (status bar, captions) |
| 3.6 | **Blend references** | Two references with a mix slider ("70% this, 30% that") |
| 3.7 | **Social export pack** (covers the open "export size presets" item) | One-tap Instagram 4:5, Story 9:16 (blurred fill), carousel splitter, and per-destination presets with output sharpening |
| 3.8 | **Photo-dump mode** | Pick up to 20 photos, apply one look consistently (adapted per photo), and export as a carousel set. Builds on the Photos tab's batch actions |
| 3.9 | **Collage and layout templates** | Photo-dump grids, film strip, magazine cover |
| 3.10 | **Retention without tracking** | A daily challenge (theme or reference), an on-device streak, a monthly recap card ("your most-used looks", from Last roll history), and "your style DNA" after 20 edits that becomes a personal roll in Yours |

## Phase 4: Pro (Lightroom / Snapseed parity and beyond)

| # | Item | Notes |
| --- | --- | --- |
| 4.1 | **RAW import** [ask: LibRaw-WASM] | DNG first, then common camera RAWs; process in a worker with progress |
| 4.2 | **Range masks** | Limit any mask by brightness range or colour range (picked from the photo). The most-missed pro feature |
| 4.3 | **Perspective and upright correction** | Manual keystone (vertical and horizontal), plus auto upright from line detection. Lives in Crop |
| 4.4 | **Lens corrections** | Distortion, vignette and chromatic aberration correction (manual sliders; profiles later) |
| 4.5 | **AgX-style highlight roll-off** | An own implementation (no GPL code), as a tone-mapping option in both renderers |
| 4.6 | **Versions** | Several edits of one photo, with 2-up and 4-up compare |
| 4.7 | **Culling** | Ratings, flags and pick/reject across a shoot; filter to keepers |
| 4.8 | **Sync edits across a shoot** on phone | Surface the existing batch apply as "Sync to selected" in the Photos tab |
| 4.9 | **Checks** | Clipping warnings, a 100% loupe, focus peaking, and a soft proof for Instagram compression |
| 4.10 | **White balance picker** | An eyedropper in Light → White balance (picker mode, as in 2.9); tap a neutral grey to fix colour exactly |
| 4.11 | **Export control** | Watermark and copyright; keep or strip EXIF and GPS ("Remove location", on by default for sharing) |
| 4.12 | **Editable gradient handles** | Drag linear and radial masks after creating them (open since the original build) |

## Phase 5: On-device AI creative tools (each [ask])

Every model goes through the registry, verified downloads, progress and cancel, and the
network-isolation e2e test. Disclose sizes in Settings. Each tool is a tile in the More grid.

- **Sky replace and enhance**, with a re-lit foreground (segmentation plus colour transfer). Bundle sky plates with clear licences.
- **Relight** a face or scene using the depth model already used for lens blur.
- **Background swap or blur** for portraits (studio colours, plain backdrops).
- **Face restore** for blurry or old photos (GFPGAN; check the licences of its bundled parts).
- **Colourise** black-and-white photos.
- **AI denoise** for night shots.
- **Remove people and objects in one tap** (auto-detect plus the existing remove tool).
- **Generative expand** to fill 9:16 instead of cropping (heaviest; consider it last).
- **"For you" looks:** on-device scene detection (portrait, night, food, landscape) ranks the three best looks for each photo, shown first in the looks strip.
- **Honest one-tap Auto:** auto-fix using the matching engine, listing what it changed.

## Phase 6: Reach and trust

- **Visible privacy proof:** a "0 photos uploaded" counter in Settings, next to the existing offline pill and home's "free · private · on this device" line.
- **Languages:** Urdu, Hindi and Arabic with a full RTL layout (check Martian Mono and Geist coverage; pick a fallback for each script).
- **Accessibility:** a full audit (axe plus a screen reader), colour names for colour-blind users, one-handed layout, voice commands ("make it warmer").
- **Creator looks:** creators publish look packs as links (3.1). Optional tips or paid packs only if the owner wants revenue; the core stays free.
- **Store launch:** Android via a Trusted Web Activity in the Play Store; iPhone via a Capacitor wrapper (iOS PWAs have no share target and weak storage). Needs an HTTPS host and the owner's decision first.

## Success measures (counted on the device; nothing is sent anywhere)

- A first edit within 60 seconds of opening.
- Share and export rate per session.
- Looks saved from look links.
- Days used per week (local streak).
