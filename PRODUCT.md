# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Installable PWA; used mostly on phones, also on tablet and desktop browsers.)

## Users

Both, phone first. Everyday people and creators who see a look on Instagram, Pinterest or a website and
want it on their own photo, editing on their phone; and enthusiast photographers who know Lightroom-style
tools and want curves, HSL, masks and retouching, mostly on a larger screen. The phone experience must be
simple for a beginner; depth must stay reachable for the enthusiast.

## Product Purpose

Lumen Atelier is a premium photo editor that runs entirely in the browser. Its defining workflow is
**reference photo → analysis → editable preset → apply to your photo → refine → save and reuse**.
Success: a user gets a convincing version of a look they admired onto their own photo in a minute, can
adjust it, and keeps it as a reusable preset.

## Positioning

Three things equally, together: (1) copy any look from a reference photo into an editable preset;
(2) free, with the full editor and preset library; (3) private and on-device: no account, no upload,
works offline (on-device ML for select object, remove, lens blur, upscale).

## Operating Context

Phone in hand, often right after saving a reference image from a social app; share target and file
handlers bring photos in. Desktop sessions are longer, keyboard-and-mouse, with side panels, histogram
and filmstrip. Exports go to the photo library / downloads / share sheet.

## Capabilities and Constraints

- Screens: home/gallery, editor (presets, light, colour, curves, HSL, effects, masks, portrait, remove,
  lens blur, geometry, upscale export; on touch, a swipe on the photo steps through looks), reference studio (match a look), preset library, settings (AI models, app
  & offline).
- 75+ original "Signature Pro" presets in 14 categories; user presets saved locally (IndexedDB).
- Optional AI style interpretation (Claude API or local Ollama); without it, measurements only.
- Engineering rules in AGENTS.md (pixel maths, no fake progress, Zod-validated AI output) stay binding.
- Analysis can take minutes on CPU; the measured look applies first and refines in the background.

## Brand Commitments

- Name: **Lumen Atelier** (binding).
- No visual element of the current UI is binding; the look may change completely (owner decision,
  2026-11-08).
- Presets are original; never imply affiliation with Adobe, VSCO or other brands.
- Never promise recovery of the exact original editing settings of a reference image.

## Evidence on Hand

No testimonials, user counts, reviews or press exist; do not invent any. Preset names and categories are
real (docs/PHOTO_EDITOR_SIGNATURE_PRO_PRESETS.md). One bundled sample photo (CC0, a
street in A Coruña, `public/samples/`, credited in README) is used on a first visit; no other photography
licensed for marketing use is in the repo.

## Product Principles

1. The photo is the hero; the interface serves it and never competes with it.
2. Honest about what's happening: real progress only, clear when AI is or isn't used.
3. Simple first, deep on demand: one obvious next step on a phone, full control a tap away.
4. Private by default: nothing leaves the device unless the user enables AI interpretation.

## Accessibility & Inclusion

Keyboard operable on desktop, screen-reader labelled controls, WCAG AA text contrast, touch targets
sized for phones, `prefers-reduced-motion` honoured with an in-app override.
