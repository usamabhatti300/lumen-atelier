---
name: Lumen Atelier
description: A free, private, on-device photo editor where every look is a box of film you load into your photo.
colors:
  carton-yellow: "#e4a11b"
  carton-yellow-hi: "#eeb53f"
  carton-yellow-lo: "#cf8d0c"
  accent-ink: "#845500"
  print-paper: "#f4f1ea"
  paper-shade: "#ece8df"
  form-white: "#fffdf9"
  sheet-white: "#fbf9f4"
  control-grey: "#e6e1d6"
  hairline: "#cdc6b8"
  hairline-soft: "#e3ded3"
  hairline-strong: "#9f978a"
  ink: "#121212"
  ink-2: "#36332e"
  ink-3: "#59544c"
  ink-4: "#6e685f"
  band-red: "#c8322b"
  band-blue: "#2f6db5"
  frame-black: "#0b0b0b"
  frame-paper: "#f4f1ea"
  frame-accent: "#f0b941"
  error-red: "#b8291f"
  saved-green: "#2b7148"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "clamp(3.25rem, 13vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 0.92
  title:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "0.01em"
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.08em"
  edge-print:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.16em"
    fontFeature: "tnum"
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
spacing:
  gutter-phone: "16px"
  gutter-desktop: "32px"
  bar: "56px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.print-paper}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-accent:
    backgroundColor: "{colors.carton-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0 16px"
  button-accent-hover:
    backgroundColor: "{colors.carton-yellow-hi}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "40px"
  carton-bar:
    backgroundColor: "{colors.carton-yellow}"
    textColor: "{colors.ink}"
    height: "{spacing.bar}"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.print-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.form-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  film-frame:
    backgroundColor: "{colors.frame-black}"
    textColor: "{colors.frame-paper}"
---

# Design System: Lumen Atelier

## Overview

**Creative North Star: "The Film Stock Box"**

Every look is a box of film you pick off a shelf and load into your photo. The chrome is printed carton:
warm print paper, ink type, a chrome-yellow bar with a red / yellow / blue band strip under it. The photo
always sits in a black frame with a line of edge printing that says which frame is loaded and which look
is in it. Looks are colour cartons with a stock code, a big catalogue numeral and the preview as the box's
window.

It is an Operate surface: the world lends type, palette, density and one signature move, never the
layout or the controls. Navigation, sliders, tabs and dialogs are ordinary web controls dressed in carton
type. The photo is the only full-colour image on an editing screen; the cartons around it carry colour
in flat, printed fields, and nothing glows, blurs or bevels.

The signature move is **loading a look**: the chosen carton lifts off the shelf with its band lit, and
the frame's edge print rolls in with the new look's name and amount.

**Key Characteristics:**
- Paper chrome, ink type, one chrome-yellow bar per screen with the band strip printed under it.
- A black frame (`.theme-frame`) around every photo, with edge printing in condensed tracked caps.
- Looks as colour cartons: stock code, display numeral, photo window, band strip at the foot.
- Condensed caps (Barlow Condensed) for titles, labels and print; Barlow for reading text.
- Crisp 2-6px corners, flat fields, one soft lift shadow for things that rise.

## Colors

A printed-carton palette: one committed yellow for the shell, ink and paper for everything you read,
three band inks for identity, and a black frame for the photo.

### Primary
- **Carton Yellow** (#e4a11b): the shell bar on every screen (`.theme-carton`), the one main action per
  screen (Match a look, Continue), selected fills, the active-tab marker and the changed-value fill on
  sliders. Never used as text on paper.
- **Accent Ink** (#845500): the readable form of the accent on paper: links, focus rings, small accent
  text (5.6:1 on print paper). Inside the frame it becomes **Frame Accent** (#f0b941).

### Secondary
- **Band Red** (#c8322b) and **Band Blue** (#2f6db5): with Carton Yellow they make the band strip under
  bars and on cartons, and the three-band mark. Identity only; never a state colour.

### Neutral
- **Ink** (#121212): all primary text, primary buttons, selected chips and segments.
- **Ink 2 / 3 / 4** (#36332e / #59544c / #6e685f): secondary, tertiary and quiet text (4.9:1 or better on paper).
- **Print Paper** (#f4f1ea): the page. **Paper Shade** (#ece8df) for quiet bands; **Sheet White**
  (#fbf9f4) for menus and sheets; **Form White** (#fffdf9) for input fields.
- **Hairline / Soft / Strong** (#cdc6b8 / #e3ded3 / #9f978a): borders and dividers; section rules are
  2px Ink instead.
- **Frame Black** (#0b0b0b → #000): the photo frame, filmstrip, histogram and on-photo labels. Inside it,
  the same role tokens flip to light values (`.theme-frame`).
- **Error Red** (#b8291f) and **Saved Green** (#2b7148): errors / destructive actions and saved state only.

### Carton inks
Each preset category has its own carton ink and three-letter stock code (`src/lib/presets/carton.ts`:
SIG, CIN, PBL, FLM, MAT, POR, WED, LUX, GLD, TRV, ERT, STR, B/W, SOC; OWN and REF for the user's own).
Within a category, looks cycle through the inks starting from the category's own, so a shelf never reads
as one colour. Every ink pair keeps its text at 4.5:1 or better.

### Named Rules
**The Scoped Theme Rule.** Components use role tokens (`ground`, `fg`, `accent`…), never raw values. The
same component renders on paper, inside `.theme-frame` (dark) or on `.theme-carton` (yellow; accent
becomes ink) without a variant.

**The Photo Is The Only Picture Rule.** On an editing screen nothing competes with the photo: no
gradients, glows, blurred backdrops or ambient colour behind it. The frame is black.

## Typography

**Display / Label Font:** Barlow Condensed (500-800), self-hosted
**Body Font:** Barlow (400-700), self-hosted

**Character:** carton lettering. Condensed heavy caps do the shouting on titles, cartons and labels;
Barlow at 15px does the reading. Numbers use tabular figures.

### Hierarchy
- **Display** (800, clamp(3.25rem, 13vw, 6rem), 0.92): the home headline and screen titles.
- **Headline** (800, 2-2.5rem, 0.92): section titles ("The shelf", "Your edits"), dialog titles (1.6rem).
- **Title** (700, 15px, 1.02, uppercase): look names on cartons, two lines max.
- **Body** (400, 15-17px, 1.6): descriptions and help, at most ~46ch on the home hero.
- **Label** (700, 11-13px, 0.08em, uppercase): nav tabs, chips, bar actions, section heads.
- **Edge print** (600, 11px, 0.16em, uppercase, tabular): frame lines and catalogue codes.

### Named Rules
**The Caps Are Printed Rule.** Condensed caps are for printed things (titles, labels, codes, look names).
Sentences, help text and values stay in sentence-case Barlow.

## Layout

Phone first. Every screen opens with the 56px carton bar (48px on the desktop editor) and the band rule.
Pages use a 16px gutter on phones and 32px from `sm`, max width 1280px. The editor is a frame in the
middle: on desktop a 284px shelf rail (left), the frame, a 300px tools rail (right) and the filmstrip; on
phones and tablets the frame fills the screen above a paper bottom nav (Looks, Light, Match look, Colour,
More), and each tool docks as a sheet under the photo, with "Pick a look" and the carton strip directly
under the frame. Section rules are 2px Ink with more space above a heading than below.

## Elevation & Depth

Flat by default: paper, ink and colour fields. Depth appears only when something rises.

### Shadow Vocabulary
- **Lift** (`0 10px 22px -10px rgb(18 18 18 / 0.45)`): a carton or print raised on hover or when chosen.
- **Float** (`0 18px 40px -14px rgb(18 18 18 / 0.35), 0 2px 6px -2px rgb(18 18 18 / 0.18)`): menus, toasts, dialogs.

### Named Rules
**The Off The Shelf Rule.** Only a chosen or hovered carton lifts (8px when chosen, 2-4px on hover);
nothing else floats at rest.

## Shapes

Crisp printed corners: 2px (marks, small tags), 4px (buttons, chips, cartons, inputs), 6px (dialogs).
No pills or circles for actions; circles only for slider thumbs, colour swatches, the toggle knob and
status dots. Borders are 1px hairlines or 1.5px ink outlines on secondary buttons; section and sheet
edges are 2px Ink. The film frame has sprocket holes (14 small rounded rectangles) on the home screen.

## Components

### Buttons
- **Shape:** gently squared (4px).
- **Primary:** Ink fill, paper text, 600 weight, 40px tall (44px on touch). Inverts inside the frame;
  stays an ink block on the carton bar.
- **Accent:** Carton Yellow fill, ink text: one per screen (Match a look).
- **Secondary:** transparent with a 1.5px ink outline. **Ghost:** text only with an 8% ink hover.
- **Icon buttons:** 32px (40px touch), 4px corners; pressed state is an ink square with paper icon.

### Chips and segmented controls
Condensed caps on a 1px hairline; selected is solid Ink with paper text. Rows scroll sideways on phones
and fade at the edge where they overflow.

### Inputs
Form White field, 1px hairline, 4px corners; focus is a 2px Accent Ink ring.

### Navigation
The carton bar holds Back (an ink block with "Back"), the three-band mark and screen actions. The phone
bottom nav is paper with a 2px ink top rule; the active tab is ink with a 3px yellow marker above it;
Match look is a yellow tile, not a tab.

### Film Carton (signature)
A look: carton ink face, stock code plus a display numeral (28-34px), the preview as an inset window,
the name in condensed caps (two lines), and the band strip at the foot (3px, 60% opacity; 7px and full
strength when chosen). Chosen cartons lift 8px with an ink outline and a check.

### Film Frame and Edge Print (signature)
The black frame around every photo, with a 28px line of edge print: `FRAME 01A · LOOK <NAME> · <N>%`
and the pixel size. The look part rolls in (420ms, out-quint, blur to sharp) whenever the look changes.

## Do's and Don'ts

### Do:
- **Do** put every new screen under the carton bar and band rule (`CartonBar`).
- **Do** show photos inside `.theme-frame`, never on paper.
- **Do** give anything that represents a look a carton ink, a stock code and a numeral.
- **Do** keep one Carton Yellow action per screen; everything else is ink or outline.
- **Do** honour reduced motion: the shelf stocking (GSAP) and the edge-print roll are skipped.

### Don't:
- **Don't** use frosted glass, glows, gradients or blurred photo backdrops; the world is printed.
- **Don't** use Carton Yellow as text on paper; use Accent Ink.
- **Don't** imitate real film brands' cartons, logos or stock names.
- **Don't** use Unicode glyphs or emoji as icons; use Lucide at the surrounding stroke.
- **Don't** use pills or circles for buttons and chips.
