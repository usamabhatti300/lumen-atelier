# Design system

**Source of truth: [DESIGN.md](../DESIGN.md)** (tokens, rules, components; machine-readable sidecar in
`.impeccable/design.json`). Redesigned 2026-11-08 a second time ("Afterglow", replacing "Film Stock Box"
after a critic review); this file keeps the behavioural layout, touch and accessibility notes.

**Direction:** a dark graphite instrument where the only light is the photo and what you do to it. One
electric-lime accent (`#d4ff3f`) for the one main action, changed values and the chosen look; a prism
(rose, amber, lime, cyan, violet) only at signature moments; Geist / Geist Mono / Instrument Serif italic.

## Tokens (`src/styles/index.css`, Tailwind v4 `@theme`)

Role tokens, not literal colours: `well` < `ground` / `ground-2` < `raised` / `raised-2`, `control` /
`control-2`, `line-soft` / `line` / `line-strong`, text `fg` … `fg-4`, `accent` (lime fill), `accent-fg`
(lime as text / rings), `on-accent`, `selected`, `danger`, `success`, prism `spec-1` … `spec-5`.
`.theme-frame` deepens the ground around the photo. Helpers: `.display`, `.serif`, `.label-caps`,
`.spectrum`, `.spectrum-text`, `.surface-float`, `.screen-enter`, `.skeleton`, `.readout-in`,
`.lumen-sweep`, `.no-scrollbar`; shadows `shadow-float`, `shadow-lift`, `shadow-glow`. Category codes and
tints: `src/lib/presets/codes.ts`. Brand mark: `src/components/Wordmark.tsx` (`LumenMark`), mirrored in
`public/favicon.svg` and `scripts/generate-icons.mjs`.

Type: **Geist Variable** (UI, display), **Geist Mono Variable** (readouts, label caps) and **Instrument
Serif** italic (one word per headline), self-hosted via Fontsource (OFL). Radii 6 / 10 / 16 / 22 / 28 px
and pills.

## Motion

| Duration | Value | Use |
| --- | --- | --- |
| instant | 80 ms | Pressed states |
| fast | 140 ms | Hover, focus, slider thumb |
| base | 220 ms | Panels, tabs, section collapse |
| slow | 420 ms | Screen enter, look readout, photo develop (700 ms), lumen sweep (900 ms) |

Easing `cubic-bezier(0.22, 1, 0.36, 1)`; springs for the dock pill, tool-tab pill, segmented thumb,
dialogs, toasts and the chosen look's check. Signature: loading a look spins in the tile's lime check,
sweeps one band of light across the photo and rises the look readout in. The home screen is staged once
with a GSAP timeline. Progress is a percentage only where measurable. `prefers-reduced-motion` is
respected, with a Settings override (the sweep is removed entirely).

## Layout

- Desktop (≥1024 px): top bar, left panel 284 px (reference CTA, presets, photos), canvas, right panel
  320 px (histogram, tabs), filmstrip. Both side panels collapse.
- Tablet/mobile (<1024 px): canvas plus a floating bottom dock (Looks, Light, Match look, Colour, More).
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
double-click / typed values, focus-visible rings in lime (#d4ff3f), focus-trapped dialogs that restore
focus, `aria-live` status for saving / analysis / export, labelled icon buttons with tooltips and
shortcuts, keyboard-operable colour wheels, curve points and before/after divider.
