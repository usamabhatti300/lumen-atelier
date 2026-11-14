# Lumen Atelier: product audit and improvement plan

_2026-11-14. Covers the whole app at phone size (390 × 844, touch) and desktop (1440 × 900)._

> **Outcome.** The high-priority list in section 10 was built the same day; what was done, what a
> second independent audit then found, and what is still open are in `POST_IMPLEMENTATION_AUDIT.md`.
> Items marked "Now" below that were only partly done: the home hero is sharper but still reads as
> low resolution (problem 16); phone touch targets were raised in the looks sheet and top bar, not
> everywhere (21); Settings still has technical wording outside the Diagnostics fold (25); the
> Remove progress label was fixed but Select object still has no cancel (19).

## How this audit was done

Three independent reviews ran in parallel, each in its own context so none anchored the others:

1. **Design walk-through** of every screen and control in the running app (touch-emulated phone and
   desktop), with screenshots, measured touch targets and timings.
2. **Technical audit**: type-check, lint, unit tests, production build and bundle analysis, the
   Impeccable design detector, and a code review for performance, accessibility and robustness.
3. **Looks and colour audit**: all 186 built-in looks rendered through the CPU reference pipeline on
   the sample photo and on a synthetic chart (grey ramp, four skin tones, sky, foliage, primaries),
   measured, clustered by visual distance, and judged on contact sheets.

Limits to keep in mind: only one licensed photo exists in the repo (a street, no people), so skin was
judged on colour patches, not real portraits. Everything ran in headless Chromium with software
rendering on a CPU-only laptop, so speeds are a worst case. Nothing was checked on a real phone or
in iOS Safari. Portrait retouching, lens blur, AI upscale and the contact-sheet export were not
exercised in the walk-through.

---

## 1. Current assessment

**Verdict: a strong editing engine inside a product that undersells it. Usability score 22 / 40
(Nielsen's ten heuristics, "acceptable"), not yet at the level of VSCO or Lightroom Mobile.**

| # | Heuristic | Score (0–4) | Main reason |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 2 | Export preview is black; Select object shows "Selecting…" for a minute with no progress or cancel |
| 2 | Match with the real world | 2 | "Fitted", "Kept", "Last roll", "Range"; look names that promise things they don't do |
| 3 | User control and freedom | 2 | Crop cannot be cancelled; the dock's More button is dead inside a More tool |
| 4 | Consistency and standards | 2 | Looks / presets / rolls / categories are four words for one thing |
| 5 | Error prevention | 3 | Bad files rejected cleanly; edits are non-destructive |
| 6 | Recognition over recall | 2 | 186 looks told apart by name because their previews look the same |
| 7 | Flexibility and efficiency | 2 | No Auto; shortcuts exist only in tooltips |
| 8 | Aesthetic and minimalist design | 2 | A pitch page before the user's photos; four rows of chrome above the looks |
| 9 | Error recovery | 3 | Clear toasts |
| 10 | Help and documentation | 2 | Good inline notes; developer text in Settings |

**What is good and should not change**

- The phone **Light** and **Colour** panels: group chips with edit dots, one-line slider rows, the
  eight colour swatches, the grade wheel. The best screens in the app.
- **Hold to compare** and **swipe between looks** worked first time on touch.
- **Export** is fast (a 2048 × 1536 JPEG in under a second) and the burned-in date stamp looks right.
- **Remove** filled a painted-over pedestrian plausibly, on the device.
- The **engine**: OKLCh colour mixing, cartesian grade wheels, monotone curves, a contrast curve that
  never clips. Type-check is clean, 262 unit tests pass, the build passes.
- The **Afterimage identity**: the wordmark with its hard lilac offset, frame numbers, the orange
  date stamp, the viewfinder crop brackets. These are ownable.

**The four biggest problems**

1. **The looks are the weakest part of a product that sells looks.** Measured: 45 of 186 looks are
   under 2.5 ΔE from the untouched photo (invisible at arm's length) and 93 are under 3.5. The 186
   collapse to about 75 visually distinct looks. Whole rolls (Golden Minutes, Moss & Clay, Something
   Borrowed, Flash at Midnight, Soft Static) are four near-copies of the original each. Twenty looks
   blow out highlights, fifteen crush shadows, about twenty shift skin toward green, magenta or grey.
   None of the 186 uses any of the eight effects added in roadmap 2.5, so "Flash at Midnight" has no
   flash in it.
2. **Home is a landing page in front of a tool.** With an edit saved, "your edits" starts two screens
   down on a phone (1,692 px), after the hero and the "How a look travels" story.
3. **The decoration fights the identity and the photo.** The particle hero shows the sample photo
   soft and blocky; the editor's bars carry a purple and brown colour wash right beside the photo
   being colour-judged; the look previews are small (84 px on phones) and soft when enlarged.
4. **Real bugs in the main journey**: the export preview is black under software rendering; applying
   a look moves the photo about 25 px on phones; crop has no cancel; the look chip covers the Remove
   toolbar.

---

## 2. UI/UX problems and solutions

Severity: **P0** blocks or badly hurts the main journey, **P1** major, **P2** minor, **P3** polish.
"Now" means implemented in this pass (section 10 has the order).

| # | Sev | Where | Problem | Solution | When |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | Looks | Timid, near-identical or misnamed looks (see section 5) | Replace the library with 41 distinct, verified looks in 8 rolls | Now |
| 2 | P0 | Looks | Adaptive fitting can undo a look: Teal and Orange was "fitted" with temperature +15, tint +20 and ended up close to the original | Fit white balance to the photo's own cast only, with lower caps; a look's intended colour is never "corrected" | Now |
| 3 | P0 | Export | Finish preview is black (the frame copy came back empty under software rendering) | Fall back to an async read of the render when the copy is empty | Now |
| 4 | P0 | Home | Returning users scroll past a pitch to reach their photos | With edits present: headline and actions, then **your edits**, then rolls; the story moves to the end | Now |
| 5 | P0 | Looks | Previews too small and soft to sell a look | Render previews at twice the display size; larger phone frames; a sharper hold-to-preview | Now |
| 6 | P0 | Look library page | Looks are shown on a computer-generated test scene | Use the user's last photo, else the bundled sample | Now |
| 7 | P1 | Looks | "Editor's Picks" holds 51 looks; "All" is out of roll order | Picks become 4 all-rounders; "All" sorted by roll and frame | Now |
| 8 | P1 | Looks | A fresh photo gives no guidance on where to start | A first roll, **For this photo**, with six looks chosen from measured traits of the photo (section 6) | Now |
| 9 | P1 | Editor, phone | The photo moves when a look is applied | Reserve the Amount row's height | Now |
| 10 | P1 | Editor, phone | Look chip and its hint cover the bottom of the photo and the Remove toolbar | Hide the chip while a tool is active; shorten the hint to one short line shown once | Now |
| 11 | P1 | Editor, phone | The dock's More does nothing inside a More tool; Photos has no back chevron | More returns to the grid; Photos gets the chevron | Now |
| 12 | P1 | Crop | No cancel; Escape keeps the crop | Cancel button; Escape restores the crop from before the tool opened | Now |
| 13 | P1 | Light | No Auto | A measured one-tap **Auto** (section 6) | Now |
| 14 | P1 | Everywhere | Four vocabularies (looks, presets, rolls, categories) | "Look" and "roll" everywhere a user reads; "preset" stays only in file names and code | Now |
| 15 | P1 | Editor | Bars and rails are tinted by the ambient light, beside the photo | Near-neutral chrome in the editor (the light is kept, far weaker) | Now |
| 16 | P1 | Home | The particle hero renders the photo soft and blocky | Sharpen it (more particles, or settle onto the real image) | Now |
| 17 | P1 | Match a look | Result screen is 2,485 px tall on a phone; pipeline names and a model tag are shown; an extra "Analyse look" tap | Analyse on drop; photo, amount and save first; details collapsed | Medium |
| 18 | P1 | Match a look | A same-scene test (the sample exported with Velvet Slide as the reference) came back warmer and less saturated | Needs an evaluation set and tuning of the matcher's "keep 50% of this photo's brightness" default | Medium |
| 19 | P1 | Remove / Select object | Progress stalls at "28.1 MB of 28.1 MB"; "Selecting…" has no cancel | Say "Starting…" once bytes are in; add cancel to the second stage | Now (label), Medium (cancel) |
| 20 | P2 | Looks sheet | Search header keeps saying "every look · 186" while searching | Show the result count | Now |
| 21 | P2 | Editor, phone | Touch targets of 36–40 px (undo, redo, ⋮, the collection switch, roll tabs, save/remove look) | 44 px on coarse pointers | Now |
| 22 | P2 | Compare | "let go for … · 100" is bare text over the photo | Put it on a dark chip | Now |
| 23 | P2 | Light / Colour | Saturation and Vibrance sit under Light, in a group also called "Colour" | Rename the Light group to "Vibrance" on phones; full move is a larger change | Medium |
| 24 | P2 | Effects | Eight bare sliders | Tiles with live previews | Medium |
| 25 | P2 | Settings | Developer text ("npm run build", "Max texture size", model tags) | Plain wording; technical rows behind "Diagnostics" | Now |
| 26 | P2 | Home, Match | Two or three lilac buttons on one screen | One lilac action per screen, as DESIGN.md says | Now |
| 27 | P2 | Editor, desktop | No keyboard shortcut list | A "?" sheet | Medium |
| 28 | P2 | After Match | The chip reads "Reference look (matched)" after the look was saved under a name | Carry the saved name | Now |
| 29 | P3 | Import | A text file renamed .jpg is reported as "empty or truncated" | Say the file is not a photo | Medium |
| 30 | P3 | Import | HEIC is not supported | Needs libheif (owner skipped this for now) | Future |

---

## 3. Features and elements to remove

| Remove | Why | Status |
| --- | --- | --- |
| 145 of the 186 looks | Near-copies, clippers, skin-breakers, misnamed (full list in section 5) | Now |
| Six rolls: Close Up, Something Borrowed, Front Row, Postcards, Moss & Clay, Feed Ready | Their looks are merged into the eight that remain | Now |
| Look names borrowed from film brands or ending in "-Inspired" | Brand risk; replaced by original names | Now |
| The three-line "Fitted to this photo…" note | Engineering talk in the main flow; a small "fitted" mark and one short hint remain | Now |
| The second lilac button on home ("Match your own") | Breaks the one-accent rule | Now |
| GSAP (one entrance animation) | 73 kB in the first download for something CSS does | Now |
| Unused packages: `@react-three/fiber`, `class-variance-authority`, `jsdom` | Never imported | Now |
| 40 MB of duplicate ONNX runtime files in every build | Never requested by the app | Now |
| Dead CSS and code from the three earlier redesigns | `spec-1..5`, `glass`, `glass-strong`, `surface-glass`, `checker`, `density`, unused exports | Now |
| Developer rows in Settings | See problem 25 | Now |
| **Recommended, but your call** (you asked for these on 2026-11-14, so I have not removed them): the opening animation after the first launch, the 3D rolls ring, the custom cursor, decode-text headlines, the liquid-glass refraction | The review found them generic ("this year's futuristic kit") and at odds with "the photo leads". In this pass they are kept and made cheaper; removing them is one decision for you | Decision |
| Brightness slider (duplicates Exposure for most users) | Kept for now: existing edits and looks use it | Future |

---

## 4. Existing features to improve

| Feature | Today | Improvement | When |
| --- | --- | --- | --- |
| Look previews | 220 × 165 px renders, upscaled and soft in the grid and the hold preview | Twice the display size; cached as before | Now |
| Adaptive looks | Corrects white balance against the look's own colour, which can cancel the look | White balance from the photo's own cast only | Now |
| Kept and Last roll | Would silently lose entries when looks are renamed or removed | Old ids map to their replacement; unknown ids are pruned | Now |
| Save a look | Dialog says "preset" and lists 14 old categories | "Save look"; it goes to **Yours** | Now |
| Home | Hero, story, then your photos | Your photos first once you have any | Now |
| Editor chrome | Tinted by the photo | Near-neutral | Now |
| Crop | No cancel | Cancel and Escape | Now |
| Stability | No error boundary; storage failures leave blank screens | A recovery screen; guarded storage calls | Now |
| Match a look | Long result page, weak same-scene match | Shorter result page; matcher tuning with an evaluation set | Medium |
| Effects | Sliders only | Preview tiles; effects used by looks (done in the new library) | Medium |
| Tone engine | Highlights clip to flat white when pushed | A soft highlight shoulder in both renderers | Medium |
| Grain | Reads as digital blobs | Finer, shadow-weighted grain with a little colour | Medium |
| Colour grading | The same tint at every brightness, so dark skin shifts hue under teal shadows | Fade tints near black and white; protect skin | Medium |
| Black and white | Cannot be toned with the wheels (grading runs first) | Monochrome before grading | Medium |

---

## 5. Looks: keep, remove, replace

### What the measurements showed

- Rendered at 100% on the sample: 45 looks under 2.5 ΔE from the original, 93 under 3.5.
- Clustered at 2 ΔE: 186 looks → 107 groups. At 3 ΔE: 75 groups.
- One cluster holds ten interchangeable looks (Velvet Hour, Honey Light, Alpine Air, Creator Clean
  Pop, Cashmere Neutral, True Skin Studio, Beauty Neutral, Garden Ceremony, Windowlight Poet, Soft
  Flash Diary). Creator Clean Pop sits 0.9 ΔE from the original: it does nothing.
- **Clips highlights**: Snow and Ice, Clean Bright Lifestyle, Icy Blue, Warm Minimalism, Dreamy Glow
  and fifteen more.
- **Crushes shadows**: Bleach Bypass (+17.8% of pixels), High-Contrast Street, Epic Landscape Pop,
  Gritty Street, Cyberpunk Neon and ten more.
- **Breaks skin**: green (Cold Thriller, Moody Forest), magenta or purple (Cyberpunk Neon, Icy Blue,
  Steel Blue), grey (Bleach Bypass, Nordic Winter), orange (Golden Hour at 1.53× skin saturation).
- **Misnamed**: Silver Screen and Runway Black are full colour; Duotone Velvet is not a duotone;
  Infrared Garden is not infrared; nothing in Flash at Midnight uses flash.

### The new collection: 41 looks, 8 rolls

Every look below was rendered and checked: no added highlight clipping on the sample (or on a
brightened copy of it), skin patches within ±8° of hue for medium tones (±15° deep, ±12° fair), and
at least 2 ΔE from every other look. 5 are kept as they were, 29 are retuned, 7 are new.

| Roll | Looks |
| --- | --- |
| **01 Editor's Picks** (clean, true colour) | **Daylight** (new: the everyday fix), Clean Studio, Vivid Postcard, Velvet Slide |
| **02 Basement Summer** (colour film) | Sunday Negative, **Open Shade** (new: soft portrait negative), Green Room, Classic 35mm, Expired Summer, Retro 70s |
| **03 Late Showing** (cinema) | Teal and Orange, Warm Film Cinema, Neo-Noir Emerald, Midnight Cinema, **Tungsten Hours** (new: halation and bloom), Silver Retain |
| **04 Blue Hour Tapes** (cool, pastel) | Airy Blue Film, Blue Hour, Rainy Day Blue, Powder Blue, **Sherbet** (new: soft pastel) |
| **05 Soft Static** (matte, earthy) | Faded Film, Creamy Beige, Moss, Cocoa, Dark Academia |
| **06 Golden Minutes** (warm sun) | Golden Hour, Mediterranean Summer, Peach Soft Light, Autumn Mood |
| **07 Flash at Midnight** (flash, night) | **Pocket Flash** (new: 2000s digicam flash with colour fringes), Analog Flash (now uses real flash falloff), Disposable Camera, Night Neon (bloom and halation), Sodium Streetlight, Gritty Street |
| **08 Monochrome Diary** | Classic Monochrome, Silver Gelatin, Soft Matte B&W, **Newsprint** (new: hard, grainy), **Tea Stain** (new: warm-toned) |

Renamed for originality: Portra-Inspired Warm Film → Sunday Negative; Fuji-Inspired Natural Film →
Green Room; Bleach Bypass → Silver Retain; Vibrant Travel → Vivid Postcard; Muted Forest → Moss;
Moody Chocolate Brown → Cocoa; Expired Summer Gold → Expired Summer.

Common changes in the retunes: no positive Whites, exposure at most +0.25, a curve white point of
0.96–0.99 so highlights roll off, Blacks no lower than −10, vignette no stronger than −22, highlight
tints moved from yellow-green (65–90°) to amber (40–55°), shadow tint strength capped near 30.

### Removed (145)

Every removed look is either merged into a kept one or cut. Merges (the kept look covers the idea):
Golden Portrait Negative, Warm Grain, Earthy Travel → Sunday Negative · Airy Pastel Negative, Coastal
Film, Soft Editorial Skin → Open Shade · Cinema Tungsten 500, Cool Shadows → Tungsten Hours ·
Blockbuster Teal & Amber, Concrete Teal, Teal & Amber Reserve → Teal and Orange · Midnight
Blockbuster, Neo-Noir Rain, Deep Atmosphere → Midnight Cinema · Soft Memory, Sage Matte, Dusty Rose
Film, Washed-Out Wonder, Soft Cinematic Fade, 35mm Nostalgia, Bone Matte Editorial → Faded Film ·
Golden Skin, Soft Gold, Desert Warmth, Bronze Glow, Golden Hour Glow → Golden Hour · Storybook
Pastel, Soft Pastel Dream → Sherbet · Tropical Greens, Epic Landscape Pop → Vivid Postcard · Y2K
Flash → Pocket Flash · Direct Flash Editorial → Analog Flash · Cyberpunk Neon, Electric Night → Night
Neon · Couture Monochrome → Silver Gelatin · Platinum Noir → Classic Monochrome · Hard Light Noir →
Newsprint · Soft Mono Poetry → Soft Matte B&W, and the rest listed in the looks audit.

Cut outright (too weak, clipping, or skin-breaking): the 36 near-original looks (Silver Screen,
Runway Black, Black Tie, Obsidian Cinema, Velvet Hour, Porcelain Light, Clean Lux, Noir Emerald,
Arctic Dream, Analog Poetry, Editorial Afterglow, Cold Open, Romantic Thriller, Sunset Credits, Warm
Negative, Cool Lab Print, Faded Chrome, Copper Grain, Pale Blue Hour, Glacier Glow, Blue Porcelain,
Winter Silence, Mist & Milk, Cashmere Neutral, Museum Light, True Skin Studio, Softbox Cream, Bronze
Sculpt, Honey Light, Amber Glass, Sunlit Linen, Last Light 35, and the earthy, wedding and street
rolls), plus Icy Blue, Snow and Ice, Steel Blue, Nordic Winter, Cold Thriller, Moody Forest,
Chiaroscuro, Dark Cinematic Portrait, Dreamy Glow, Clean Bright Lifestyle, Warm Minimalism, High-End
Fashion and the other clippers.

**Safety of the change**: a photo already edited with a removed look keeps its exact settings (an
applied look stores its own values). Kept and Last roll entries move to the replacement look where
one exists. Looks you saved yourself are untouched, in whichever category they were saved.

---

## 6. New features worth building

Each has to earn its place: a clear purpose, real function, no fake controls.

| Feature | What it does | Why people will like it | How it works | Look and feel | Size | When |
| --- | --- | --- | --- | --- | --- | --- |
| **For this photo** | Six looks chosen for the open photo | A beginner gets a good first tap instead of 41 choices | A 2,500-pixel sample gives plain traits (dark, bright, flat, hard light, warm, cool, muted, colourful, greens, blues, a face). Each look lists the traits it suits; the best matches come first, two per roll at most. No AI | The first roll in the Looks sheet, named "for this photo", with the measured traits in small type ("dark · warm") | Small | **Now** |
| **Auto** | One tap balances exposure, white balance, highlights, shadows, contrast, black point and vibrance | Every competitor opens with it; it is the fastest route to "better" | Measured from the photo with fixed rules; sets ordinary sliders, so everything stays editable; pressing twice changes nothing; on top of a look it sets tone only | An "Auto" button at the top of Light; the changed sliders light up lilac as usual | Small | **Now** |
| **Looks that use effects** | Flash, halation, bloom, fringe and dreamy blur inside looks | Looks with a real character (Pocket Flash, Tungsten Hours, Night Neon) | Already supported by the engine; the new library uses them | — | Done with the library | **Now** |
| **Effect tiles** | Effects as preview tiles, not eight sliders | Visual choice, like the looks | Reuse the look-preview renderer per effect | A grid of tiles; tap to add, slide for strength | Medium | Medium |
| **Fade slider** | One control for a matte look | A staple of VSCO-style editing; today it needs the curve | New schema control, both renderers, tests | In Light → Tone | Small–medium | Medium |
| **Social export sizes** | 4:5, 9:16 and 1:1 with blurred or solid fill | Posting is the end of most edits | Exporter option; preview in Finish | Three chips in Finish | Medium | Medium |
| **Shortcut sheet** | "?" lists the keys | Enthusiasts expect it | Static dialog from the existing shortcut table | A quiet two-column dialog | Small | Medium |
| **Look strength above 100%** | Push a look harder | Timid looks become bold on demand | Extrapolate the blend with clamping | Amount runs to 150 | Small | Medium |
| **Batch "sync look"** on phones | One look across a set, fitted per photo | Photo dumps look consistent | Exists on desktop; surface it in Photos | A "Sync to all" action | Small | Medium |
| **Frames, text, stickers; look links and QR; reveal video; camera** | As in `docs/ROADMAP.md` 2.6–2.10 and 3.x | Sharing and habit | See roadmap | Finish step | Large | Future |
| **HEIC and RAW** | Open iPhone and camera files | Removes the most common "can't open" | libheif / LibRaw in WASM (needs your OK on the libraries) | — | Medium–large | Future |
| **Auto masks for sky and subject from one tap, AI denoise** | Lightroom-class local edits | Enthusiast parity | BiRefNet (214 MB, needs your OK) | — | Large | Future |

---

## 7. Animation and micro-interactions

Keep: the afterimage when a look lands, hold to compare, the sheet springs, the haptic tick on
Android, the slider fill gliding when a look lands.

| Change | Why |
| --- | --- |
| The opening animation plays in full once, ever; later opens are under a second (already so) and skippable | A tool should open to work |
| Slider readouts stop counting up while you drag Amount | Ten to fifteen sliders re-rendered every frame during a drag |
| The home entrance moves from GSAP to CSS | Same motion, 73 kB less, and it now respects the in-app motion setting |
| The hero's render loop stops when nothing moves | Battery on phones |
| Liquid-glass refraction off on touch devices and in the editor | It runs a layout read on every pointer move for an effect nobody sees there |
| The applied-look check and star keep their small springs | Purposeful feedback |
| New: the "for this photo" roll fades its six tiles in as the measurement finishes (no layout shift) | Says "we looked at your photo" without a spinner |
| New: Auto animates the sliders it changed (the existing fill glide) | Shows exactly what Auto did |

Rule kept from DESIGN.md: nothing the user taps may move the photo. The phone Amount row broke it and
is fixed in this pass.

---

## 8. Performance and bundle size

Measured on the production build:

| Item | Today | Plan |
| --- | --- | --- |
| First download (home) | 874 kB entry chunk (276 kB gzip) + three.js 516 kB loaded at once ≈ 1.4 MB raw | Remove GSAP (−73 kB); the look library shrinks from 151 kB of source to about 30 kB; three.js stays lazy |
| Build output | 40 MB of duplicate ONNX runtime files | Dropped at build time |
| Match a look | A synchronous GPU read on every frame (against AGENTS.md) | Async reads |
| Editor re-renders | The whole viewport and every overlay re-render on each slider tick (fresh size objects every frame) | Keep object identity when sizes are unchanged |
| Looks grid | Every card re-renders when the applied look changes (unstable callbacks); "All" mounted 186 cards | Stable callbacks; 41 cards |
| Masks | `JSON.stringify` of every layer on every frame | Cache by array identity |
| Preview cache | Counts the store after every write | Count every 50 writes |
| Dependencies | Three unused packages | Removed |

Medium priority: split the render engine out of the entry chunk (home only needs eight roll covers),
precache only the latin fonts, stop shipping source maps to the host, handle a restored WebGL context
(phones lose it when the app is backgrounded; today the editor stays on the slow CPU path).

---

## 9. Design direction

**Keep "Afterimage"; make "Lit" serve it.** The identity that is yours is the quiet one: night-black
chrome, ivory type, one lilac accent with its hard offset, mono frame numbers, the orange date stamp.
The glass-and-particles layer added on top is where the app starts to look like everything else, and
it is where the photo stops being the hero.

Principles for this pass and the next:

1. **The looks are the product.** They get the pixels: bigger, sharper previews, fewer and bolder
   looks, a first roll made for the photo in front of you.
2. **Your photos first.** Home leads with your edits once you have any.
3. **Neutral beside the photo.** Editing chrome is near-black and uncoloured.
4. **One word per thing.** Look, roll, Kept, Yours.
5. **One lilac action per screen.**
6. **Motion confirms; it does not perform.** Anything that moves on its own has to be telling the user
   something.

Nothing in this pass changes the palette, fonts, wordmark or the three analog props.

---

## 10. Roadmap

### High priority (this pass)

1. Replace the look library with the 41 curated looks in 8 rolls; migrate Kept and Last roll; update
   tests and documents.
2. "For this photo" roll.
3. Auto in Light.
4. Adaptive white balance no longer cancels a look.
5. Sharper, larger look previews; the look library page uses a real photo.
6. Home: your edits first; sharper hero; GSAP out.
7. Editor fixes: neutral chrome, photo no longer shifts, crop cancel, dock More, look chip, export
   preview, touch targets, search count, compare chip, one vocabulary, one lilac action.
8. Engineering: error boundary, storage guards, build size, re-render fixes, dead code and unused
   packages.
9. Test everything; second audit (`POST_IMPLEMENTATION_AUDIT.md`).

### Medium priority (next)

- Match a look: shorter result page, analyse on drop, an evaluation set and matcher tuning.
- Engine: highlight shoulder, better grain, tint fade and skin protection, monochrome before grading,
  a Fade slider (each in both renderers with tests).
- Effect tiles; social export sizes; shortcut sheet; look strength to 150%; phone "sync look".
- Cancel for Select object; WebGL context restore; engine out of the entry chunk.
- Move Saturation and Vibrance to Colour.
- A real-phone check on Android and iPhone (needs an HTTPS host, still your choice).

### Future

- Frames, text and stickers; look links and QR; reveal video; camera with live looks.
- HEIC and RAW import (needs your OK on libheif and LibRaw).
- BiRefNet subject masks (214 MB, needs your OK); range masks; perspective correction; versions.
- Sample photography: the app has one licensed photo. Three or four more (a portrait, a night scene,
  a landscape) would let looks be judged and shown properly.

### Decisions that are yours

1. Remove or keep the showpieces you asked for on 2026-11-14 (opening animation on later opens, 3D
   rolls ring, custom cursor, decode text, liquid glass). The review recommends removing them.
2. Roll numbers were documented as fixed; with six rolls retired I renumbered the remaining eight
   01–08. Say if you would rather keep the old numbers with gaps.
3. Names of the seven new looks and seven renamed ones (section 5) are proposals.
