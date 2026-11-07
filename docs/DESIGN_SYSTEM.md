# Design system

**Source of truth: [DESIGN.md](../DESIGN.md)** (tokens, rules, components; machine-readable sidecar in
`.impeccable/design.json`). Redesigned 2026-11-08 ("Film Stock Box"); this file keeps the behavioural
layout, touch and accessibility notes.

**Direction:** every look is a box of film you load into your photo. Printed carton chrome (paper
`#f4f1ea`, ink `#121212`), a chrome-yellow bar (`#e4a11b`) with a red / yellow / blue band rule, the photo
in a black frame with edge printing, looks as colour cartons with a stock code and numeral.

## Tokens (`src/styles/index.css`, Tailwind v4 `@theme`)

Role tokens, not literal colours: `well` < `ground` / `ground-2` < `raised` / `raised-2`, `control`,
`line-soft` / `line` / `line-strong`, text `fg` … `fg-4`, `accent` (yellow fill), `accent-fg` (accent as
text / rings), `on-accent`, `selected`, `danger`, `success`, `band-red` / `band-yellow` / `band-blue`.
Three scopes re-point them: default (paper), `.theme-frame` (black frame: viewport, filmstrip, histogram,
toasts, tooltips, on-photo labels) and `.theme-carton` (yellow bar; accent becomes ink). Helpers:
`.carton-title`, `.carton-label`, `.edge-code`, `.bands` (carton strip), `.bands-rule` (under bars),
`.edge-advance` (signature roll-in). Carton inks and stock codes: `src/lib/presets/carton.ts`.

Type: **Barlow Condensed** (titles, labels, edge print, numerals) and **Barlow** (body), self-hosted via
Fontsource (OFL). Radii 2 / 4 / 6 px. Shadows: `shadow-lift` (raised cartons) and `shadow-float` (menus,
dialogs).

## Motion

| Duration | Value | Use |
| --- | --- | --- |
| instant | 80 ms | Pressed states |
| fast | 140 ms | Hover, focus, slider thumb |
| base | 220 ms | Panels, tabs, segmented control, section collapse |
| slow | 380–450 ms | Canvas reveal, edge-print roll-in (420 ms) |

Easing `cubic-bezier(0.22, 1, 0.36, 1)`. Signature: loading a look lifts its carton 8 px with the band
lit and rolls the edge print in. The home shelf is stocked once with GSAP (`@gsap/react`, skipped with
reduced motion). Motion (`motion/react`) drives panels, tabs and sheets. Progress is a percentage only
where measurable. `prefers-reduced-motion` is respected, with a Settings override.

## Layout

- Desktop (≥1024 px): top bar, left panel 284 px (reference CTA, presets, photos), canvas, right panel
  300 px (histogram, tabs), filmstrip. Both side panels collapse.
- Tablet/mobile (<1024 px): canvas plus a bottom navigation (Presets, Light, Match look, Colour, More).
  Each opens a panel **docked under the photo** (46 dvh; the photo re-fits above it, so edits stay
  visible), or **beside it** on phones held sideways (`(orientation: landscape) and (max-height: 540px)`).
  The Presets panel is the full left panel (Presets / Photos, Save look, preset Amount); Light adds
  the histogram. Top-bar actions that don't fit move into the ⋮ *More actions* menu (below 1024 px).
- Phone panels have a grab handle: tap or drag up to expand to 78 dvh, drag down to shrink or close.
  Looks on phones are a sideways strip of cartons under a "Pick a look" heading (search behind an icon); expanded, a grid.
  Card menus render in a portal so scrolling containers never clip them. No `scroll-snap` on the
  strip (with mandatory snap Chrome drops the first tap after a swipe).
- Touch: pinch to zoom and pan with two fingers, double-tap to toggle fit / zoom, one finger pans
  when zoomed. **Scrolling a panel must never change an edit**: sliders ignore fingers on the native
  input and take horizontal drags on the row (relative to where the finger landed; vertical swipes
  scroll; taps do nothing); the tone curve and colour wheels let vertical swipes scroll and only
  capture fingers on their points / marker (large invisible handles; `touch-action` is ignored on
  SVG shapes, so curve handles cancel `touchstart` instead); a tap adds a curve point or moves a
  wheel; a finger-dragged curve point stays on the graph and a double tap removes it. Canvas tools that use Shift / Alt on a keyboard get an on-photo mode chip on touch
  screens (Remove: *Add to last*; Select object: *Add* / *Subtract*; Heal: *Delete spot*) with *Done*.
- Touch targets: Tailwind variants `coarse:` (`pointer: coarse`) enlarge buttons, segmented
  controls, slider rows/thumbs (20 px) and crop handles (44 px); `fine:` (`hover: hover` and
  `pointer: fine`) hides secondary controls until hover on desktop only, so they are always
  visible on touch screens. Tooltips are not rendered on touch screens.
- Heights use `100dvh`; `viewport-fit=cover` with safe-area insets for the bottom bar, landscape
  notches and full-screen dialogs.

## Accessibility

Native range inputs behind the custom slider track (keyboard, screen readers, `aria-valuetext`),
double-click / typed values, focus-visible rings in accent ink (#845500; #f0b941 in the frame), focus-trapped dialogs that restore
focus, `aria-live` status for saving / analysis / export, labelled icon buttons with tooltips and
shortcuts, keyboard-operable colour wheels, curve points and before/after divider.
