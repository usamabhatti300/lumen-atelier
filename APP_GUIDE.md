# Lumen Atelier: complete guide

_Written 2026-11-15. Covers everything in the app as of commit `88d76f9`._

Lumen Atelier is a photo editor that runs in the browser and installs on a phone like an app.
Your photos stay on your device: nothing is uploaded to edit, preview or export.

**Contents**

1. [Getting started](#1-getting-started)
2. [The home screen](#2-the-home-screen)
3. [The editor at a glance](#3-the-editor-at-a-glance)
4. [Looks and rolls](#4-looks-and-rolls)
5. [Match a look (from a reference photo)](#5-match-a-look-from-a-reference-photo)
6. [Editing tools](#6-editing-tools)
7. [Effects](#7-effects)
8. [Portrait retouching](#8-portrait-retouching)
9. [Masks (edit one part of the photo)](#9-masks-edit-one-part-of-the-photo)
10. [AI tools](#10-ai-tools)
11. [Compare, zoom and histogram](#11-compare-zoom-and-histogram)
12. [Undo, copy and paste, saving](#12-undo-copy-and-paste-saving)
13. [Export and Finish](#13-export-and-finish)
14. [Many photos at once](#14-many-photos-at-once)
15. [Phone app and offline use](#15-phone-app-and-offline-use)
16. [Settings](#16-settings)
17. [Keyboard shortcuts](#17-keyboard-shortcuts)
18. [Formats, limits and privacy](#18-formats-limits-and-privacy)
19. [Not built yet](#19-not-built-yet)

---

## 1. Getting started

1. Open the app (your Render address, or `npm run dev` on a computer and the address it prints).
2. On home, choose a photo, drop one on the page, or tap **try a sample** to open the built-in
   sample photo.
3. The photo opens in the editor. Tap a look, or open a tool and move a slider.
4. Tap **Export** (top right) to save the result.

Your original file is never changed. Every edit is a list of settings saved next to the photo, so
you can undo, reset or come back later.

## 2. The home screen

| What | What it does |
| --- | --- |
| Opening animation | A short logo animation when the app opens. Tap to skip. Off when the device asks for reduced motion. |
| Hero | Shows your last photo. |
| Two main actions | Open a photo, and **Match a look**. |
| Your edits | A contact sheet of the photos you have edited. Tap one to continue. Shown first once you have edits. |
| Rolls | The 12 rolls, each with a cover rendered on your last photo (or the sample). Tap one to browse its looks. |
| "How a look travels" | A short story of how Match a look works. Plays once when it scrolls into view; steps are clickable and it can be replayed. |
| Try a sample | Opens a free-to-use sample photo so you can try the app without your own picture. |
| Looks | Opens the look library page with every look, roll by roll. |
| Settings | App, offline and AI model settings. |
| Install app | Shown when the browser can install the app (see section 15). |

## 3. The editor at a glance

**On a phone**

- The photo fills the top. A dock at the bottom holds the tools: **Looks**, the main editing tools
  and **More** (a grid of the remaining tools).
- A tool opens in a sheet under the photo. Drag the sheet up for more room.
- The top bar has back (to your photos), undo, redo, a menu (⋮) with the less-used actions, and
  **Export**.

**On a computer**

- Left panel: looks.
- Centre: the photo.
- Right panel: tool tabs (Light, Colour, Detail, Effects, Crop, Portrait, Masks, Remove).
- Top bar: undo and redo, compare, zoom, copy and paste settings, show or hide adjustments, Export.
- Bottom: a filmstrip of the photos in the project.

## 4. Looks and rolls

A **look** is a complete set of adjustments you apply with one tap. Looks are grouped into
numbered **rolls**. There are **54 looks in 12 rolls**, all original.

### Where to find them

- **Phone:** open a photo → **Looks** in the dock.
- **Computer:** the left panel.
- **Library page:** **Looks** on home shows every look on your latest photo or the sample.

### Ways to browse

| Option | Shows |
| --- | --- |
| **For this photo** | Six looks picked for the open photo, from measured traits (dark, bright, muted, warm, has a face and so on). At most two from the same roll. |
| **Rolls** | One roll at a time. Scroll the row of roll names sideways. |
| **All** | Every look. |
| **Kept** | Looks you starred. |
| **Last roll** | Looks you used recently. |
| **Yours** | Looks you saved or matched from a reference. |
| Search | Searches names, descriptions and moods across the whole library ("warm", "black and white", "neon"). |

Every tile is a real preview of that look on your photo, in your photo's shape.

### Using a look

- **Tap** a look to apply it. Tap **Remove look** to take it off.
- **Amount** runs from 0 to **150%**: below 100 is a lighter version, above 100 pushes it further.
- **Swipe** left or right on the photo (touch screens) to step through the looks currently listed.
- **Keep** (star) adds a look to Kept.
- After applying a look you can still move any slider. The look stays applied with your changes.
- **Fitted to your photo:** a look adjusts its exposure, and white balance where needed, to the
  photo it lands on, so the same look works on a dark photo and a bright one. Turn this off in
  Settings ("adaptive looks").

### Your own looks

- **Save look** stores the current edit as a look under Yours.
- Rename, duplicate and delete your looks.
- Export a look as a JSON file and import it on another device.
- Export a look as a `.cube` LUT, or as an approximate Lightroom XMP preset (the dialog lists what
  cannot be carried over).

### The 12 rolls

| No. | Roll | Mood | Looks |
| --- | --- | --- | --- |
| 01 | Editor's Picks | clean, true colour, all-round | Daylight, Clean Studio, Vivid Postcard, Velvet Slide |
| 02 | Basement Summer | colour film, warm, grain | Sunday Negative, Open Shade, Green Room, Classic 35mm, Expired Summer, Retro 70s |
| 03 | Late Showing | cinema, moody, night | Teal and Orange, Warm Film Cinema, Neo-Noir Emerald, Midnight Cinema, Tungsten Hours, Silver Retain |
| 04 | Blue Hour Tapes | cool, soft, pastel | Airy Blue Film, Blue Hour, Rainy Day Blue, Powder Blue, Sherbet |
| 05 | Soft Static | matte, muted, earthy | Faded Film, Creamy Beige, Moss, Cocoa, Dark Academia |
| 06 | Golden Minutes | warm sun, golden hour | Golden Hour, Mediterranean Summer, Peach Soft Light, Autumn Mood |
| 07 | Flash at Midnight | flash, street, neon | Analog Flash, Disposable Camera, Night Neon, Sodium Streetlight, Gritty Street |
| 08 | Monochrome Diary | black and white | Classic Monochrome, Silver Gelatin, Soft Matte B&W, Newsprint, Tea Stain |
| 09 | Pocket Digicam | 2000s, CCD, flash | Pocket Flash, CCD Daylight, Mall 2004, Blue Screen |
| 10 | 2016 | warm, saturated, matte | Golden Feed, Blog Matte, Cali Haze, Pool Party |
| 11 | Camcorder | home video, tape, soft | Home Video, Tape Sunset, Night Shot |
| 12 | Lofi Dusk | purple dusk, neon, glow | Lofi Dusk, Rooftop Pink, Arcade |

## 5. Match a look (from a reference photo)

Give the app a photo whose look you like, and it builds an editable look from it.

1. Tap **Match a look** on home (or in the editor).
2. Add the **reference** photo. Screenshot borders are detected and can be trimmed; you can also
   crop the reference to the part that matters.
3. The app measures the reference: palette, tones, contrast, colour cast. Each stage shows real
   progress, and you can cancel or retry.
4. The new look is **applied to your photo automatically** so you see the result straight away.
5. The result page shows the palette, a camera-style readout of the tones, a plain description, how
   confident the match is, and any warnings.
6. Optional: adapt for brightness and colour cast when your photo is very different from the
   reference.
7. The look gets a measured name and mood, which you can change. Save it and it appears under
   Yours → Matched.

Two honest limits:

- It reproduces the **look of the finished image**. The original editing settings of someone
  else's photo cannot be recovered from a JPEG.
- Without an AI service configured it works from measurements only. With one (a local Ollama model
  or Claude on the server), a description of the style refines the result. The app asks before a
  small copy of the reference is sent anywhere; your own photo is never sent.

## 6. Editing tools

### Light

- **Auto**: one tap balances exposure, white balance, highlights, shadows and colour. It says what
  it changed, counts as one undo step, and says "Already balanced" when there is nothing to fix.
- Exposure, brightness, contrast
- Highlights, shadows, whites, blacks
- Levels
- RGB tone curves (all channels together, or red, green and blue separately)

### Colour

- Temperature and tint
- Vibrance and saturation
- Black and white
- HSL: hue, saturation and lightness for 8 colour bands
- Colour wheels: shadows, midtones, highlights and global
- Channel mixer
- `.cube` LUT: load a LUT file and set its strength

### Detail

- Texture, clarity, dehaze
- Sharpening and noise reduction
- Vignette and grain
- Lens blur (see AI tools)

### Crop and geometry

- Free crop with viewfinder corners and a ratio readout
- Ratio buttons (1:1, 4:5 and others)
- Rotate 90°, flip, straighten
- **Done** keeps the crop. **Cancel** or Escape puts back the crop the tool opened with.

Every slider can be reset on its own (double-tap or double-click), each section has its own reset,
and the whole edit can be reset.

## 7. Effects

Phone: **More → Effects**. Computer: the **Effects** tab.

The top of the panel is a grid of **one-tap tiles**. Each tile shows what the effect does to your
photo. Tap once to add it at a good strength, tap again to remove it. The sliders below set the
exact strength. At 0 an effect does nothing.

| Group | Effects |
| --- | --- |
| Light | Flash, Bloom, Halation, Light leak, Lens flare |
| Blur | Motion blur, Shutter drag, Soft focus, Dreamy blur |
| Lens & film | Colour fringe, Dust & scratches |

All effects are drawn in code (nothing is downloaded), saved with the edit and rendered at full
resolution on export.

## 8. Portrait retouching

Faces and people are found automatically on the device when a photo opens.

- Skin smoothing that keeps pores
- Spot healing: tap a blemish and the source is chosen for you
- Under-eye lightening
- Eyes and teeth brightening
- Face light
- Background blur, darken and mute

## 9. Masks (edit one part of the photo)

A mask limits adjustments to an area. Each mask is a layer.

| Mask type | How it is made |
| --- | --- |
| Brush | Paint or erase, with size, softness and flow |
| Linear gradient | Drag a line (skies, foregrounds) |
| Radial gradient | Drag an oval |
| Subject, Background, Hair, Skin, Clothes | Detected automatically |
| Select object | Click any object (see AI tools) |

Each layer has visibility, opacity, invert, ordering, and 12 local adjustments (light and colour
for that area only).

## 10. AI tools

All of these run on your device. The models are downloaded from the app's own address, checked,
and can be saved for offline use.

| Tool | Where | What it does |
| --- | --- | --- |
| **Select object** | Masks | Click an object to mask it. Shift-click adds, Alt-click subtracts (a chip replaces these keys on touch screens). |
| **Remove** | Remove tab | Paint over an unwanted object and it is filled from its surroundings. Each stroke can be hidden, deleted or undone. Best on small and medium areas. |
| **Lens blur** | Detail | Background blur based on a depth map. Tap to choose the focus point; set falloff and bokeh highlights. The detected person stays sharp. |
| **AI upscale** | Export | 2× or 4× enlargement with real progress and cancel. Slow on devices without WebGPU. |
| Face and person detection | Automatic | Powers portrait tools and the automatic masks. |

## 11. Compare, zoom and histogram

- **Split compare:** a draggable divider between before and after.
- **Side by side.**
- **Hold for before:** press and hold on the photo.
- **Show or hide adjustments:** one toggle for the whole edit.
- **Zoom:** fit, 100%, mouse wheel, pinch and double-tap; drag to pan.
- **Histogram:** live RGB histogram with a clipping readout.

## 12. Undo, copy and paste, saving

- Undo and redo, grouped by gesture (one slider drag is one step).
- **Copy settings** from one photo and **paste** onto another, choosing which groups to paste.
- **Autosave:** edits are saved as you work, and an interrupted session is recovered when you
  come back.
- Everything is stored in the browser on this device.

## 13. Export and Finish

Tap **Export** (top right). The dialog opens on **Finish**, with a preview of the result.

### Finish

| Option | What it does |
| --- | --- |
| Share format | **This photo**, or **Contact sheet** (several of your edits on one image, as numbered, dated frames; up to 12 photos; choose the sheet shape and which photos go on it). |
| **Date stamp** | Off by default. Burns an orange camera-style date into the photo: the capture date when the file has one, otherwise today. You can change the date and where it sits. |
| **Overlay** | None, **Camcorder** or **Viewfinder**. Draws the camera screen graphics over the photo. Not available for the contact sheet. |

### File

| Option | Choices |
| --- | --- |
| Format | JPEG (quality 40 to 100), PNG, WebP |
| Size | Full size, 75%, 50%, 25% |
| AI upscale | Off, 2×, 4× |

Export renders at full resolution with real progress and can be cancelled. On a phone you can
then **Share** the file or **Save to Photos**.

## 14. Many photos at once

- Open several photos into one project and move between them in the filmstrip (or the arrow keys).
- **Batch apply:** put the current settings or a look on many photos, with progress and cancel.
- **Batch export:** export every photo in one go.

## 15. Phone app and offline use

- **Install:** on Android tap **Install app** on home (or the browser menu → Install app). On
  iPhone use Safari → Share → Add to Home Screen. The app needs an `https` address to install.
- **Offline:** once installed, editing, looks, masks, matching from measurements and export work
  with no connection.
- **AI offline:** Settings → App & offline → **Save AI models offline** (about 200 MB) makes every
  AI tool work offline too.
- **Updates:** when a new version is deployed, a banner offers **Reload**.
- **Share to the app (Android):** share a photo from your gallery straight into Lumen Atelier.
- **Open with:** image files can be opened with the installed app on a computer.
- **Home-screen shortcuts:** long-press the app icon for quick actions.
- An offline indicator appears when there is no connection.

## 16. Settings

- **Adaptive looks:** fit each look to the photo (on by default).
- **App & offline:** install state, saved offline files, Save AI models offline.
- **AI models:** each model's size, licence and download state, and a check of what your device
  can run.

## 17. Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z, or Ctrl/Cmd + Y | Redo |
| Ctrl/Cmd + S | Save now |
| Ctrl/Cmd + O | Open a photo |
| Ctrl/Cmd + Shift + C | Copy settings |
| Ctrl/Cmd + Shift + V | Paste settings |
| Y | Split compare on or off |
| \ | Show or hide adjustments |
| 0 | Zoom to fit |
| 1 | Zoom to 100% |
| C | Crop tool |
| B | Brush (when a mask layer is selected) |
| J | Spot healing |
| E | Remove tool |
| [ and ] | Smaller or larger brush |
| ← and → | Previous or next photo |
| Esc | Close the current tool (cancels an unfinished crop) and turn compare off |

## 18. Formats, limits and privacy

- **Opens:** JPEG, PNG, WebP, up to 150 MB and 150 megapixels.
- **Not supported yet:** HEIC/HEIF, AVIF and camera RAW. The app says so instead of failing
  silently. iPhone photos must be shared or saved as JPEG first.
- **Saves:** JPEG, PNG, WebP in sRGB, without camera metadata.
- **Privacy:** photos are edited on the device and never uploaded. The only thing that can leave
  the device is a small copy of a *reference* photo for Match a look, only when an AI service is
  configured, and only after you agree.
- **Storage:** photos and edits live in this browser's storage. Clearing site data, or using a
  different browser or device, means they are not there. Export what you want to keep.

## 19. Not built yet

Approved and planned, in this order:

1. **Photo dump:** up to 20 photos, one look fitted to each, exported as a carousel set.
2. **Frames and borders:** film strip, instant-photo style, white border with date, 4:5 and 9:16
   with blurred fill.
3. **Scrapbook:** cut-out stickers from a selected subject, and collage layouts.
4. **Look card and look links:** a 9:16 before/after card with the look's name, and a link or QR
   code that shares a look's settings (never the photo).
5. **Camera with live looks.**

Also not in the app today: text on photos, HEIC and RAW import, accounts or cloud sync.
