# Design system

**Source of truth: [DESIGN.md](../DESIGN.md)** (tokens, rules, components; machine-readable sidecar in
`.impeccable/design.json`). Redesigned 2026-11-08 a third time ("Afterimage", replacing "Afterglow" after the
owner's new brief banned neon lime, rainbow gradients and glows); this file keeps the behavioural layout,
touch and accessibility notes.

**Direction:** the early digicam and the contact sheet, seen from now. Night-black chrome, ivory type,
one lilac accent (`#c8b8ff`) for the one main action, changed values and the chosen look, and the
afterimage: a hard, unblurred lilac offset. Orange (`#f2994a`) for date stamps only. Geist + Martian Mono.

**Since 2026-11-14, "Lit"** sits on top of Afterimage: glass chrome, ambient light behind the
editor's panels, motion and an opening animation. Home is a darkroom (black, no ambient colour).
DESIGN.md, section "Lit: depth and motion", is the source of truth for all of it, including what
reduced motion turns off.

## Tokens (`src/styles/index.css`, Tailwind v4 `@theme`)

Role tokens, not literal colours: `well` < `ground` / `ground-2` < `raised` / `raised-2`, `control` /
`control-2`, `line-soft` / `line` / `line-strong`, text `fg` … `fg-4`, `accent` (lilac fill), `accent-fg`
(lilac as text / rings), `on-accent`, `selected`, `stamp`, `danger`, `success`. The retired prism tokens
`spec-1` … `spec-5` hold lilac/ivory tones. `.theme-frame` deepens the ground around the photo. Helpers:
`.display`, `.voice`, `.mono-display`, `.label-caps`, `.spectrum` (now a flat lilac fill), `.surface-float`,
`.screen-enter`, `.skeleton`, `.readout-in`, `.afterimage-ghost`, `.afterimage-flash`, `.no-scrollbar`;
shadows `shadow-float`, `shadow-lift`, `shadow-offset`, `shadow-offset-sm`, `shadow-selected`. Rolls:
`src/lib/presets/rolls.ts`; category codes: `src/lib/presets/codes.ts`. Brand mark:
`src/components/Wordmark.tsx` (`LumenMark`), rendered into `public/favicon.svg` and the icons by
`scripts/generate-icons.mjs`.

Type: **Geist Variable** (UI, display, look names) and **Martian Mono Variable** (wordmark at full width;
labels and readouts at 87.5% width), self-hosted via Fontsource (OFL). Radii 6 / 10 / 16 / 22 / 28 px
and pills.

## Motion

| Duration | Value | Use |
| --- | --- | --- |
| instant | 80 ms | Pressed states |
| fast | 140 ms | Hover, focus, slider thumb |
| base | 220 ms | Panels, tabs, section collapse |
| slow | 420 ms | Screen enter, look readout, photo develop (700 ms), afterimage ghost (520 ms), photo settle (520 ms) |

Easing `cubic-bezier(0.22, 1, 0.36, 1)`; springs for the dock pill, tool-tab pill, segmented thumb,
dialogs, toasts, the chosen look's check and phone sheets (stiffness 420, damping 40). Signature:
loading a look spins in the tile's lilac check; the previous image (copied by `engine.snapshot()` the
moment the look changes) appears over the photo on the first frame rendered with the new look and drifts
off and fades as an offset ghost, the photo settles (0.99 → 1) and the look readout rises in. Android gets short haptic ticks (`src/lib/haptics.ts`). Tapping never shifts the
photo: the phone amount row keeps a fixed height (measured CLS 0). The home screen is staged once
with a GSAP timeline. Progress is a percentage only where measurable. `prefers-reduced-motion` is
respected, with a Settings override (the afterimage is removed entirely).

## Layout

- Desktop (≥1024 px): top bar, left panel 284 px (reference CTA, presets, photos), canvas, right panel
  320 px (histogram, tabs), filmstrip. Both side panels collapse.
- Tablet/mobile (<1024 px): canvas plus a floating bottom dock (Looks, Light, Match look, Colour, More).
  A fresh photo opens with the Looks sheet showing; the dock is a tab bar (tapping the open tab keeps it).
  Each opens a panel **docked under the photo** (46 dvh; the photo re-fits above it, so edits stay
  visible), or **beside it** on phones held sideways (`(orientation: landscape) and (max-height: 540px)`).
  The Presets panel is the full left panel (Presets / Photos, Save look, preset Amount); Light adds
  the histogram. Top-bar actions that don't fit move into the ⋮ *More actions* menu (below 1024 px).
- Phone panels have a grab handle: tap or drag up to expand to 78 dvh, drag down to shrink or close.
  Looks on phones are a sideways strip of photo tiles under a "Pick a look" heading (search behind an icon); expanded, a grid.
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
double-click / typed values, focus-visible rings in lilac (#c8b8ff), focus-trapped dialogs that restore
focus, `aria-live` status for saving / analysis / export, labelled icon buttons with tooltips and
shortcuts, keyboard-operable colour wheels, curve points and before/after divider.
Touch targets are at least 44 px on coarse pointers, including the phone sheet's close, Save and
remove-look buttons (2026-11-08). Preset previews render only for tiles on or near the screen and drop
their queued render when they scroll away, so visible tiles fill first.
