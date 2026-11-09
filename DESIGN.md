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

**Home:** the wordmark (plus Looks and Settings icons), then only: "Any look. Made *yours.*", the two
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
- **Contact sheet**: up to 12 of the project's photos (tap frames to leave them out), each rendered
  with its own edit, on night black with the wordmark, "n frames · date", and per frame its number,
  look name and mm·dd date; rows shrink to their frames and the grid is centred. 4:5 (2160 × 2700) or
  9:16 (2160 × 3840). No sprocket holes, film-edge text or brand look-alikes.

## Looks and rolls

The 14 preset categories are presented as numbered **rolls** (`src/lib/presets/rolls.ts`, a display
layer only; presets keep their category ids): 01 Editor's Picks, 02 Late Showing, 03 Blue Hour Tapes,
04 Basement Summer, 05 Soft Static, 06 Close Up, 07 Something Borrowed, 08 Front Row, 09 Golden
Minutes, 10 Postcards, 11 Moss & Clay, 12 Flash at Midnight, 13 Monochrome Diary, 14 Feed Ready; plus
**Yours** and **Matched**. Each has a two-word mood that also feeds search.

The browser has one switch: **Rolls · Kept · Last roll · Yours** (Kept = favourites; Last roll = the
last 12 looks applied, newest first; Yours = looks you saved or matched). Under Rolls, a slim mono row
of the numbered rolls (selected: ivory with a lilac underline) and "all"; coming back to Rolls reopens
the roll you were on. Grids show the open roll's mood under it; the phone strip doesn't (fixed height).
On phones the strip's frames have no captions (the chosen look's name is in the amount row), and the
amount row appears only while a look is on (it springs open and folds away; no hint line). Home shows one cover per
roll, rendered with its first look on your last photo. Applying a look to several photos (Photos tab)
opens the same grid in a dialog instead of a dropdown.

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
