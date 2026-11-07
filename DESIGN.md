---
name: Lumen Atelier
description: A free, private, on-device photo editor; a dark instrument where the only light is your photo and the look you give it.
colors:
  well: "#08080a"
  ground: "#0e0e10"
  ground-2: "#121215"
  raised: "#18181c"
  raised-2: "#1f1f24"
  control: "#26262c"
  control-2: "#303037"
  line-soft: "#1e1e23"
  line: "#2b2b32"
  line-strong: "#4a4a53"
  fg: "#f5f5f2"
  fg-2: "#d2d2cd"
  fg-3: "#a5a5a0"
  fg-4: "#8a8a85"
  lumen-lime: "#d4ff3f"
  lumen-lime-hi: "#e2ff7a"
  lumen-lime-lo: "#bfee1f"
  on-lime: "#0d1003"
  spec-1-rose: "#ff5c7a"
  spec-2-amber: "#ffb547"
  spec-3-lime: "#d4ff3f"
  spec-4-cyan: "#3fe0ff"
  spec-5-violet: "#8f7dff"
  stage: "#09090a"
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
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontStyle: italic
    fontWeight: 400
    note: "one emphasised word in a headline, never UI"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label-caps:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.08em"
    textTransform: uppercase
  readout:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontFeature: "tnum"
rounded:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "28px"
  full: "999px"
spacing:
  gutter-phone: "16px"
  gutter-desktop: "32px"
  bar: "56px"
  dock: "68px"
components:
  button-accent:
    backgroundColor: "{colors.lumen-lime}"
    textColor: "{colors.on-lime}"
    rounded: "{rounded.full}"
    height: "40px (48px lg)"
    hover: "lime-hi + 28px lime glow"
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.ground}"
    rounded: "{rounded.full}"
  button-secondary:
    backgroundColor: "{colors.raised-2}"
    border: "1px {colors.line}"
    rounded: "{rounded.full}"
  chip:
    backgroundColor: "{colors.control}"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.full}"
    height: "32px (36px touch)"
  chip-selected:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.ground}"
  look-tile:
    backgroundColor: "{colors.raised-2}"
    rounded: "{rounded.md} (lg in the library)"
    selected: "1.5px lime ring + lime glow + lime check"
  dock:
    surface: "surface-float (rgb(24 24 28 / 0.86), blur 18px)"
    rounded: "26px"
    height: "{spacing.dock}"
---

# Design System: Lumen Atelier

## Overview

**Creative North Star: "Afterglow".** Lumen means light. The interface is a dark, quiet instrument;
the only light in it is your photo and what you are doing to it. Neutral graphite chrome keeps colour
judgement honest; a single electric-lime **lumen** marks the one thing you are doing (the main action,
the value you changed, the look you chose); and the **prism** (light split into rose, amber, lime, cyan,
violet) appears only at signature moments: a look loading, an analysis running, the brand mark.

Why this direction (2026-11-08 review): the previous "Film Stock Box" world (yellow carton bar, paper
chrome, condensed caps) read as vintage packaging, sat close to a film brand's trade dress, and put bright
paper next to the photo. The category's best apps (Darkroom, Lightroom Mobile, VSCO) and the Gen Z apps the
owner benchmarks (Arc, Linear, BeReal, Retro) are dark, tactile and photo-led, with one confident accent and
real motion. Afterglow takes that, with its own signature: lime light and the prism.

**Key characteristics:**
- Dark graphite chrome; the photo stage is a touch deeper (`.theme-frame`) so the photo reads as lit.
- Soft, generous shapes: pills for every action and chip, 16–28px cards and sheets.
- Geist for the interface, Geist Mono for numbers and readouts, Instrument Serif italic as the voice on one
  word per headline ("Made *yours.*", "Start from a *look*").
- One lime action per screen; lime also marks changed values, the chosen look and active tools.
- Motion with springs: things settle, glow and sweep rather than slide flatly.

## Colors

### Lumen (accent)
- **Lumen Lime** `#d4ff3f`: the one main action per screen (Match a look; Export in the export sheet),
  the chosen look's ring and check, changed slider values and fills, active tool icons, the Match look lens
  in the phone dock. Text on lime is **On-lime** `#0d1003`. Lime is readable as text on the dark ground
  (16:1), so `accent-fg` is the same lime.
- Lime glows: `shadow-glow` (1.5px ring + 28px bloom) on chosen looks and the active filmstrip frame;
  a soft bloom on the accent button's hover. Nothing else glows.

### Prism (signature only)
`spec-1` rose, `spec-2` amber, `spec-3` lime, `spec-4` cyan, `spec-5` violet. Used for: the brand mark's
ring, the "Match a look" card edge on desktop, the look readout's dot, the lens halo in the dock, the
analysis scan and indeterminate progress, the lumen sweep. Never as a background for text, never for state.

### Neutrals
- **Ground** `#0e0e10` (page) < **Raised** `#18181c` (cards, sheets, rails) < **Raised 2** `#1f1f24`
  (inner cards, tiles) < **Control** `#26262c` (chips, icon-button hover) < **Control 2** `#303037`.
  **Well** `#08080a` for inputs and the histogram; **Stage** `#09090a` around the photo.
- Lines: `line-soft` `#1e1e23` (section dividers), `line` `#2b2b32` (borders), `line-strong` `#4a4a53`.
- Text: `fg` `#f5f5f2`, `fg-2` `#d2d2cd`, `fg-3` `#a5a5a0` (7.9:1), `fg-4` `#8a8a85` (5.6:1 on ground,
  4.9:1 on raised-2). All text roles pass AA on every surface they're used on.
- **Danger** `#ff6f63` (errors, destructive) and **Success** `#52e394` (saved) only.

### Category tints
`src/lib/presets/codes.ts` gives each preset category a three-letter code (SIG, CIN, PBL, FLM, MAT, POR, WED,
LUX, GLD, TRV, ERT, STR, B/W, SOC; OWN and REF) and one tint, used only as a small dot or a faint wash on
category tiles. Looks are identified by their real preview, not by colour.

### Named rules
**The Scoped Theme Rule.** Components use role tokens (`ground`, `raised`, `fg`, `accent`…), never raw
values. `.theme-frame` deepens the ground for the photo stage.

**The One Lumen Rule.** One lime action per screen. Everything else is white (primary), raised (secondary)
or ghost.

**The Photo Leads Rule.** On editing screens nothing is brighter or more saturated than the photo: no
coloured panels, no gradients behind it. The prism appears at the edges, briefly.

## Typography

- **Display** (Geist 640, tight −0.04em, 0.96): screen titles and the home headline
  (`clamp(2.75rem, 12vw, 5.5rem)`), section titles 1.75–2.5rem, sheet titles 19px, dialog titles 23px.
- **Voice** (Instrument Serif italic): exactly one word in a headline, often in lime. Never in controls.
- **Body** (Geist 400, 15px, 1.6): descriptions and help; 13px for secondary help in panels.
- **Label caps** (Geist Mono 500, 11px, 0.08em, uppercase): section heads in rails ("WHITE BALANCE"),
  eyebrows over titles ("PREVIEWED ON YOUR LAST PHOTO"), catalogue codes on look tiles ("SIG 26").
- **Readout** (Geist Mono, tabular): slider values, percentages, pixel sizes, histogram footer.

Self-hosted via Fontsource (OFL): `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`,
`@fontsource/instrument-serif` (latin italic only).

## Layout

Phone first. Pages use a 16px gutter (32px from `sm`), max width 1280px, a 56px sticky blurred app bar
(`AppBar`) with a round back button and the wordmark.

**Editor, phone/tablet (<1024px):** top bar (round back, import, undo/redo, compare, ⋮, white Export
pill) → the photo stage → the look readout (pill: prism dot, look name, lime amount) → a raised sheet
that docks under the photo when a tool is open (rounded top, grab handle, display title, round close) →
the floating **dock** (Looks, Light, *Match look* lens, Colour, More). The active dock tab gets a soft
white pill (shared-layout spring) and a lime icon; Match look is a lime lens with a prism halo, never a tab.

**Editor, desktop (≥1024px):** 52px top bar (mark, project name, save state; the tool cluster in a raised
pill; Save; Export) → left rail 284px (prism-edged *Match a look* card, Looks/Photos, applied-look card,
look grid) | stage | right rail 320px (histogram in a well, seven tool tabs in a raised segmented strip
with a sliding pill, sections) → filmstrip.

## Elevation & depth

Surfaces step up in lightness (ground → raised → raised-2 → control), not in shadow. Shadows are for things
that float: `shadow-float` (sheets, dialogs, menus, dock, toasts) and `shadow-lift`. Floating chrome over
the stage uses `.surface-float` (86% raised + 18px backdrop blur + 7% white hairline).

## Shapes

Pills (`rounded-full`) for every button, chip, segmented control, toggle and the look readout. Cards 16px
(`rounded-md`) to 22px (`rounded-lg`); sheets and dialogs 28px (`rounded-xl`, top corners only on phone
sheets). Look tiles 16px in rails, 22px in the library. Inputs 10px; search fields are pills.

## Components

- **Buttons** (`Button`): accent (lime), primary (white), secondary (raised + line), ghost, danger
  (tinted), accent-outline. Sizes sm 32 / md 40 / lg 48 (touch +4–8px). Press scales to 0.97.
- **Icon buttons**: 36px round (40px touch); active is `control-2` with a lime icon; tooltips are raised
  pills that scale in after 500ms (not rendered on touch screens).
- **Look tile** (`PresetBrowser`): the real preview fills the tile (fades and settles in from 1.06×; a
  shimmer skeleton while it renders), a bottom scrim with the name in white, the catalogue code in mono at
  the top left. Chosen: lime ring + glow + a lime check that spins in. Favourite / more actions are round
  blurred buttons (always visible on touch, on hover with a mouse).
- **Slider**: 3px graphite track, lime fill from the default with a soft glow, a white thumb that grows on
  hover and turns lime with a bloom while dragged; mono value turns lime when changed. The phone "one
  slider at a time" view adds a fading tick ruler and a round reset.
- **Section**: label-caps head with a glowing lime dot when modified; round reset that spins on press.
- **Dialog**: a bottom sheet on phones, a centred 28px card on larger screens; spring in; blurred scrim.
- **Toasts**: `surface-float` pills that spring up.
- **Masks**: with no masks, the ways to make one are shown as tiles (Select object first, lime).

## Motion

Durations: instant 80ms (press), fast 140ms (hover), base 220ms (panels), slow 420ms (reveals).
Easing `cubic-bezier(0.22, 1, 0.36, 1)`; springs (`stiffness ~420–520, damping ~22–40`) for things that
settle: dock pill, tab pill, segmented thumb, dialogs, toasts, the chosen look's check.

Signature moments:
- **Loading a look**: the tile's lime check spins in, a soft band of light (**lumen sweep**, 900ms,
  screen blend) passes once across the photo, and the look readout rises in sharp (`readout-in`).
- **Opening a photo**: the photo develops in (fade + 0.97→1 scale, 700ms).
- **Home**: a GSAP timeline stages hero → stage → rail once; the empty stage's prism ring turns slowly.
- **Screens** arrive with `screen-enter` (fade + 10px rise).

All of it is skipped with `prefers-reduced-motion` or the in-app *Animations: reduced* setting (the sweep
is removed entirely, other animations collapse to 1ms).

## Do's and don'ts

**Do**
- Put the photo first; let the chrome recede into graphite.
- Use one lime action per screen and lime for "this is what changed".
- Use the prism only at the signature moments listed above.
- Use real previews for looks; show a shimmer while they render; never fake progress.
- Keep touch targets ≥44px on coarse pointers.

**Don't**
- Don't add coloured panels, gradients or glows behind the photo.
- Don't use lime for decoration or more than one lime button per screen.
- Don't use the serif for UI text or more than one word per headline.
- Don't use emoji or Unicode glyphs as icons; use Lucide.
- Don't imitate other apps' or film brands' trade dress.
