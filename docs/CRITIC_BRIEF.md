# Critic brief: review (and if needed, redesign) Lumen Atelier's UI

You are the senior reviewer for this app: product designer, UI/UX lead, motion designer, QA lead and
senior frontend architect in one. The previous agent redesigned the whole UI on 2026-11-08. Your job is
to judge that work harshly and honestly, then fix it. Where it fails, redesign it, up to the whole app
if that is what it takes. You have the owner's authority to do that.

Don't be polite about the previous agent's work. Don't anchor on its choices or its own review. Look at
the running app with fresh eyes, as the owner and their users would.

## 1. The product (read these first)

- `PRODUCT.md`: who it's for and what it promises. **Both, phone first:** everyday people and creators
  who see a look on Instagram/Pinterest and want it on their own photo, plus enthusiasts who want
  Lightroom-level control. Pitch: **copy any look from a reference photo into an editable preset,
  free, and private** (everything runs on the device).
- `HANDOFF.md` and `AGENTS.md`: how to run it, the architecture and the engineering rules. These rules are
  binding: pixel maths in both `pixel.ts` and `shaders.ts`, no fake progress, Zod-validated AI output, no
  secrets in `VITE_*`, and every ML model goes through the registry.
- `DESIGN.md`: the design system the previous agent shipped ("Film Stock Box"). It describes the build,
  not a target. You may replace it.
- `docs/DESIGN_SYSTEM.md`: layout, touch and accessibility behaviour. Most of it is hard-won from testing
  on the owner's real phone, so keep it unless you have a better answer.

**The owner's bar, in their words:** it must feel like a premium-level editor; futuristic; Gen Z should
love it and *crave* using it; animations smooth and good; colour scheme and UX experience judged on
every screen.

## 2. What was built (so you know what you're judging)

- Stack: React 19, TypeScript 6 (strict), Vite 8, Tailwind 4 (`@theme` tokens in
  `src/styles/index.css`), Zustand, Motion, GSAP (`@gsap/react`), Lucide icons, and a WebGL2 renderer.
  It's an installable PWA (service worker, offline use, share target).
  shadcn/ui is configured (`components.json`, `cn()` in `src/lib/utils.ts`) but no components have been added.
  React Three Fiber is installed and unused.
- **Visual world "Film Stock Box":** paper `#f4f1ea` and ink `#121212` chrome, a chrome-yellow `#e4a11b`
  top bar with a red/yellow/blue band rule, Barlow and Barlow Condensed caps. Every photo sits in a black
  frame (`.theme-frame`) with "edge print" under it (`EdgePrint.tsx`). Presets are coloured "film cartons"
  with a stock code and numeral (`src/lib/presets/carton.ts`, `PresetBrowser.tsx`).
- **Token architecture:** role tokens (`ground`, `fg`, `accent`, `accent-fg`…) with scoped themes
  `.theme-frame` (dark) and `.theme-carton` (yellow bar). Most components were *recoloured* through this
  remap rather than individually redesigned.
- **Screens:** home (`GalleryScreen.tsx`), editor (`EditorScreen.tsx`, `TopBar.tsx`, `LeftPanel.tsx`,
  `RightPanel.tsx`, `panels/*`), Match a look (`features/reference/ReferenceStudio.tsx`), preset library
  (`PresetLibraryScreen.tsx`), settings (`SettingsScreen.tsx`), export (`features/export/ExportDialog.tsx`).
- **Motion:** the selected carton lifts and its band lights up; the edge print rolls in when a look
  loads; GSAP staggers the home shelf once; Motion animates sheets and tabs. Reduced motion is respected.

## 3. Where the previous agent itself suspects weakness (verify; don't trust)

- **"Futuristic / Gen Z" was never tested.** The film-carton world leans retro-analog. It might read as
  vintage or packaging-themed rather than futuristic and crave-worthy.
- **Light paper chrome** in a photo-editing app. Most editors are dark for colour judgement. Here the
  photo sits in a black frame, but the panels around it are bright. Judge the comfort at night on a phone.
- **Depth of the redesign.** The right tools rail (sliders, curves, HSL, masks, portrait, remove, lens
  blur, crop), the reference studio's analysis panel, dialogs and settings were mostly recoloured, not
  re-thought. They may still feel like generic form chrome.
- **Motion is thin.** There's no orchestrated moment for opening a photo, finishing an analysis or
  exporting. There are few micro-interactions on sliders and tools, and no page transitions.
- **Home shelf cartons** have no photo inside, so they read as colour swatches.
- The "Applied look / Amount" card on phones is a plain bordered form.
- Preset previews render slowly under headless software GL (real GPUs are fine). Don't mistake that
  for a bug, but do judge the loading state.
- shadcn/ui was asked for by the owner but not used.

## 4. How to review (do it for real, not from code alone)

1. Start the app with `npm run dev`. Port 5173 is taken on this PC, so Vite picks 5174 or 5175. Use a
   real photo, not a flat test image. If you download any sample photos, keep them out of the repo.
2. Use Playwright (MCP or scripts) at **390×844 (phone, touch), 834×1112 (tablet), 1440×900 (desktop)**.
   Also try phone landscape and `prefers-color-scheme` / `prefers-reduced-motion`.
3. Drive the real journeys, not just resting screens:
   - First visit, open a photo, try several looks, adjust the amount, refine Light and Colour, export.
   - Match a look: add a reference, analyse it, the look applies automatically, refine, save it as a
     preset, reuse it on another photo.
   - The preset library (search, favourites, categories), settings, and installing the app.
   - Masks, select object, remove, lens blur, crop, before/after, undo/redo.
4. For motion, record or step through frames (traces, video, or a screenshot sequence). Check for jank,
   layout shift, the timing and easing of the edge-print roll-in and carton lift, and sheet drags.
5. Check states: hover, focus, pressed, disabled, loading, empty, error, offline, very long names.
6. Check accessibility: contrast at 4.5:1, keyboard paths, touch targets of at least 44 px, screen-reader
   labels.
7. Check performance: first load, interaction latency on the phone profile, and the bundle impact of
   anything you add.

## 5. How to judge

Score each from 1 to 10 with evidence (a screenshot path and what's wrong): **first impression and
"crave" factor for Gen Z**, **visual identity and colour**, **typography**, **layout and hierarchy**,
**motion and micro-interactions**, **UX flow and clarity for a beginner on a phone**, **depth for an
enthusiast on desktop**, **consistency across screens**, **accessibility**, **performance feel**.
Benchmark against the best apps in the category: VSCO, Lightroom Mobile, Darkroom, Snapseed, Picsart,
Instagram's editor, and current best-in-class Gen Z apps such as Arc, Linear, BeReal and Retro.

**Verdict:** if the average is under 8, or "crave factor" or "motion" is under 7, the design fails. Then:

- **Fails on identity** (it doesn't feel futuristic or desirable): replace the visual world. Pick a new
  direction yourself, state why in one paragraph, and rebuild every screen in it. Don't just recolour
  through the tokens. Rewrite `DESIGN.md` from the result.
- **Fails on execution** (the identity is right but the craft is weak): redesign the weak screens and
  components properly, and add a real motion system (Motion and GSAP, orchestrated, reduced-motion
  safe).
- Use shadcn/ui components where they genuinely improve accessibility or behaviour. Restyle them fully
  to the system and never leave stock looks.

## 6. Constraints that still bind

- Keep the name **Lumen Atelier** and every working feature. Never fake a control or progress.
- Stay on **Vite**: no Next.js, because the PWA, cross-origin isolation (COOP/COEP) and on-device ML
  depend on it.
- Keep it local-first and private: no new network calls or remote assets at runtime. Fonts are
  self-hosted.
- Make no claims the product can't back up (user counts, reviews, "AI does X" beyond what it does).
- Don't imitate real brands (film companies, other apps).
- Keep `data-testid`s. If you rename accessible labels, update the e2e specs in the same change.
- Before you finish, run `npm run typecheck && npm run lint && npm test`, then
  `npx playwright test e2e/editor.spec.ts e2e/mobile.spec.ts` and `npm run test:e2e:pwa`. Run the critical
  journey (`e2e/critical-journey.spec.ts`, ~5 min) if you touch the reference flow. Report only tests
  you actually ran.
- Commit in logical steps and push to `origin main`. Update `HANDOFF.md`, `PROJECT_STATUS.md`,
  `DESIGN.md` and `docs/DESIGN_SYSTEM.md`.

## 7. What to hand back to the owner

1. The scorecard (before), with the worst problems ranked and screenshot evidence.
2. The verdict, and what you decided to keep, redesign or replace, and why.
3. What you changed, and the scorecard after, with before/after screenshots at phone and desktop size.
4. Tests run and their results, plus anything still open.
