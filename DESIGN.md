---
name: Lumen Atelier
description: A free, private, on-device photo editor; the early digicam and the contact sheet, seen from now. Night-black chrome, ivory type, one lilac accent, and an afterimage.
colors:
  well: "#08070a"
  ground: "#0d0c10"
  ground-2: "#111015"
  raised: "#17151c"
  raised-2: "#201e27"
  control: "#29262f"
  control-2: "#332f3a"
  line-soft: "#1f1d25"
  line: "#2f2c38"
  line-strong: "#4c4857"
  fg: "#f0ebe1"
  fg-2: "#cfcad6"
  fg-3: "#a6a1af"
  fg-4: "#928d9d"
  lilac: "#c8b8ff"
  lilac-hi: "#d6caff"
  lilac-lo: "#b6a3f5"
  on-lilac: "#0d0c10"
  stamp: "#f2994a"
  stage: "#09080b"
  danger: "#ff6f63"
  success: "#52e394"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 12vw, 5.5rem)"
    fontWeight: 640
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  voice:
    note: "one word per headline carries the afterimage (.voice: a hard lilac text offset), usually in lilac. Never UI."
  wordmark:
    fontFamily: "Martian Mono Variable"
    fontStretch: "100%"
    fontWeight: 400
    letterSpacing: "-0.05em"
    note: "lowercase 'lumen' with a 0.07em/0.05em lilac offset; 'atelier' small in mono beside it"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Martian Mono Variable, ui-monospace, monospace"
    fontSize: "11px"
    fontStretch: "87.5%"
    textTransform: lowercase
    note: ".label-caps: section heads, roll titles, frame numbers, on-photo readouts"
  readout:
    fontFamily: "Martian Mono Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontStretch: "87.5%"
    fontFeature: "tnum"
rounded:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "28px"
  full: "999px"
shadows:
  offset: "3px 3px 0 rgb(200 184 255 / 0.3)"
  offset-sm: "2px 2px 0 rgb(200 184 255 / 0.32)"
  selected: "0 0 0 1.5px lilac, 4px 4px 0 1.5px rgb(200 184 255 / 0.24)"
spacing:
  gutter-phone: "16px"
  gutter-desktop: "32px"
  bar: "56px"
  dock: "68px"
components:
  button-accent:
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.on-lilac}"
    rounded: "{rounded.full}"
    shadow: "{shadows.offset} (tucks in while pressed)"
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.ground}"
    rounded: "{rounded.full}"
  button-secondary:
    backgroundColor: "{colors.raised-2}"
    border: "1px {colors.line}"
    rounded: "{rounded.full}"
  chip-selected:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.ground}"
  look-tile:
    selected: "{shadows.selected} + lilac check + orange date stamp"
---

# Design System: Lumen Atelier

## Overview

**Creative North Star: "Afterimage".** The early-2000s digicam and the contact sheet, seen from 2026.
Night-black chrome with a faint violet lean, ivory type, one muted-bright **lilac** accent, and one
signature idea: the **afterimage**, a hard, unblurred lilac offset like a double exposure or a screen
slightly out of register. Analog details are allowed only in three fixed places (see the Three Props
Rule), so the product reads as a modern editor with a memory, not as vintage packaging.

Why this direction (2026-11-08, chosen by the owner from three explored directions, then refined):
the brief bans neon lime, rainbow gradients, champagne gold, glassmorphism and glows, which retired
Afterglow's lime and prism. Afterimage keeps what worked (dark, photo-led, one accent, real motion)
and gives the brand an ownable, Gen Z-native signature. Exploration pages: see HANDOFF.md.

**Key characteristics:**
- Night-black chrome; the photo stage (`.theme-frame`) is a touch deeper and neutral.
- Pills for actions and chips; 16–28px cards and sheets.
- Geist for everything you read or tap; Martian Mono for the wordmark, short labels, frame numbers and
  readouts (at 87.5% width in the UI so it fits).
- One lilac action per screen, with its offset; lilac also marks the chosen look and changed values.
- No glow, gradient or blur anywhere. Depth comes from surface steps and the hard offset.

## Colors

### Lilac (accent)
- **Lilac** `#c8b8ff` (10.9:1 on ground; on-lilac text `#0d0c10` on it 10.9:1, so one value works as
  fill and as text). Used for: the one main action per screen (Match a look; Export in the export
  sheet), the chosen look's edge, check and offset, changed slider values and fills, the active tool's
  icon, the Match lens in the phone dock, the crop's viewfinder corners, the voice word.
  **Not** for: view toggles (ivory), secondary text actions (fg-2), warnings (fg-3), links.

### Stamp
- **Stamp** `#f2994a`: the digicam date stamp on the chosen look (`'26 11 08`). Nothing else.

### Neutrals
- **Ground** `#0d0c10` < **Raised** `#17151c` < **Raised 2** `#201e27` < **Control** `#29262f` <
  **Control 2** `#332f3a`. **Well** `#08070a` for inputs and the histogram; **Stage** `#09080b`.
- Lines: `line-soft` `#1f1d25`, `line` `#2f2c38`, `line-strong` `#4c4857`.
- Text: `fg` `#f0ebe1` (ivory), `fg-2` `#cfcad6`, `fg-3` `#a6a1af` (7.7:1), `fg-4` `#928d9d` (6.0:1 on
  ground, 4.6:1 on control). All text roles pass AA on every surface they're used on.
- **Danger** `#ff6f63` (errors) and **Success** `#52e394` (saved) only.
- The old prism tokens (`spec-1..5`) still exist but hold lilac/ivory tones, so nothing left over can
  render as a rainbow. Category tints are lilac (ivory for black & white): looks are told apart by
  their real previews.

### Named rules
**The Scoped Theme Rule.** Components use role tokens (`ground`, `raised`, `fg`, `accent`…), never
raw values. `.theme-frame` deepens the ground for the photo stage.

**The One Lilac Rule.** One filled lilac action per screen. Everything else is ivory (primary),
raised (secondary) or ghost.

**The Photo Leads Rule.** On editing screens nothing is brighter or more saturated than the photo. No
frames, stamps or offsets on the photo while editing; the afterimage ghost is the only thing that
crosses it, for half a second when a look lands. One exception, on phones only: the look readout is a
small chip (look name · amount) in the stage's bottom-left corner while a look is on, so it never costs
the photo a row.

**The Three Props Rule.** Only three analog details exist, each with one home:
1. **Frame numbers** (`04·07`: roll 4, frame 7) on look tiles; roll numbers on roll chips and covers.
2. **The date stamp**, orange, on the chosen look and, opt-in, burned into exports (Finish).
3. **The offset**: wordmark, app icon, the voice word, the main action, the chosen look, the slider
   thumb, the match lens.
No sprocket borders on photos, scan lines, VHS noise, grain overlays, light leaks, pixel fonts or
film-brand colours in the UI. Do not add a fourth prop.

## Typography

- **Display** (Geist 640, −0.04em, 0.96): screen titles and headlines.
- **Voice** (`.voice`): one word per headline gets the lilac afterimage ("Made *yours.*", "Every
  *roll*"), usually in lilac. Never in controls.
- **Wordmark** (`.mono-display`, Martian Mono 400 at full width, −0.05em): lowercase "lumen".
- **Body** (Geist 400, 15px, 1.6); 13px for help in panels.
- **Labels** (`.label-caps`, Martian Mono 11px, 87.5% width, lowercase): section heads ("white
  balance"), roll titles ("roll 04 · basement summer · warm, faded film"), eyebrows.
- **Readouts** (`font-mono`, Martian Mono at 87.5% width, tabular): slider values, sizes, the crop
  ratio, the compare readout, the match info screen.
- Look names, sentences and buttons are always Geist: monospace is slow to read in long strings.

Self-hosted via Fontsource (OFL): `@fontsource-variable/geist`, `@fontsource-variable/martian-mono`
(`wdth.css`, both axes).

## Layout

Unchanged from the previous system (phone first; 16px gutter, 32px from `sm`; 56px app bar).

**Home (order changed 2026-11-14):** your photos come first once you have any. A first visit gets the
full introduction: headline, one paragraph, the two actions, the hero photo, the "How a look travels"
story, then the empty contact sheet and the rolls. With one or more edits: headline, the two actions,
then **your edits** straight away, then the rolls, and the story last; the paragraph is dropped, and
on phones so is the hero photo (the contact sheet already shows your photos).

The wordmark (plus Looks and Settings icons), then: "Any look. Made *yours.*", the two
actions (Match a look in lilac, Open a photo secondary) and one mono line ("free · private · on this
device"). Below: **your edits** as a contact sheet (3 columns on phones: film frames with a sprocket
edge, the cover, a frame number and an mm·dd date; the edit you were last in has the lilac edge; a ⋯
menu holds Rename and Delete; with no edits yet, "add a photo" and a **try a sample** frame showing the
bundled CC0 sample), then **rolls** (covers rendered on your last photo, or on the sample before you have one). Section heads are
lowercase mono. No paragraphs, eyebrows, step cards or drop-zone art: dropping files anywhere works.
The install suggestion is one quiet mono row.

**Editor, phone/tablet (<1024px):** top bar (plain back chevron, undo, redo, then ⋮ and an ivory
Export pill; Add photos and the split view live in ⋮) → photo stage (with the look chip in its corner) → docked sheet
→ the dock: a raised bar with plain icon + label tabs (Looks = contact-sheet icon, Light = sun, Colour =
drop, More = dots; the open one ivory, the rest fg-4, no pill) and the Match lens in the middle (a
lilac circle with the offset, two overlapping circles, no label). Sheet titles are lowercase mono
("light", "colour", "more tools"). **More** opens a 2-column grid of named tools with one-line
descriptions (Photos, Crop, Masks, Remove, Portrait, Detail, Lens blur); each tool's header has a back chevron
to the grid. On phones the looks strip shows **film frames** (sprocket edge, preview, frame number).
A fresh photo opens on the Looks sheet.

**Photo size on phones (2026-11-08, checked on the owner's phone):** the photo must stay big while a
panel is open. So: a 10px margin around the fitted photo below 700px wide (28px on desktop); the look's
name and amount float as a small chip in the stage's bottom-left corner (no row of its own); the Looks
sheet has a single header row (Rolls · Kept · Last roll · Yours, search, ×), then the roll row, the
strip, and a one-line amount row (Amount · value · save + · remove ×) that appears only while a look is
on. Photos moved to the More grid. Don't add rows to the Looks sheet.

**Editor, desktop (≥1024px):** 52px top bar (the "lu" mark, project name, tools, Save, Export) → left
rail (Match a look card whose edge turns lilac on hover, Looks/Photos, applied look, looks grid) |
stage | right rail (histogram, tool tabs, sections) → filmstrip.

## Finish

**Finish** is the step between editing and export, at the top of the export sheet (phones) and the
export dialog (desktop). The user's own additions to the photo live here and only here: the date
stamp now; frames, text and stickers later (roadmap 2.6, 2.7). They are shown on a preview of the
exported image, never on the editing view. (Agreed with the owner, 2026-11-08.)

- One lilac action: Export. A share-format switch (This photo · Contact sheet) sits beside the
  lowercase mono "finish" head when the project has two or more photos.
- The preview is drawn by the same code as the export (`src/lib/finish/`), so it matches the file.
- **Date stamp**: off by default. Orange `'26 11 08` in Martian Mono with a faint bleed, sized from the
  photo's short side; the date defaults to the capture date (EXIF), else today, and is editable; four
  corners. The only place orange reaches a photo.
- **Overlays**: one opt-in control, None (default) · Camcorder · Viewfinder, for single photos and
  batches (not the contact sheet). Camcorder: a red recording dot and REC top left, a battery top
  right, and bottom left the date (`NOV 08 2026`) with the capture time above it. Viewfinder: four
  thin corner brackets, a centre cross and the date. White Martian Mono with a soft dark edge and one
  red for the dot (`OVERLAY_COLORS`, the user's content, not interface colours); sized from the short
  side; generic shapes, no brand look-alikes. Nothing is invented: the time and the exposure readout
  (shutter, aperture, ISO) appear only when EXIF has them. One date at most: the camcorder's date
  replaces the orange stamp (its switch is disabled and says so); with the viewfinder the stamp, if
  on, is the date.
- **Contact sheet**: up to 12 of the project's photos (tap frames to leave them out), each rendered
  with its own edit, on night black with the wordmark, "n frames · date", and per frame its number,
  look name and mm·dd date; rows shrink to their frames and the grid is centred. 4:5 (2160 × 2700) or
  9:16 (2160 × 3840). No sprocket holes, film-edge text or brand look-alikes.

## Looks and rolls

**One word per thing (2026-11-14):** what a user reads is always a **look** (never "preset") in a
**roll** (never "category"), with **Kept** (favourites), **Last roll** (recent) and **Yours** (looks you
saved or matched). "Preset" survives only in code, file names and the JSON format.

The library is a curated set of **54 looks in 12 rolls** (`src/lib/presets/library.ts`,
`src/lib/presets/rolls.ts`): 01 Editor's Picks, 02 Basement Summer, 03 Late Showing, 04 Blue Hour
Tapes, 05 Soft Static, 06 Golden Minutes, 07 Flash at Midnight, 08 Monochrome Diary, and four trend
rolls added from the Gen Z research: 09 Pocket Digicam, 10 2016, 11 Camcorder, 12 Lofi Dusk; plus
**Yours** and **Matched**. A look's **Amount runs to 150%**: past 100 every value the look sets
carries on in the same direction (inside its range), so a gentle look can be pushed. Each has a short mood that also feeds search. Six rolls of the earlier 186-look library
were retired (their category ids stay valid for looks people saved under them, which show under
Yours). A look must change a photo visibly and differ visibly from every other look; the house rules
are in the header of `library.ts` and are enforced by tests.

The browser has one switch: **Rolls · Kept · Last roll · Yours**. Under Rolls, a slim mono row: in the
editor it starts with **For this photo** (six looks picked from measured traits of the open photo,
with the traits shown: "picked for this photo · hard light · muted"; see docs/AI_ARCHITECTURE.md),
then the numbered rolls (selected: ivory with a lilac underline) and "all". A fresh photo opens on For
this photo. Coming back to Rolls reopens the roll you were on, and clearing a search does too. While
searching, the line under the rolls gives the count ("3 looks for "warm""). Grids show the open roll's
mood; the phone strip doesn't (fixed height).

**Tiles follow the photo's shape** in grids (between 4:5 and 3:2, from the first preview that loads),
so a look is judged on the whole picture. Previews render at about twice their displayed size. On
phones the strip's frames are 96 px wide with the name under each.

**The phone amount row never changes height.** With no look on it shows one quiet line ("Tap a look to
try it. Hold one to see it large."); with a look on: Amount · value · keep (star) · save (+) · remove
(×). Choosing a look therefore never moves the photo. The look chip on the photo steps aside while a
tool (crop, masks, remove, heal) is working on the photo, and carries no hint paragraph.

Home shows one cover per roll, rendered with the roll's cover look on your last photo. The look
library page (`/presets`) opens on "all" and shows the looks on your latest photo (the bundled sample
before you have one). Applying a look to several photos (Photos tab) opens the same grid in a dialog.

**Adaptive fit:** a library look is fitted to the photo's exposure, and to the photo's own colour cast
only; a look's intended colour is never "corrected". The applied look says what was changed in one
short line ("Fitted to this photo: exposure +0.09").

**Auto** (Light): one button at the top of Light on desktop and in the phone's Light sheet (left of
"Reset …"). It sets ordinary sliders, which light up lilac like any other change.

## Elevation & depth

Surfaces step up in lightness. `shadow-float` / `shadow-lift` only for things that float. The lilac
offset (`shadow-offset`, `shadow-offset-sm`, `shadow-selected`) is the only coloured shadow. App bars
keep a light backdrop blur for legibility, and the phone dock is frosted glass (`.surface-glass`, the
owner's request, 2026-11-08) that floats a little over the panel above it; nothing else uses glass.

## Components

- **Buttons** (`Button`): accent (lilac + offset; the offset tucks in while pressed), primary (ivory),
  secondary, ghost, danger, accent-outline. Sizes sm 32 / md 40 / lg 48 (touch +4–8px).
- **Slider**: a continuous rail with a printed LCD tick scale above it (exact values, segment look);
  lilac fill from the default; ivory thumb with a small lilac offset, lilac while dragged. The phone's
  one-slider view keeps its larger tick ruler.
- **Look tile**: the real preview fills the tile; frame number top-left; name in Geist. Chosen:
  `shadow-selected`, a lilac check, and today's date stamp bottom-right (grids only).
- **Roll chip**: mono roll number + name; selected is ivory.
- **Crop**: lilac viewfinder brackets at the corners, ivory edge bars, and a readout with size and
  ratio ("1200 × 1500 · 4:5").
- **Compare (press and hold)**: hold the photo still for ~0.2 s (finger, mouse or pen) to see the
  original, let go to return. An "original" chip with an ivory dot, and under it "let go for
  {look} · {amount}".
- **Light on phones**: groups (Tone, Range, White balance, Colour, Texture) as chips, a dot marking a
  group with edits; the group's sliders as one-line rows (`Slider size="row"`: label · track with tick
  scale · value) and a "Reset {group}" text button. **Colour mix on phones**: the band swatches, then
  that band's Hue, Saturation and Luminance rows together. Grade and Curve unchanged.
- **Swipe between looks (touch)**: a one-finger sideways swipe on the photo (≥ 48 px, mostly
  horizontal) steps to the next (left) or previous (right) look in what the Looks browser shows,
  wrapping around, keeping the amount, with the haptic tick and the afterimage. Only at fit size and
  with no tool; a second finger makes it a pinch, and a hold that became compare never swipes.
- **Sheet detents (phones)**: the docked sheet follows a finger on its handle and settles on the nearest
  stop (closed, compact, tall at 64% of the screen); a flick goes to the next stop in its direction.
  A tap on the handle toggles compact and tall (`src/lib/sheetDetents.ts`).
- **Dock behaviour**: it slides away (spring, ~115% down and faded) while you press, drag or pinch the
  photo or drag a slider, and returns ~0.65 s after you let go. It keeps its space, so nothing moves.
- **Match result**: your photo leads; the look card adds a camera-style info list of what was measured
  (`src/lib/analysis/readout.ts`: exposure, contrast, white balance, colour, grain, vignette), using
  the mapping's own thresholds. Saving suggests a roll-style name ("Moss Hour") and a lowercase mono
  mood line ("soft, green, faded") from the same measurements; both are editable.
- **Icons**: Lucide at stroke 1.6–2, plus two of our own in `src/components/icons.tsx`: `LooksIcon`
  (two frames over a wide one) and `MatchIcon` (two overlapping circles: a double exposure). Never a
  magic wand.

## Motion

Durations: instant 80ms, fast 140ms, base 220ms, slow 420ms. Easing `cubic-bezier(0.22, 1, 0.36, 1)`;
springs for things that settle.

Signature moment, **the afterimage**: when a new look lands on the same photo, the Viewport copies the
previous image the moment the look changes (`engine.snapshot()`, a read-only copy of the last "after"
render, taken before the next frame) and, on the first frame rendered with the new look, shows it over
the photo as a ghost that drifts 10/8px and fades in 520ms (`.afterimage-ghost`) while the photo
settles (0.99→1). `.afterimage-flash` (a lilac frame edge catching up from its offset) marks results
in the reference studio. Both are removed with `prefers-reduced-motion` or the in-app reduced setting.

Layout stability is part of motion: nothing the user taps may shift the photo.

## Do's and don'ts

**Do**
- Put the photo first; keep the chrome night-black and quiet.
- Use one filled lilac action per screen.
- Keep the offset hard-edged (no blur), 2–4px, about 30% lilac.
- Use Geist for names and sentences, Martian Mono for short labels and numbers.
- Keep touch targets ≥44px on coarse pointers.

**Don't**
- Don't add glows, gradients, blur or glass (the phone dock and app bars are the only exceptions).
- Don't add a fourth analog prop, or put props on the photo.
- Don't use orange for anything but date stamps.
- Don't use emoji or Unicode glyphs as icons; use Lucide.
- Don't imitate a specific camera's, film brand's or other app's trade dress.


## Lit: depth and motion (2026-11-14, owner decision)

The owner asked for a more modern, futuristic feel: glass, motion and depth. "Lit" sits on top of
Afterimage; the palette, type, wordmark and analog props are unchanged. It replaces the earlier
"no glows, gradients or glass" rule.

- **Ambient light** (`components/fx/Ambient.tsx`): a heavily blurred, slowly drifting copy of the
  current photo behind the chrome, with film grain. The editor uses the active photo's thumbnail.
  It never sits over the photo. **Home does not use it** (see "Home is a darkroom" below).
- **Glass** (`glass-pane` for chrome, `glass-card` for cards inside it): top bars, side panels,
  sheets, filmstrip, dock and tab bars. The photo stage (`stage-lit`) stays near-neutral black at
  the centre, so colour judgement on the photo stays honest; the light only reaches its rim.
- **Hero** (`components/fx/ParticlePhoto.tsx`, three.js, lazy-loaded): your last photo (or the
  sample) as particles that assemble on arrival; looks wash across it as a wave with a lilac front.
  The pointer pushes particles aside and tilts the plate; a click scatters them. The looks are
  shader approximations for the demonstration (`heroLooks.ts`); the app's edits always use the engine.
- **Rolls ring** (`components/fx/RingCarousel.tsx`): rolls on a turning 3D ring with momentum drag,
  snapping, click-to-focus, arrow keys and Enter.
- **Feedback**: cards tilt toward the pointer with a following light (`useTilt`), the main action is
  magnetic with a periodic sheen, slider readouts count to new values and fills glide when a look
  lands, and screens hand over with a view transition.
- **Liquid glass** (`components/fx/LiquidGlass.tsx`, `liquid` / `liquid-bar` utilities): glass that
  bends what is behind it. On Chromium an SVG displacement filter runs as the backdrop-filter, so
  bars, the phone dock, the toolbar pill and secondary buttons refract the page under them; a
  specular highlight follows the pointer. Other browsers get the frosted version.
- **Kinetic type** (`DecodeText`): headlines lock on letter by letter through flickering glyphs, on
  load or when scrolled into view.
- **Afterimage cursor** (`AfterimageCursor`, home, looks and settings only): an ivory dot, a ring on
  a spring with a late lilac copy at a hard offset, a short trail of lilac pixels, and labels
  (Drag, Open, Turn, Scatter) from `data-cursor`. Text fields and the editor keep system cursors.
- **Home is a darkroom** (owner, 2026-11-14): the home screen has no ambient colour wash. The top of
  the page is black with a little grain (`.home-void`), so the hero photo is the only colour.
- **Story** (`features/home/MatchStory.tsx`): tells "Match a look". It plays by itself once when it
  comes into view (it used to pin and follow the scroll, which the owner found confusing); step
  titles jump to a step and "replay" runs it again. What it shows: a reference is scanned, its palette breaks into particles that fly onto your photo,
  the look washes across it and an editable look card rises. Illustration only (a graded crop of
  the sample photo and descriptive readings).
- **Look dissolve: removed on 2026-11-15** (the owner: the particle look on a look change "doesn't
  look good there"). A look change now uses only the quick afterimage ghost fade described under
  Motion. Don't bring particles back to the editing view.
- **Opening animation** (`components/fx/Intro.tsx`): continues from the phone's splash (the icon on
  the night ground). "lu" locks on through flickering glyphs, a shutter flash fires and the lilac
  copy slides out to its hard offset, the mark spells out "lumen" with "atelier" under it, then it
  lifts away over the app, which loads beneath. About 2.1 s on the first ever open, about 1 s on
  later opens; a tap skips it. Not shown with reduced motion.
- **App icon** (`scripts/generate-icons.mjs` → `public/icons/lumen-*`): the same "lu" mark with its
  lilac offset, lit: lilac light low right, warm light high left, a glass rim on the rounded tile.
  The files were renamed from `icon-*` so installed apps fetch the new icon; rename again if the
  mark changes.
- **Reduced motion** (system or in-app): the hero shows the plain photo, the ring does not turn by
  itself or spring, the light does not drift, cards stay flat, no sheen, no view-transition
  movement, no decoding, no custom cursor, no dissolve, no opening animation, and the story is a still picture.

## UX pass (2026-11-14)

- **Phone looks strip**: 84 px frames with the look's name under each (frame number on the
  preview). Press and hold a frame to see the look large, with its description, without applying
  it (`LookPeek`); letting go closes it.
- **First looks of a visit**: a short hint under the look chip says what to do next (drag Amount)
  and, when the look was fitted to the photo, what was changed. A "fitted" mark stays on the chip.
- **Fitted note**: says the change is relative to the look as made and that the sliders already
  include it, so it never seems to contradict them.
- **Desktop tool bar**: named groups (Photos, Edit, View, Panels) with captions from 1280 px;
  "Add" and "Compare" carry words, the rest have tooltips.
- **Adjustment tabs**: two rows of four at 12 px, everyday tools first (Light, Colour, Crop,
  Effects), then Detail, Masks, Portrait, Remove.
- **Histogram**: shows only clipping, and only when more than 0.5% of the photo is pure black or
  white. The preview size is a tooltip.
- **Type floor**: no interface text below 11 px (the wordmark's "atelier" and zone numbers aside).
- **Roll tabs**: the open roll scrolls fully into view; both edges fade.
- **Home, larger screens**: the empty part of "Your edits" explains dropping photos in.
- **Performance**: the editor's ambient light holds still and follows the photo, not each edit
  (its glass panels would otherwise re-blur every frame).

## Audit pass (2026-11-14, later)

From `PRODUCT_AUDIT_AND_IMPROVEMENT_PLAN.md`. These refine the rules above.

- **Neutral beside the photo.** In the editor the ambient light is faint and unsaturated
  (`.ambient-quiet`, opacity 0.16, aurora 0.08): bars and rails next to a photo being colour-judged
  read as night-black, not as a tint of the photo. Home and the other screens are unchanged.
- **One lilac action per screen** is enforced again: home's story button is ivory (Match a look in
  the hero is the lilac one).
- **Crop** has Cancel beside Done, and Escape cancels: both restore the crop, rotation and flips the
  tool opened with.
- **The dock's More** returns to the grid of tools from inside any of them; Photos has the same back
  chevron as the other tools; the tool chips follow the grid's order.
- **Touch targets**: the collection switch, roll tabs, search and the amount row's buttons are 44 px on
  coarse pointers.
- **Compare readout**: "let go for {look} · {amount}%" sits on a dark chip like "original".
- **Export preview** waits for the rendered pixels (it was drawn before they arrived, and came out black).
- **Motion**: home's entrance is CSS (`[data-reveal]`, staggered by `--reveal-i`); GSAP is gone. Slider
  readouts don't count up while another slider is being dragged. The hero uses about four times the
  particles, so the photo reads as a photo.
- **Phone Light groups** are Tone, Whites & blacks, White balance, Vibrance, Texture (the last two
  names replaced "Range" and a second "Colour").
- **Effects** (trend pass, 2026-11-14): the panel opens with **one-tap tiles**, each showing what the
  effect does to the open photo at its one-tap strength; a tap adds it, another takes it off (lilac
  edge and its value while on). The sliders stay below for exact strength, in three groups: Light,
  Blur (Motion blur, Shutter drag, Soft focus, Dreamy blur) and Lens & film.
- **After the second audit** (`POST_IMPLEMENTATION_AUDIT.md`): a cancelled crop rewinds, so there is
  nothing to undo back into; each phone tool opens at its own compact sheet size (a sheet pulled
  tall for one tool does not stay tall for the next); Auto reports what it changed in a toast
  ("Auto: exposure +0.08 · shadows +18"); the star is labelled Keep / Remove from Kept; the roll row
  turns with the mouse wheel; the adaptive fit never brightens a photo whose top 3% of pixels is
  already near white.
