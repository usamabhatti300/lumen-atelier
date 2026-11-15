# Lumen Atelier: looks, portrait retouching and editing experience audit

_2026-11-15. Audit only: no application code was changed. Based on commit `88d76f9`._

## How this audit was done, and its limits

- **Looks:** I read all 54 definitions in `src/lib/presets/library.ts` and rendered each one with
  the app's own colour maths (`renderPixels`, the CPU reference of the shader) on 31 test colours:
  five skin tones, sky, foliage, primaries and a ten-step grey ramp. From that I measured black and
  white points, mid-tone brightness, contrast, colour casts, how each look moves skin, sky and
  foliage, and how far every look is from every other look. The numbers are in section 3.
- **Portrait, masks, blur, effects:** read from the code (schema, both renderers, MediaPipe and
  depth code, the panels). Findings carry file references.
- **What this does not cover.** The measurements are colour only: grain, vignette, fringe, bloom,
  halation, flash, soft focus, clarity and texture are spatial and are judged from their
  parameters, not measured. Looks were measured at 100% with adaptive fitting off. I did not view
  the looks on a set of real photographs in this pass, because the project has no evaluation set
  (see 6.1). Items marked _(inferred)_ come from reading the maths and were not reproduced in the
  running app. Every merge below should be confirmed by eye before a look is deleted.

Units used in the tables:

- **Distance** is the mean OKLab difference across the 31 test colours, ×100. Under about 2.0,
  two looks are hard to tell apart on colour alone.
- **Skin hue** is the shift in degrees for light / medium / dark skin. Plus is toward
  yellow-green, minus toward red-magenta. Beyond about ±6° a face starts to look wrong.
- **Skin chroma** is the ratio to the original. 1.30 means skin is 30% more saturated.

---

## 1. Executive summary

**The product vision is right, and the engine can carry it. The current content does not yet.**

1. **The look library is wider than it is deep.** Of 54 looks, 17 are colour-wise near-copies of
   another look and differ mainly by grain or an effect. The closest pair, Mall 2004 and Sunday
   Negative, is 1.3 apart. Three of the four trend rolls added on 2026-11-14 are affected most.
   A collection of 30 distinct looks plus a small experimental shelf would be stronger than 54.
2. **Skin is the weakest part of the looks.** Twelve looks push skin saturation up by 28–42% on
   at least one skin tone (Disposable Camera, Golden Feed, Cocoa, Vivid Postcard, Sodium
   Streetlight, Teal and Orange, Pool Party, Golden Hour, Mediterranean Summer, Warm Film Cinema,
   Velvet Slide, CCD Daylight). Nine colour looks shift skin hue by 10° or more (Lofi Dusk,
   Rooftop Pink, Airy Blue Film, Midnight Cinema, Blue Hour, Arcade, Green Room, Neo-Noir Emerald,
   Mall 2004). The engine has only a partial skin guard (60%, on
   Vibrance only), so every look fights skin by hand with the orange band.
3. **Adaptive fitting only fits exposure and white balance.** It ignores contrast, saturation,
   skin and where the face is. A look made for a flat photo is applied unchanged to a harsh one.
4. **Portrait retouching is a first version.** Six sliders, one mask for all faces that the user
   can neither see nor correct, no even-tone, redness, shine or lip controls. It has two real
   bugs: heal spots after the 32nd are saved but never drawn, and skin smoothing puts back part of
   a healed blemish. It runs on the GPU only.
5. **Blur is three separate systems that do not know about each other.** Lens blur (depth, good),
   "Background blur" (a plain Gaussian that bleeds the subject into the background), and the new
   motion effects (whole image, fixed 12° angle). No blur except the mask-layer Gaussian can be
   limited to a region. There is no radial or zoom blur.
6. **Nine of eleven effects have one slider and fixed everything else.** Light leak is always on
   the right with the same shape, lens flare always top right, motion blur always 12°.

**What to do, in order:** fix the bugs (days); build an evaluation photo set; cut and rework the
looks to 30; extend adaptive fitting with skin and contrast; rebuild portrait retouching around a
three-band skin model with visible, correctable masks; unify the blurs around one selection system;
then add positions and directions to effects. None of the first five phases needs a new library or
model.

---

## 2. Current implementation audit

### 2.1 Looks and colour engine

| Area | What exists | Weakness |
| --- | --- | --- |
| Look format | Partial adjustment sets; Amount 0–150%; tests enforce house rules | Rules cover clipping and blacks, not skin or distinctness. No test compares looks with each other. |
| Colour stage (`pixel.ts:103-146`) | OKLab HSL bands, vibrance, saturation, 3-way grading, monochrome | Grading adds a fixed tint by brightness zone with no skin exemption. Monochrome runs after grading, so a black-and-white look cannot be split-toned (Tea Stain and Night Shot work around it with RGB curves). |
| Skin protection | Vibrance is reduced by 60% near skin hue (`pixel.ts:119-123`) | Saturation, temperature, tint and grading have none. That is why warm looks over-saturate faces. |
| Tone | Parametric highlights/shadows, contrast, master curve applied per channel | Per-channel curves raise saturation with contrast. No film-style highlight desaturation. |
| House rules | Header of `library.ts` | Four looks break "no positive whites" (Midnight Cinema, Rainy Day Blue +4; Silver Gelatin, Soft Matte B&W +2). Creamy Beige breaks the warm-tint rule (highlight tint at 70°, rule says 40–55°). Airy Blue Film and Blue Hour have no white-point protection. |
| For this photo (`recommend.ts`) | Six picks from measured traits and hand-written `suits` tags | No negative signal: a look that damages skin can still be picked for a photo with a face. |

### 2.2 Adaptive fitting (`src/lib/analysis/lookAdapt.ts`)

- Samples 2,500 pixels of the photo.
- **Exposure:** moves the photo's median brightness half-way toward the look's brightness on a
  neutral grey ramp, capped at ±1 EV, with guards on the top 0.5% and 3% and the bottom 0.5%.
- **White balance:** removes half of the photo's own cast, measured on its least colourful quarter.
- The result is three slider offsets (exposure, temperature, tint). Nothing else adapts.

### 2.3 Portrait retouching

- **Detection:** MediaPipe Face Landmarker (478 points, up to 6 faces) and Selfie Multiclass
  256×256 segmentation, in a worker, on a 1280 px copy. Results are not saved; they are recomputed
  every session.
- **Mask:** one RGBA texture for all faces: skin, teeth, iris, under-eye (`faceMask.ts:126-222`).
- **Controls:** Skin smoothing, Keep texture, Under-eye, Eyes, Teeth whitening, Face light, Spot
  healing (`adjustments.ts:375-393`).
- **Rendering:** one GPU pass (`shaders.ts:235-347`). There is no CPU version, which breaks the
  project's own rule that pixel maths lives in both renderers.

Problems found:

| Problem | Where | Effect |
| --- | --- | --- |
| Spots after the 32nd are never drawn | Store keeps 64 (`editorStore.ts:543`), renderer sends the first 32 (`renderer.ts:328`) | The user heals a 33rd blemish, sees the ring, and nothing happens. Confirmed in code. |
| Smoothing undoes healing | Smoothing samples the unhealed image (`shaders.ts:251-271`) | Part of a healed blemish comes back when smoothing is on. _(inferred)_ |
| Skin smoothing is two bands, not three | Only the finest detail is restored | Texture between pore size and blotch size is removed. This is the "plastic" look at high strength. |
| No colour evenness | Smoothing works on brightness only | Red patches and uneven tone survive smoothing. The slider hint says it "evens tone"; it does not. |
| Iris mask ignores eyelids | `faceMask.ts:169-181` | Eye enhancement brightens the lid over a half-closed eye. |
| Under-eye region does not rotate | `faceMask.ts:183-197` | On a tilted head the correction sits in the wrong place. |
| Under-eye lowers saturation | `shaders.ts:316-321` | Can leave a grey patch instead of matching the cheek. |
| Face light is a flat gain | `shaders.ts:341-344` | Brightens the face evenly; no direction, no shape. |
| One slider set for all faces | Global uniforms | Cannot retouch one person and leave another. |
| Mask is invisible and fixed | No overlay, no editing | When detection is wrong (beard, glasses, hand on face) the user has no fix. |
| Skin stops at the face oval | Mask is the face outline × skin segmentation | Neck and shoulders keep their texture; the join shows. |

Absent, confirmed by search: uneven skin tone, redness, shine reduction, lip controls, per-region
colour, dodge and burn as a tool, face reshaping.

### 2.4 Masks

- Five component types: brush, linear, radial, automatic (subject, background, hair, skin,
  clothes) and Select object (SlimSAM). Components add or subtract. No intersect.
- Each layer has 12 local adjustments, opacity and invert.
- **No refine controls after creation:** no feather, expand, contract or edge refinement. The
  radial tool always makes a circle with 50% feather; the schema supports ellipse, rotation and
  feather but no UI edits them.
- Segmentation edges are upscaled from a 256 px model with plain smoothing. Hair edges are soft and
  approximate.
- **Masks only drive local adjustments.** Effects, lens blur, portrait tools and the global edit
  cannot be limited by a mask.
- On phones, pinch-zoom and pan are switched off while any tool is active (`Viewport.tsx:134-136`),
  so the user cannot zoom in to brush or heal.

### 2.5 Blur and depth

| Blur | How it works | Limits |
| --- | --- | --- |
| **Lens blur** (Detail) | Depth Anything V2 Small → refined depth → disc gather with occlusion rules and highlight boost. Tap to focus. Mirrored on CPU. | Good core. In-focus range is fixed. Disc bokeh only. Depth stored in 8 bits. Depth is computed from the original, so removed objects still shape it. The person is kept sharp only by flattening their depth, not by a mask. |
| **Background blur** (Portrait) | Creates a mask layer with a Gaussian of the whole image mixed in by the background mask | Subject colours bleed into the background near the edge (halo). Not depth-aware. At its default 55 it leaves 17.5% of the sharp image showing through. GPU only. |
| **Motion blur, Shutter drag** | 16×16 tap streak | Whole image only, angle fixed at 12°. |
| **Soft focus, Dreamy blur, Bloom** | Mix toward one of two shared blurs | Three effects built from the same two blurs with fixed radii; they overlap. |
| Radial, zoom, spin, tilt-shift | Do not exist | |

Lens blur and Background blur can both be on at once and nothing warns or prevents it; the
background is then blurred twice.

### 2.6 Effects

Every effect in the Effects panel is one strength slider. Vignette (4 sliders) and grain (3) are
the only ones with more. Fixed values are listed in section 9.

---

## 3. Look-by-look evaluation (all 54)

"Nearest" is the most similar other look by colour, with the distance.

### 01 Editor's Picks

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Daylight | **Keep** | 1.9 | 1/0/−1 | 1.05/1.12/1.20 | Honest everyday lift: opens shadows, holds whites at 0.99, neutral. Subtle by design. Dark skin gains 20% saturation; trim vibrance. Overlaps with Auto in purpose, which is acceptable for a starting look. |
| Clean Studio | **Replace** | 1.9 | 1/−1/−2 | 0.94/1.01/0.97 | The "touch cool" is not measurable (cast 0.001). In practice it is a contrast curve and −5 saturation. No identity. Replace with a real high-key editorial look (5, "Studio White"). |
| Vivid Postcard | **Improve** | 2.6 | 2/0/−1 | 1.28/1.33/1.39 | Right idea, but vibrance 38 plus saturation 10 hits faces as hard as skies. Move the punch into the blue, aqua and green bands and drop global saturation. Nearest: CCD Daylight and Pool Party, both 1.9. |
| Velvet Slide | **Keep** | 3.6 | −1/−1/−2 | 1.29/1.26/1.25 | Dense, dark-blue slide character that nothing else has. Pull orange saturation down so skin stays under +15%. |

### 02 Basement Summer (film)

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Sunday Negative | **Keep** | 2.9 | 4/0/−1 | 1.11/1.12/1.14 | The best warm film look: gentle contrast, muted greens and blues (0.74, 0.78), kind to skin. Flagship. |
| Open Shade | **Keep** | 4.3 | 0/1/0 | 1.02/1.02/1.09 | Best skin behaviour in the library. Soft, lifted, cyan in the shadows. |
| Green Room | **Improve** | 2.1 | 4/4/11 | 0.96/0.97/0.85 | The green shadow lean is good, but the lifted green curve pushes dark skin 11° toward green and desaturates it: sallow. Keep the tint out of skin. Absorbs Rainy Day Blue. |
| Classic 35mm | **Keep** | 4.1 | 5/−1/−2 | 1.19/1.21/0.99 | The contrastiest colour look (slope 1.34) with real grain. Dark skin loses 0.07 lightness; ease the low end of the curve. |
| Expired Summer | **Merge** → Retro 70s | 2.6 | 7/−2/−7 | 1.24/1.22/1.10 | Nearest is Warm Film Cinema at 1.8. Splits skin hue in opposite directions for light and dark skin. One aged-print look is enough. |
| Retro 70s | **Improve** | 6.0 | 9/3/1 | 1.12/0.99/1.03 | Strong identity, weak execution: the strongest highlight tint in the library (0.039), skies drained to 31%, flat (slope 0.72, white 0.93). Reads as muddy. Keep the amber, restore contrast and some blue. |

### 03 Late Showing (cinematic)

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Teal and Orange | **Improve** | 2.2 | 3/−1/1 | 1.37/1.29/1.12 | For "the blockbuster grade" it barely moves a photo, and what it does move is skin saturation (+37% on light skin). The teal lives only in deep shadows. Needs more separation in the mid-tones and less on faces. |
| Warm Film Cinema | **Keep** | 2.8 | 4/−2/−3 | 1.31/1.25/1.23 | Coherent amber cinema grade. Temperature +18 is doing too much on skin; move some warmth into grading. |
| Neo-Noir Emerald | **Experimental** | 5.2 | 7/7/11 | 0.96/0.95/0.84 | Striking on night streets. On people it is green, dull and dark: they look ill. Not a main-collection look. |
| Midnight Cinema | **Merge** → Tungsten Hours | 3.2 | −7/−6/−14 | 1.10/0.96/0.69 | Same idea as Tungsten Hours (blue night, warm lights). Dark skin turns grey-magenta (−14°, 69% chroma). |
| Tungsten Hours | **Keep** | 2.6 | −6/−3/−5 | 1.23/1.06/0.89 | The night-film look, with halation doing real work. Temperature −22 makes it a night-only look; it needs fitting by lighting (6.5). |
| Silver Retain | **Keep** | 5.5 | 6/5/7 | 0.49/0.47/0.40 | Clear bleach-bypass identity. Absorbs Gritty Street. |

### 04 Blue Hour Tapes (cool and pastel)

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Airy Blue Film | **Improve** | 3.9 | −6/−8/−15 | 0.67/0.72/0.78 | Exposure +0.25 with no master curve: white reaches 1.000, so bright photos clip. Skin goes pale pink-grey. Add white-point protection and keep the blue out of skin. Absorbs Powder Blue. |
| Blue Hour | **Merge** → Lofi Dusk | 2.7 | −7/−6/−12 | 1.05/1.02/0.95 | No tone curve at all. Sits 2.4 from both Lofi Dusk and Tungsten Hours. Four "cold night with warm lights" looks is three too many. |
| Rainy Day Blue | **Merge** → Green Room | 2.5 | 3/1/1 | 0.66/0.73/0.61 | Well made and safe on skin, but 2.3 from Green Room. One cool, muted, overcast look should carry both. |
| Powder Blue | **Merge** → Airy Blue Film | 6.7 | −5/−3/−6 | 0.53/0.63/0.68 | Same bright pale-blue idea as Airy Blue, with skin drained to 53%. |
| Sherbet | **Keep** | 6.9 | −4/−1/−1 | 0.93/0.98/1.10 | The clearest pastel identity in the library, and skin stays believable. |

### 05 Soft Static (matte and earthy)

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Faded Film | **Keep** | 6.0 | 0/0/0 | 0.73/0.70/0.69 | The reference matte fade, and neutral on skin hue. Absorbs Blog Matte and Creamy Beige. |
| Creamy Beige | **Merge** → Faded Film | 5.8 | 4/2/2 | 0.94/0.89/0.96 | 2.4 from Faded Film. Highlight tint at 70° makes whites yellow-green, against the house rule. Sky drops to 35%: everything that is not skin goes beige-grey. |
| Moss | **Experimental** | 6.0 | 2/0/2 | 0.67/0.63/0.61 | Only desaturates and darkens (white 0.92, overall chroma 57%). Works on forests and nothing else. |
| Cocoa | **Improve** | 5.2 | −2/−4/−7 | 1.23/1.21/1.40 | Real identity: the strongest shadow tint in the library (0.035). Dark skin gains 40% saturation and turns red-brown; foliage swings 28°. Protect skin. Absorbs Dark Academia. |
| Dark Academia | **Merge** → Cocoa | 7.8 | 1/−4/−1 | 1.02/0.83/0.72 | The darkest look (mid-grey at 0.38, white 0.92); every skin tone loses 0.07 lightness. Dim and muddy rather than moody. |

### 06 Golden Minutes

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Golden Hour | **Improve** | 2.3 | 4/1/2 | 1.36/1.18/1.26 | The description promises "without turning skin orange"; light skin gains 36% saturation. Temperature +22 is too blunt. Put the gold in highlights and leave skin near +10%. Absorbs Golden Feed. |
| Mediterranean Summer | **Merge** → Vivid Postcard | 1.8 | 2/1/0 | 1.35/1.19/1.19 | The least visible colour look in the library, and 1.8 from Teal and Orange, 2.1 from Vivid Postcard and Golden Hour. |
| Peach Soft Light | **Keep** | 6.5 | 2/2/2 | 1.18/1.10/1.14 | Distinct soft, lifted peach with stable skin hue across tones. Absorbs Cali Haze. |
| Autumn Mood | **Experimental** | 4.6 | 0/−1/−1 | 1.10/0.97/0.99 | Clever (turns greens to rust) and safe on skin, but it only does something when the photo has foliage. Shelf it as a scene effect. |

### 07 Flash at Midnight

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Analog Flash | **Merge** → Disposable Camera | 2.3 | 4/0/−2 | 1.15/1.20/1.22 | 2.0 from Pocket Flash and uses the same flash effect at nearly the same strength (32 vs 34). A disposable camera is a flash camera: give Disposable the flash. |
| Disposable Camera | **Improve** | 3.8 | 9/−1/−2 | 1.38/1.42/1.27 | The right trend look, but faces go yellow-orange (+9°, +42%). Vignette −22 at midpoint 35 is heavy. Fix skin, add flash. |
| Night Neon | **Merge** → Arcade | 3.3 | −6/−4/−9 | 1.12/1.18/1.14 | 1.7 from Arcade. One neon look. |
| Sodium Streetlight | **Keep** | 4.1 | −2/−1/2 | 1.38/1.16/0.99 | Orange lamps against teal shadows with heavy grain: a clear night-street identity. Trim light-skin saturation. |
| Gritty Street | **Merge** → Silver Retain | 3.8 | 0/−2/−2 | 0.93/0.86/0.81 | Drained, textured, contrasty: the same job as Silver Retain with less commitment. |

### 08 Monochrome Diary

Skin columns do not apply. Measured on tone.

| Look | Verdict | Tone | Assessment |
| --- | --- | --- | --- |
| Classic Monochrome | **Keep** | slope 1.33, black 0.02 | Balanced, darkens skies, brightens skin. The default black and white. |
| Silver Gelatin | **Merge** → Newsprint | slope 1.26 | Sits between Classic Monochrome and Newsprint in tone and grain. Three hard black-and-whites is one too many. |
| Soft Matte B&W | **Keep** | slope 0.82, black 0.07 | The gentle one; flattering for portraits. |
| Newsprint | **Keep** | slope 1.47, grain 46 | The hardest, grainiest look in the app. Tonally 2.0 from Classic Monochrome, so its identity is the grain: keep it heavy. |
| Tea Stain | **Experimental** | slope 0.90, warm tone | Well made, but a sepia tone is a niche taste. Becomes a main look only if the engine gains real split-toning for monochrome. |

### 09 Pocket Digicam

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Pocket Flash | **Improve** | 2.6 | 1/−2/−5 | 1.05/1.17/1.18 | The trend look of the moment, but it is 1.9–2.0 from Arcade, Analog Flash and Night Neon. Commit harder to the digicam signature: cooler, flatter, harder highlights. |
| CCD Daylight | **Improve** | 3.2 | −1/−3/−5 | 1.18/1.26/1.28 | Colour-wise a vivid look with fringe: 1.5 from Pool Party, 1.9 from Vivid Postcard. Needs what a CCD actually did: limited range, cool-magenta bias, hard digital edges. |
| Mall 2004 | **Replace** | 2.7 | 10/3/2 | 0.98/1.00/1.02 | 1.3 from Sunday Negative, the closest pair in the library. Its green cast is 0.005 at mid-grey: almost not there. Rebuild it properly as a fluorescent-light look on the experimental shelf. |
| Blue Screen | **Experimental** | 3.7 | −1/−1/−3 | 0.67/0.80/0.82 | A deliberate wrong-white-balance look. Fun, not a main look. |

### 10 2016

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Golden Feed | **Merge** → Golden Hour | 4.0 | 4/0/−1 | 1.28/1.35/1.41 | Warm, saturated, lifted. Dark skin +41%. The lifted black is its only difference from Golden Hour. |
| Blog Matte | **Merge** → Faded Film | 3.3 | 3/−2/−6 | 0.82/0.94/0.75 | The heaviest matte (black 0.125, white 0.92). A cool variant of Faded Film. |
| Cali Haze | **Merge** → Peach Soft Light | 5.1 | −2/−1/−2 | 1.11/1.05/1.14 | 1.7 from Open Shade, 2.1 from Peach Soft Light. |
| Pool Party | **Merge** → Vivid Postcard | 3.3 | 7/−1/−3 | 1.19/1.37/1.33 | 1.5 from CCD Daylight, 1.9 from Vivid Postcard. |

### 11 Camcorder

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Home Video | **Keep** | 6.1 | 5/6/8 | 0.68/0.72/0.76 | The flattest look (slope 0.65, white 0.92), with soft focus and fringe giving a real tape feel. Skin drifts green; ease the tint. |
| Tape Sunset | **Merge** → Rooftop Pink | 4.0 | −2/−1/−2 | 1.19/1.08/1.12 | 2.1 from Rooftop Pink. One pink-dusk look. |
| Night Shot | **Experimental** | 13.2 | n/a | n/a | Green night-vision novelty. The most different look in the library and the least generally useful. |

### 12 Lofi Dusk

| Look | Verdict | Distance | Skin hue | Skin chroma | Assessment |
| --- | --- | --- | --- | --- | --- |
| Lofi Dusk | **Keep** | 3.9 | −11/−11/−18 | 1.10/1.07/0.98 | Strong purple-dusk identity with halation. The magenta skin is part of the look, but −18° on dark skin is too far. Absorbs Blue Hour. |
| Rooftop Pink | **Improve** | 3.1 | −16/−8/−5 | 1.15/1.05/1.05 | Tint +18 across the whole image turns light skin pink (−16°). Put the pink in highlights and sky. Absorbs Tape Sunset. |
| Arcade | **Keep** | 3.1 | −12/−3/−1 | 1.09/1.15/1.05 | Cyan shadows against magenta lights: the most graphic colour pairing in the app. Absorbs Night Neon. |

---

## 4. Keep, improve, merge, replace

| Verdict | Count | Looks |
| --- | --- | --- |
| **Keep** | 18 | Daylight, Velvet Slide, Sunday Negative, Open Shade, Classic 35mm, Warm Film Cinema, Tungsten Hours, Silver Retain, Sherbet, Faded Film, Peach Soft Light, Sodium Streetlight, Classic Monochrome, Soft Matte B&W, Newsprint, Home Video, Lofi Dusk, Arcade |
| **Improve** | 11 | Vivid Postcard, Green Room, Retro 70s, Teal and Orange, Airy Blue Film, Cocoa, Golden Hour, Disposable Camera, Pocket Flash, CCD Daylight, Rooftop Pink |
| **Merge** | 17 | Expired Summer, Midnight Cinema, Blue Hour, Rainy Day Blue, Powder Blue, Creamy Beige, Dark Academia, Mediterranean Summer, Analog Flash, Night Neon, Gritty Street, Silver Gelatin, Golden Feed, Blog Matte, Cali Haze, Pool Party, Tape Sunset |
| **Replace** | 2 | Clean Studio, Mall 2004 |
| **Experimental** | 6 | Neo-Noir Emerald, Moss, Autumn Mood, Tea Stain, Blue Screen, Night Shot |

Three honest notes:

- "Keep" does not mean untouched. Nine of the 18 need a small skin correction, listed in their rows.
- The trend rolls are hit hardest: of their 14 looks, 4 survive as main looks. They were added in
  one day and were differentiated by effects more than by colour.
- Removing looks affects people's Kept and Last roll lists. The existing alias table
  (`LOOK_ALIASES`) already handles this; every merged look needs an entry.

---

## 5. Proposed signature collection (30 looks)

Twenty-nine come from the current library (18 kept, 11 improved) and one is new.

### Everyday (4)

| Look | Identity | Best on |
| --- | --- | --- |
| Daylight | The neutral fix: open shadows, calm sky, true colour | Any photo that is just dull |
| **Studio White** (new) | High-key and clean: bright neutral whites, even skin, slightly lowered reds, crisp but not sharpened | Portraits in soft light, products, interiors |
| Vivid Postcard | Deep sky and water, rich greens, skin left alone | Landscapes, travel, beaches |
| Golden Hour | Gold in the highlights, warm shadows, skin within +10% | Outdoor portraits, late light |

### Film (7)

| Look | Identity | Best on |
| --- | --- | --- |
| Sunday Negative | Warm colour negative, soft contrast, muted greens | People, afternoons |
| Open Shade | Soft portrait negative, lifted shadows, cyan lows | Faces in shade, harsh light |
| Green Room | Cool film with green-cyan shadows, muted | Streets, plants, overcast days |
| Classic 35mm | Contrasty snapshot film with visible grain | Everyday, flat light |
| Velvet Slide | Dense slide film, dark blues, rich greens | Already colourful scenes |
| Retro 70s | Amber aged print with contrast restored | Warm scenes, nostalgia |
| Faded Film | The matte fade: lifted blacks, quiet colour | Contrasty or busy photos |

### Cinematic (5)

| Look | Identity | Best on |
| --- | --- | --- |
| Teal and Orange | Teal mids and shadows against protected warm skin | People against city or sky |
| Warm Film Cinema | Amber grade, soft blacks, muted greens | Interiors, quiet scenes |
| Tungsten Hours | Blue night air, warm lamps, red halation | City nights, windows |
| Silver Retain | Bleach bypass: steel, low colour, hard contrast | Drama, architecture, grit |
| Sodium Streetlight | Orange lamps, teal shadows, heavy grain | Streets after dark |

### Digicam and flash (4)

| Look | Identity | Best on |
| --- | --- | --- |
| Disposable Camera | Warm film flash, green shadows, chunky grain, vignette | Parties, friends |
| Pocket Flash | Cold, flat digicam flash with fringes | Night portraits, mirrors |
| CCD Daylight | Hard, cool-magenta CCD daylight with limited range | Sunny snapshots |
| Home Video | Soft, low-contrast tape with colour bleed | Candid, nostalgic clips |

### Editorial (7)

| Look | Identity | Best on |
| --- | --- | --- |
| Peach Soft Light | Lifted peach wash, gentle highlights | Faces, romantic scenes |
| Sherbet | Pastels with lilac shadows and a little glow | Outfits, flowers, bright days |
| Cocoa | Rich brown shadows, warm moody mids | Coffee, wood, autumn, interiors |
| Airy Blue | Bright, pale, cool and clean, protected whites | Daylight, water, minimal scenes |
| Classic Monochrome | Balanced black and white | Anything |
| Newsprint | Hard, pushed, very grainy black and white | Street, fashion, strong shapes |
| Soft Matte B&W | Gentle, lifted black and white | Portraits |

### Creative (3)

| Look | Identity | Best on |
| --- | --- | --- |
| Lofi Dusk | Purple-blue dusk, glowing warm lights, halation | Evenings, city |
| Arcade | Cyan shadows, magenta lights | Neon, screens, night |
| Rooftop Pink | Pink sky over teal shadows, skin kept natural | Sunsets, rooftops |

### Experimental shelf (7, kept out of the main rolls)

Neo-Noir Emerald, Moss, Autumn Mood, Tea Stain, Blue Screen, Night Shot, and a rebuilt Mall 2004
("strip light"). These are scene-specific or novelty looks: worth having, wrong to present as
equals of the main 30.

**Rolls.** Thirty looks in six groups replaces twelve rolls. Roll names and numbering are yours to
decide; the grouping above is a proposal.

| | |
| --- | --- |
| Why it matters | Choice between near-identical looks makes a library feel cheap. Thirty distinct looks is a stronger statement than 54. |
| User benefit | Every tap shows something clearly different; fewer looks that damage faces. |
| Complexity | Medium. Reworking 11 looks and one new look, on an evaluation set. No engine change needed, though 6.3 makes it far easier. |
| Dependencies | Evaluation photo set (6.1). Your decision on names and rolls. |
| Priority | High |

---

## 6. Adaptive look engine improvements

The current engine is sound in what it does (it measures, it does not guess, and its changes are
visible slider offsets). It simply stops too early. Keep the principle that every adaptation is an
ordinary, visible, editable value.

| # | Improvement | Why it matters | User benefit | Complexity | Dependencies | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 6.1 | **Evaluation set and metrics test.** 15–20 licensed photos (faces across skin tones, night, backlit, overcast, snow, foliage, mixed light) plus an automated version of this report's measurements. | Looks and fitting are currently tuned without a reference. Nothing catches a look that turns skin green. | Consistent quality; regressions caught. | Low | Photos you approve (CC0 or your own; not from the Pictures folder). | **Highest** |
| 6.2 | **Face-weighted exposure.** When a face is found, aim the face's brightness at a target band instead of the whole photo's median. | A backlit portrait is fitted to its bright background today and the face stays dark. | Portraits come out right on the first tap. | Medium | Face landmarks (exist). | High |
| 6.3 | **Skin guard in the engine.** One hue-keyed weight in the colour stage that limits how far temperature, tint, saturation and grading may move skin, with a per-look allowance. | Skin is the main failure of the current looks (section 3). Doing it per look by hand with the orange band has not worked. | Faces stay believable under strong grades. | Medium: both renderers, tests, identity at default. | None. | High |
| 6.4 | **Contrast and range fit.** Scale a look's contrast, highlights and shadows by the photo's own 5–95% spread. | A look that adds contrast +18 does it to a flat photo and a harsh one alike. | No more crushed or washed-out results. | Medium | 6.1 to tune. | High |
| 6.5 | **Per-look fitting rules.** Each look declares what is identity and what may bend: for example Tungsten Hours keeps its cool cast but is not pulled to mid-grey on a night photo; Golden Hour adds less warmth to a photo that is already warm. | One rule for all looks either neutralises strong looks or lets them stack with the photo's own cast. | Looks keep their character on unusual photos. | Low–medium | 6.1. | High |
| 6.6 | **Saturation fit.** Scale vibrance and saturation by the photo's existing colourfulness, toward the look's target. | Vivid Postcard on an already vivid photo is neon; on a grey one it is timid. | Predictable strength. | Low | 6.1. | Medium |
| 6.7 | **Band-aware colour.** Reduce a band's saturation boost when that colour already fills the photo. | Prevents neon grass and electric skies. | Fewer garish results. | Medium | 6.6. | Medium |
| 6.8 | **Negative picks.** Let "For this photo" drop looks whose measured result on this photo moves skin beyond a threshold. | Today a face only adds score; it never removes a harmful look. | Trustworthy recommendations. | Low | Face landmarks; 6.1. | Medium |
| 6.9 | **Monochrome toning.** Apply grading after monochrome, or add a toning stage. | Split-toned black and white is impossible today except with curve tricks. | Proper toned black and white. | Low–medium: both renderers. | None. | Low |

Not recommended: any fit that normalises colour toward neutral beyond the current 50% cast
removal. That would erase the looks.

---

## 7. Portrait Studio specification

**Aim:** a face that looks rested and well lit, not edited. Every control has a ceiling set so the
maximum is still believable. No reshaping of faces.

### 7.1 Fix first (existing code, small)

| Item | Complexity | Priority |
| --- | --- | --- |
| Draw all stored heal spots (raise the shader limit or chunk the pass; at minimum stop accepting a 33rd) | Low | **Highest** |
| Make smoothing read the healed image | Low | **Highest** |
| Clip the iris mask to the eye opening | Low | High |
| Rotate the under-eye region with the eye line | Low | High |
| Allow two-finger zoom and pan while a tool is active on phones | Medium | **Highest** |
| Decide the CPU position: add a CPU retouch path, or record in AGENTS.md that portrait is GPU-only and say so in the UI | Low (decision) to High (CPU path) | Medium |

### 7.2 Features

"Now" means achievable with the current detection, mask texture and render passes.
"New" means it needs a new model or a substantial new technique.

| Feature | Current state | Specification | Now or new | Complexity | Priority |
| --- | --- | --- | --- | --- | --- |
| **Skin smoothing with texture** | Two-band; removes mid texture | Three bands: tone (kept), blotches and unevenness (reduced by Smooth), pores (kept by Texture). Strength scales with face size. Ceiling well short of blur. | Now | Medium | High |
| **Even skin tone** | Absent | Pull each skin pixel's colour (not brightness) toward the local skin colour. One slider. | Now | Medium | High |
| **Redness** | Absent | Measure each face's median skin colour at detection time; shift pixels that are redder than it back toward it. One slider. | Now | Medium | High |
| **Shine** | Absent | Find skin pixels much brighter and less colourful than their surroundings; compress them and restore colour. One slider. | Now (approximation) | Medium | Medium |
| **Blemish removal** | Tap to heal; circle only; source cannot be moved | Keep tap-to-heal. Add: drag the source, automatic suggestions on the skin mask (the user confirms each). Large marks go to the existing Remove tool rather than a second implementation. | Now | Medium | High |
| **Under-eye** | Blur, brighten, desaturate | Match toward the cheek colour sampled just below, keep texture. | Now | Low–medium | Medium |
| **Eyes** | Iris contrast and saturation | Separate: iris clarity, whites (brighten and de-redden the eye opening minus the iris), catchlight. | Now | Medium | Medium |
| **Teeth** | Whiten | Split into Whiten (yellow removal) and Brighten, with a lower ceiling. | Now | Low | Low |
| **Lips** | Absent (the lip outline exists but is only used as a hole) | Colour depth and a gentle tint; soft edge. | Now | Low–medium | Medium |
| **Face light** | Flat gain | Phase 1: soft brighten with shadow lift, weighted to the centre of the face. Phase 2: directional light using the 3D landmark mesh (a light direction handle on the face). | Phase 1 now; Phase 2 substantial, no new model | Low / High | Medium / Low |
| **Per-face control** | All faces share one set | Tap a face to retouch it alone; "all faces" stays the default. Needs a face index in the mask and per-face values (up to 6). | Now | Medium–high | Medium |
| **Neck and body skin** | Face oval only | Extend smoothing and even-tone to the segmentation's body-skin class, gated by the face's measured skin colour. | Now | Medium | Medium |
| **Dodge and burn** | Possible via a brush mask with exposure | A "Light brush" preset in Portrait that creates that layer. No new engine work. | Now | Low | Low |
| **Hair-accurate edges, beards, glasses** | 256 px segmentation; no refinement | Phase 1: edge-aware upsampling of the segmentation with the guided filter already used for depth. Phase 2: a matting or face-parsing model. | Phase 1 now; **Phase 2 new** (BiRefNet at 214 MB was already flagged as needing your approval) | Medium / High | Medium / Low |
| **Face reshaping** | Absent | Not recommended. It conflicts with "natural" and with the product's honesty. | — | — | — |

### 7.3 Selecting and correcting areas

- **See it:** a "Show area" toggle tints the region a control acts on (skin, eyes, teeth, lips,
  under-eye), using the overlay the mask tool already has.
- **Correct it:** Add and Erase brushes on that region. Store the strokes as ordinary brush
  components and combine them with the automatic mask, so the correction is non-destructive,
  undoable and survives re-detection.
- **Choose a face:** tap a face outline; controls then apply to that face.
- **Save detection results** with the photo, so reopening is instant and corrections persist.

| | |
| --- | --- |
| Why it matters | When detection is wrong today the user is stuck, and a pillar feature cannot have dead ends. |
| User benefit | Control without complexity: automatic first, fixable always. |
| Complexity | Medium (reuses mask brush, overlay and rasteriser). |
| Dependencies | 7.1 phone zoom fix. |
| Priority | High |

### 7.4 Automatic mode

A single **Natural retouch** button sets modest values for smoothing, even tone, under-eye, eyes
and teeth, scaled to face size, with one Amount slider. The individual areas sit below it.

---

## 8. Blur Studio specification

### 8.1 One selection system

Blur should ask "where?" once, in the same way everywhere. The pieces already exist as mask
components. What is missing is letting anything other than local adjustments use them.

- A **target** for each blur and effect: Everything, Background, Subject, or a mask layer.
- Targets resolve to the existing rasterised masks (brush, gradients, subject, background, hair,
  skin, clothes, Select object), plus two new sources: **depth range** and **face regions**.
- One refine set for every mask: **Feather, Expand/Contract, Refine edge** (edge-aware, using the
  existing guided filter), plus the existing Add and Erase brushes.

| | |
| --- | --- |
| Why it matters | This is the reusable base for pillar 3. Without it each new blur needs its own selection code. |
| User benefit | "Blur the background", "motion on everything but her", "sharpen only the subject" all work the same way. |
| Complexity | High (mask input into the streak, glow and lens passes in both renderers; export tiling). |
| Dependencies | None. |
| Priority | High |

### 8.2 One blur engine for depth and masks

The lens blur gather already handles the hard part: blurring a background without smearing the
subject into it. It works from a per-pixel blur radius. Today that radius comes only from depth.
Let it come from depth, from a mask, or from both.

| Effect | Radius comes from | Needs | Status |
| --- | --- | --- | --- |
| Lens blur | Depth and focus point | Depth model | Exists |
| Background blur (portrait) | Background mask × strength | Segmentation | **Move onto the lens engine**; removes the halo |
| Tilt-shift | Linear or radial gradient | Manual shape | New, nearly free once radius can come from a mask |
| Depth with subject locked | Depth, forced to zero inside the subject mask | Depth + segmentation | New, small |
| Selective blur | Any mask | Manual or automatic mask | New, small |

### 8.3 Features

| Feature | Current state | Specification | Needs | Complexity | Priority |
| --- | --- | --- | --- | --- | --- |
| Automatic subject selection | Exists (segmentation) | Default target for Background blur | Segmentation | — | — |
| Background detection | Exists | Same | Segmentation | — | — |
| Hair and clothing edges | Soft, from a 256 px model | Refine edge (8.1); later a matting model | Guided filter now; **new model** later | Medium / High | High / Low |
| Manual brush and erase | Exists for masks | Available on every blur's target | — | Low | High |
| Feathering and transitions | Only brush softness, at paint time | Feather and Expand/Contract on any mask, after the fact | — | Medium | High |
| Depth-based blur | Exists | Keep. Store depth in 16 bits. Recompute depth after removals. | Depth model | Low | Medium |
| Lens blur controls | Amount, focus, falloff, highlights, tap to focus | Add **Depth of field** (the in-focus range, fixed today), and **Bokeh shape** (round, or 5–8 blades) | — | Low / Medium | High / Low |
| Motion blur | Fixed 12°, whole image | **Direction** (drag a line on the photo) and **Distance**; target Everything or Background (a panning shot with the subject sharp) | Mask for the target | Medium | High |
| Shutter drag | Fixed 12°, highlights only | Direction, shared with motion blur's handle | — | Low | Medium |
| Radial blur | Absent | **Zoom** and **Spin** from a centre point the user places; subject can be protected | Mask optional | Medium (new pass, both renderers) | Medium |
| Soft focus | One slider | Add Radius. Consider merging with Dreamy blur (section 9). | — | Low | Low |

Guard to add: when Lens blur and Background blur are both on, say so, or make them one control.

---

## 9. Effect customisation audit

Controls are recommended only where the fixed value visibly limits the result. Positions and
directions should be handles on the photo, not extra sliders.

| Effect | Controls today | Fixed today | Recommend | Skip |
| --- | --- | --- | --- | --- |
| **Flash** | Strength | Centre of frame, reach, cool tint | **Position** (drag), **Reach** | Colour, contrast |
| **Bloom** | Strength | Radius 2%, threshold | **Threshold**, **Radius** | Tint, blend mode |
| **Halation** | Strength | Radius 1.2%, red-orange, threshold | **Radius** | Colour (it is the look of the effect) |
| **Light leak** | Strength | Always the right edge, one shape, one orange | **Position and angle** (drag), **Colour** (warm, pink, blue), **Shuffle** | Size |
| **Lens flare** | Strength | Source at top right, three fixed ghosts, warm tint | **Position** (drag; offer "place on the brightest light") | Ghost count, streak |
| **Motion blur** | Strength | 12°, both directions | **Direction**, target (section 8) | Tap count |
| **Shutter drag** | Strength | 12°, highlight threshold | **Direction** | Threshold |
| **Soft focus** | Strength | Radius 1.2% | **Radius** | — |
| **Dreamy blur** | Strength | Radius 2% | None. It overlaps Soft focus and Bloom; consider folding it into Soft focus with a Glow amount. | — |
| **Colour fringe** | Strength | Radial from centre | None needed | Centre, direction |
| **Dust & scratches** | Strength | One pattern for every photo; scratches always vertical | **Shuffle**, **Dust / Scratches balance** | Colour |
| **Grain** | Amount, size, roughness | Monochrome grain, mid-tone weighted | **Colour grain** on/off (film grain is not grey) | More noise parameters |
| **Vignette** | Amount, midpoint, roundness, feather | Centre | **Centre** (drag), low priority | — |
| **Lens blur** | 4 sliders + focus point | In-focus range, disc bokeh | Depth of field, Bokeh shape (section 8) | — |

Also found:

- Dust, light leak and grain use a fixed pattern, so every photo and every export has the same
  specks in the same places. Shuffle fixes the first two; grain should vary per photo.
- Bloom, halation and the mask-layer blur are blurred on display-encoded values, not linear light
  (the pipeline document says linear). Glows are dimmer and less natural than they could be.
- Grain's noise function loses precision at large image sizes on the GPU _(inferred)_; the CPU and
  GPU may not match at full resolution.

| | |
| --- | --- |
| Why it matters | A fixed light leak is a sticker. A placed one is an edit. |
| User benefit | Effects that fit the photo's composition and light. |
| Complexity | Low to medium each, but every parameter must be added to the schema, both renderers and tests, and stay an identity at default. About 14 new parameters in total. |
| Dependencies | An on-photo handle component (the focus-point and crop overlays are the model). |
| Priority | Medium overall; motion direction, light-leak position and flare position first. |

---

## 10. UI and UX recommendations

These fit the existing layout and design system. Nothing here needs a redesign.

| # | Recommendation | Why | Complexity | Priority |
| --- | --- | --- | --- | --- |
| 10.1 | **Phone: allow zoom and pan with two fingers while a tool is active.** | Retouching and masking need it; it is blocked today. | Medium | **Highest** |
| 10.2 | **Phone: bring Portrait and Effects/Blur within one tap.** They are two taps deep under More while being pillars 2 and 3. The dock is Looks, Light, Match, Colour, More; Match also lives on home. Which item gives way is your decision. | Features nobody finds do not exist. | Low | High |
| 10.3 | **Automatic first, detail on demand.** Each studio opens on one automatic action (Natural retouch; Blur background) with an Amount. Area and advanced controls open below it. On phones use the existing one-slider view (Light and Colour have it; Portrait and Effects do not). | Casual users get a result in one tap; advanced users lose nothing. | Medium | High |
| 10.4 | **Handles on the photo** for position and direction (flash, leak, flare, motion, radial centre, face light). | Faster and clearer than sliders for spatial values. | Medium | Medium |
| 10.5 | **"Show area"** in Portrait and Blur, with Add/Erase beside it. Make the overlay respect invert and opacity (it does not today). | Trust and correction. | Low–medium | High |
| 10.6 | **Compare per tool:** hold on the photo shows the photo without the current tool's changes, not the whole edit. | Judging a subtle retouch against the full original is hard. | Medium | Medium |
| 10.7 | **Looks: show the roll's looks at full Amount on this photo, keep Amount to 150%, and mark looks from the experimental shelf.** After the cut to 30, "For this photo" can show fewer, surer picks. | Sets expectations. | Low | Medium |
| 10.8 | **Say when a feature is unavailable and why** (no WebGL2: no portrait or layer blur) at the tool, not only in a toast. | Avoids "it does nothing". | Low | Medium |
| 10.9 | **Progress for depth and detection** is already real; keep the rule. Cache detection per photo (7.3). | Speed on reopen. | Low | Medium |

Everything stays non-destructive and undoable: new controls are values in the edit, corrections
are stored strokes, and targets are references to mask layers.

---

## 11. Technical architecture and implementation requirements

1. **Regions.** Extend the mask component system with two sources (depth range, face parts) and a
   refine block (feather, expand, refine edge). Give effects and blurs an optional target. On the
   GPU, bind the target's raster to the streak, glow and lens passes; mirror on the CPU.
2. **Unified blur radius.** Change the lens passes to take a radius field built from depth, a
   mask, or both. Route Background blur through it. Add 16-bit depth.
3. **Skin guard.** One hue-keyed weight in the colour stage (`pixel.ts` and `shaders.ts`), default
   off, with tests. Looks then set an allowance instead of hand-tuning the orange band.
4. **Portrait pass v2.** Three-band skin model reading the healed image, per-face values, new
   regions (lips, eye whites, body skin) in the mask texture (a second texture is needed: the four
   channels are full). Decide CPU parity.
5. **Effect parameters.** About 14 new values in `RANGES`, each with a default that reproduces
   today's result exactly, so existing edits and looks do not change.
6. **Fitting v2.** Per-look fitting metadata next to `suits`; face-weighted exposure; contrast and
   saturation fit as slider offsets.
7. **Evaluation harness.** The photo set, a test that computes skin, cast, clipping and
   look-to-look distance, and thresholds that fail the build. This replaces judgement by memory.
8. **Edit schema.** New fields need migration and the version bump the schema already supports.

**Dependencies:** phases 0 to 5 below need **no new library and no new model**. The only optional
additions are a matting model for hair and a face-parsing model, both in the last phase, both
needing a licence check and your approval.

**Export checks to make before building on the blur passes** _(inferred, not reproduced)_:

- Tile padding takes the larger of the lens reach and the other blurs' reach, though the passes
  run in sequence and their reaches add. Seams are possible when lens blur is combined with glow
  or streaks.
- With glow and a long streak on a large photo, padded tiles can exceed the 4096 px texture limit
  and the export would fail.

---

## 12. Prioritised roadmap

| Phase | Work | Size | Depends on |
| --- | --- | --- | --- |
| **0. Bugs and trust** | Heal spots beyond 32; smoothing reads healed image; phone zoom in tools; iris and under-eye masks; white-point protection on Airy Blue Film; Creamy Beige and the four `whites` rule breaks; warn on double background blur; check the two export padding risks | Days | — |
| **1. Evaluation set** | Photo set, metrics test, contact-sheet generator | Days | Your photos or approved CC0 photos |
| **2. Looks to 30** | Rework 11, build Studio White, merge 17, shelve 6, aliases, tests for skin and distinctness | 1–2 weeks | Phase 1; your decision on names and rolls |
| **3. Fitting v2 and skin guard** | 6.2–6.6, 6.8 | 1–2 weeks | Phase 1 |
| **4. Portrait Studio v1** | Three-band skin, even tone, redness, shine, lips, eye whites, Show area and correction, Natural retouch, saved detection, per-face | 3–4 weeks | Phase 0 |
| **5. Blur Studio v1** | Regions and refine, unified blur radius, background blur on the lens engine, motion direction and target, depth-of-field range, tilt-shift, radial blur | 3–4 weeks | Phase 0 |
| **6. Effect parameters** | Position, direction, shuffle, radius (section 9), on-photo handles | 1–2 weeks | Handle component from phase 5 |
| **7. Optional models** | Hair matting, face parsing, directional face light | Open | Your approval per model |

The five features you approved earlier (photo dump, frames, scrapbook, look card, camera) are not
in this list. My recommendation is phases 0 to 2 before any of them, because they fix what users
see first; after that the order between this roadmap and those features is your call.

Sizes are rough estimates for one developer and were not derived from measured work.

---

## 13. Risks, limitations and performance

| Risk | Detail | Mitigation |
| --- | --- | --- |
| **Skin-tone fairness** | The skin gate is a hue window around one hue with a saturation threshold. Very dark and very pale skin may fall partly outside it. Segmentation models also vary by skin tone. Nothing tests this today. | Evaluation set with a full range of skin tones; per-face measured skin colour instead of a fixed hue. |
| **"Beauty filter" drift** | More retouch controls make over-editing easier. | Low ceilings, Natural retouch as the default, no reshaping. |
| **Two renderers** | Every new parameter is written twice and tested for parity. Portrait already skipped the CPU side. About 14 effect parameters plus the portrait and region work is a large surface. | Decide per feature whether CPU parity is required; record exceptions in AGENTS.md instead of letting them happen silently. |
| **Phone performance** | Skin smoothing is 24 samples per pixel; lens blur is up to 128; mask-aware streaks add more. Devices without WebGL2 get no portrait tools at all. Depth runs on the CPU without WebGPU and is slow. | Measure long tasks at 390 px on a production build before and after each phase (the project rule); lower preview resolution while dragging. |
| **Segmentation limits** | A 256 px model cannot give hair-level edges. Refinement helps; it does not replace a matting model. | Be honest in the UI; offer the brush; treat the matting model as optional. |
| **Depth limits** | Relative depth from one photo is uneven on flat textured surfaces, and there is nothing behind a blurred foreground object. | Depth-of-field range control and subject lock reduce visible errors. |
| **Library churn** | Removing 24 looks changes people's Kept lists and muscle memory. | Aliases for every merged look; applied looks keep their own values, so edited photos do not change. |
| **Existing edits** | New effect parameters must reproduce today's render at their defaults. | Identity tests per parameter. |
| **Limits of this audit** | Colour-only measurements on test colours; no real photo set; some findings inferred from code and not reproduced; not checked on a real phone. One existing unit test (a speed check in `match.test.ts`) already fails on this laptop. | Phase 1 turns the measurements into a repeatable test on real photographs. |
