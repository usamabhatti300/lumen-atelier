# Roadmap: from a great editor to an app people are hooked on

_Written 2026-11-08 after a hands-on product review of the app at phone size (390 px). Owner: Usama._

**Goal:** Gen Z should be hooked on Lumen Atelier, photographers should get Lightroom-grade results,
and the app should spread on its own, while staying **free, private and on-device**.

**The gap today:** the engine is already pro-level, but the experience is a tool, not a habit. Nothing
yet makes people come back every day, post what they made, or bring a friend.

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

---

## Phase 1: Foundation (fix what stops people on day one)

| # | Item | Why | Done when |
| --- | --- | --- | --- |
| 1.1 | **HEIC import** [ask: libheif-js, LGPL via WASM] | iPhones shoot HEIC; today their photos can't open | HEIC opens from the picker, drag-drop and the share target; EXIF orientation is kept; the `ACCEPT` lists are updated (GalleryScreen, EditorScreen, ReferenceStudio) |
| 1.2 | **Looks adapt to each photo** | At 100%, built-in looks can blow out or wash a photo (seen on a backlit portrait) | Before a look is applied, exposure and white balance are normalised toward the look's intent (reuse the matcher in `src/lib/analysis/match.ts`). Settings has an "Adaptive looks" toggle, on by default; tests on bright, dark and backlit images |
| 1.3 | **Auto face detection** | Portrait tools hide behind "Detect faces & subject" | Detection runs in the background when a photo opens (on-device, cancellable). Controls enable when it finishes; the manual button remains as a retry |
| 1.4 | **Demo photo for first visit** | A new user sees only empty screens | A bundled, licence-clear sample photo (or a generated scene) with "Try it on a sample" on home |
| 1.5 | **Fast look previews** | Preview tiles load slowly | Render previews from a small downscale, cache them in IndexedDB per photo, and fill the visible tiles first |
| 1.6 | **Plain-language Match result** | "Green-tinted shadows, 7 setting groups" reads like an engineer | Lead with a vibe name and one line ("Moody forest film"); the technical breakdown stays under "How it was built" |

## Phase 2: Obsession (the daily-use features)

| # | Item | Done when |
| --- | --- | --- |
| 2.1 | **Swipe between looks on the photo** | A horizontal swipe on the photo cycles looks in the current collection, with a snap, the look name, and a haptic on phones. It must not fight pinch-zoom or pan when zoomed in |
| 2.2 | **Look strength by vertical drag** | Dragging up or down on the photo changes the amount, showing the % |
| 2.3 | **Long-press to see the original** in the editor | Holding shows the unedited photo; releasing returns to the edit |
| 2.4 | **Vibe collections and drops** | Collections named by vibe ("Clean girl", "Old money", "Y2K digicam", "Tokyo night", "Film flash", "Golden hour glow"), built from the existing engine. Data-driven, so new drops ship as JSON. A "New this week" rail on home |
| 2.5 | **Gen Z effects** | New effects, each a control in the schema and both renderers: **light leaks**, **halation**, **bloom**, **lens flare**, **dust and scratches**, **chromatic aberration**, **dreamy soft blur**, **flash look**, **digicam date stamp** (editable date, styles). Identity at default; unit tests per effect |
| 2.6 | **Frames and borders** | Instant-photo, film-strip, contact-sheet and solid or blurred padding frames |
| 2.7 | **Text and stickers** | Text layers (a few self-hosted fonts, colour, shadow) and stickers, positioned and exported; non-destructive |
| 2.8 | **Cut-out sticker** | Use subject selection to export the subject as a transparent PNG / WebP sticker |
| 2.9 | **Tap a colour to edit it** | Tap the photo to pick a colour, then hue, saturation and brightness sliders for that colour range only |
| 2.10 | **Camera with live looks** | Shoot in-app through the current look (getUserMedia plus the GL renderer); the photo saves to a project |

## Phase 3: The viral loop (made to be shared, privacy kept)

| # | Item | Done when |
| --- | --- | --- |
| 3.1 | **Look links and QR codes** | A look's settings, never the photo, encode into a compact URL and QR. Opening it previews the look and lets you save it. Validate with Zod and cap the size; works offline once opened |
| 3.2 | **Look card** | Auto-made 9:16 card: before/after, palette, look name, QR. Export plus share sheet |
| 3.3 | **Before/after reveal video** | Export an MP4 / WebM (WebCodecs, GIF fallback) of a wipe from the original to the edit, at 9:16 and 4:5, made on the device |
| 3.4 | **Edit replay video** | The edit's history played as a short video (before, adjustments moving, after) |
| 3.5 | **Steal the look from a screenshot** | Share a screenshot from any app into Match a look directly. Auto-crop the photo out of UI chrome (status bar, captions) |
| 3.6 | **Blend references** | Two references with a mix slider ("70% this, 30% that") |
| 3.7 | **Social export pack** | One-tap Instagram 4:5, Story 9:16 (blurred fill), carousel splitter, and per-destination presets with output sharpening |
| 3.8 | **Photo-dump mode** | Pick up to 20 photos, apply one look consistently (adapted per photo), and export as a carousel set |
| 3.9 | **Collage and layout templates** | Photo-dump grids, film strip, magazine cover |
| 3.10 | **Retention without tracking** | A daily challenge (theme or reference), an on-device streak, a monthly recap card ("your most-used looks"), and "your style DNA" after 20 edits that becomes a personal look |

## Phase 4: Pro (Lightroom / Snapseed parity and beyond)

| # | Item | Notes |
| --- | --- | --- |
| 4.1 | **RAW import** [ask: LibRaw-WASM] | DNG first, then common camera RAWs; process in a worker with progress |
| 4.2 | **Range masks** | Limit any mask by brightness range or colour range (picked from the photo). The most-missed pro feature |
| 4.3 | **Perspective and upright correction** | Manual keystone (vertical and horizontal), plus auto upright from line detection |
| 4.4 | **Lens corrections** | Distortion, vignette and chromatic aberration correction (manual sliders; profiles later) |
| 4.5 | **AgX-style highlight roll-off** | An own implementation (no GPL code), as a tone-mapping option in both renderers |
| 4.6 | **Versions** | Several edits of one photo, with 2-up and 4-up compare |
| 4.7 | **Culling** | Ratings, flags and pick/reject across a shoot; filter to keepers |
| 4.8 | **Sync edits across a shoot** on phone | Surface the existing batch apply as "Sync to selected" |
| 4.9 | **Checks** | Clipping warnings, a 100% loupe, focus peaking, and a soft proof for Instagram compression |
| 4.10 | **White balance picker** | Tap a neutral grey to fix colour exactly |
| 4.11 | **Export control** | Watermark and copyright; keep or strip EXIF and GPS ("Remove location", on by default for sharing) |

## Phase 5: On-device AI creative tools (each [ask])

Every model goes through the registry, verified downloads, progress and cancel, and the
network-isolation e2e test. Disclose sizes in Settings.

- **Sky replace and enhance**, with a re-lit foreground (segmentation plus colour transfer). Bundle sky plates with clear licences.
- **Relight** a face or scene using the depth model already used for lens blur.
- **Background swap or blur** for portraits (studio colours, gradients).
- **Face restore** for blurry or old photos (GFPGAN; check the licences of its bundled parts).
- **Colourise** black-and-white photos.
- **AI denoise** for night shots.
- **Remove people and objects in one tap** (auto-detect plus the existing remove tool).
- **Generative expand** to fill 9:16 instead of cropping (heaviest; consider it last).
- **"For you" looks:** on-device scene detection (portrait, night, food, landscape) ranks the three best looks for each photo.
- **Honest one-tap Auto:** auto-fix using the matching engine, listing what it changed.

## Phase 6: Reach and trust

- **Visible privacy proof:** a "0 photos uploaded" counter and an offline badge.
- **Languages:** Urdu, Hindi and Arabic with a full RTL layout.
- **Accessibility:** colour names for colour-blind users, one-handed layout, voice commands ("make it warmer").
- **Creator looks:** creators publish look packs as links (3.1). Optional tips or paid packs only if the owner wants revenue; the core stays free.
- **Store launch:** Android via a Trusted Web Activity in the Play Store; iPhone via a Capacitor wrapper (iOS PWAs have no share target and weak storage). Needs an HTTPS host and the owner's decision first.

## Success measures (counted on the device; nothing is sent anywhere)

- A first edit within 60 seconds of opening.
- Share and export rate per session.
- Looks saved from look links.
- Days used per week (local streak).
