# Design system

**Direction:** a darkroom, not a dashboard. Warm near-black inks, warm-grey hairlines, ivory type,
one muted amber accent. The signature motif is the **Zone System scale** (Zones 0–X, one stop apart,
Zone V = 18% grey). It appears on the welcome screen, under the histogram, and as the measured
tonal readout in reference analysis. Film-rebate edge printing (mono, letter-spaced, amber) labels
the filmstrip and contact-sheet gallery.

## Tokens (`src/styles/index.css`, Tailwind v4 `@theme`)

| Token | Value | Use |
| --- | --- | --- |
| `ink-950 … ink-600` | `#0d0c0b` … `#322f2b` | Canvas surround, panels, raised controls |
| `line-soft / line / line-strong` | `#2a2724 / #38342e / #4a453d` | Hairline borders |
| `ivory / ivory-dim / mute / faint` | `#ece6da / #c9c2b5 / #9c958a / #6f695f` | Text hierarchy |
| `amber` (+ `-bright`, `-deep`) | `#c9a26b` | The single accent: selection, active state, primary action |
| `champagne` | `#e3cfa6` | Selected chips and segmented controls |
| `safelight` | `#d0584a` | Errors and destructive actions only |
| `verdigris` | `#7fa391` | Success / saved |

Type: **Inter Variable** for UI (tabular numerals for values), **Instrument Serif** for screen
titles and the reference description (sparingly), **IBM Plex Mono** for edge codes and readouts.
All fonts are self-hosted via Fontsource (OFL).

Radii: 3 / 5 / 8 px. Elevation: one shadow (`shadow-float`) for menus and dialogs only.

## Motion

| Duration | Value | Use |
| --- | --- | --- |
| instant | 80 ms | Pressed states |
| fast | 140 ms | Hover, focus, slider thumb |
| base | 220 ms | Panels, tabs, segmented control, section collapse |
| slow | 380–450 ms | Canvas reveal on photo change, analysis results reveal |

Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (out-quint) for most movement. The analysis scan is a
restrained 2.4 s sweep that runs only while analysis is running. Progress is shown as a percentage
only where it is measurable (import, export tiles, batch); otherwise as an indeterminate bar.
`prefers-reduced-motion` is respected, with a Settings override (system / reduced / full).

## Layout

- Desktop (≥1024 px): top bar, left panel 284 px (reference CTA, presets, photos), canvas, right panel
  300 px (histogram, tabs), filmstrip. Both side panels collapse.
- Tablet/mobile (<1024 px): canvas plus a bottom navigation (Presets, Light, Match look, Colour, More).
  Each opens a panel **docked under the photo** (46 dvh; the photo re-fits above it, so edits stay
  visible), or **beside it** on phones held sideways (`(orientation: landscape) and (max-height: 540px)`).
  The Presets panel is the full left panel (Presets / Photos, Save look, preset Amount); Light adds
  the histogram. Top-bar actions that don't fit move into the ⋮ *More actions* menu (below 1024 px).
- Touch: pinch to zoom and pan with two fingers, double-tap to toggle fit / zoom, one finger pans
  when zoomed. Canvas tools that use Shift / Alt on a keyboard get an on-photo mode chip on touch
  screens (Remove: *Add to last*; Select object: *Add* / *Subtract*; Heal: *Delete spot*) with *Done*.
- Touch targets: Tailwind variants `coarse:` (`pointer: coarse`) enlarge buttons, segmented
  controls, slider rows/thumbs (20 px) and crop handles (44 px); `fine:` (`hover: hover` and
  `pointer: fine`) hides secondary controls until hover on desktop only, so they are always
  visible on touch screens. Tooltips are not rendered on touch screens.
- Heights use `100dvh`; `viewport-fit=cover` with safe-area insets for the bottom bar, landscape
  notches and full-screen dialogs.

## Accessibility

Native range inputs behind the custom slider track (keyboard, screen readers, `aria-valuetext`),
double-click / typed values, focus-visible rings in amber, focus-trapped dialogs that restore
focus, `aria-live` status for saving / analysis / export, labelled icon buttons with tooltips and
shortcuts, keyboard-operable colour wheels, curve points and before/after divider.
