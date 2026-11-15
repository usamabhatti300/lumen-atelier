# Lumen Atelier: product strategy

_2026-11-15. Builds on `APP_GUIDE.md` (what exists) and `report.md` (what is wrong with it).
Strategy only: nothing here has been built or changed._

Estimates are rough, for one developer, and are not derived from measured work. Halve nothing and
add nothing in parallel unless there is a second person.

## Owner decisions (2026-11-15)

These were made after the first draft and the document below has been updated to match.

| Area | Decision |
| --- | --- |
| **Looks** | Three tiers: **30 Core looks**, an **Experimental** shelf, and **Archived** looks kept so saved edits and Kept lists never break. The cut happens only after testing on real photographs; 30 is a target, not a quota. A good creative look is not dropped just to reach the number. |
| **Visual identity** | Keep the personality, selectively. Particle hero: keep. Custom cursor: keep if polished. 3D rolls ring: keep if fast. Decoding text: simplify to a subtle first-load detail. Remove animation that distracts from editing. **Rule: the interface never competes with the photograph.** Character lives in navigation and discovery, not over the editing canvas. |
| **Phone dock** | Portrait and Blur & Effects get direct access: **Edit · Looks · Portrait · Blur & Effects · More**. Edit holds Light, Colour, Detail, Crop and the other adjustments. A structure, not a final design. |
| **Money** | Freemium. Explore a **one-time Pro purchase** first, with optional paid look packs later. No subscription. Validate that people will pay before building payment infrastructure. |
| **Order** | Perfect **looks first, Match a look second**: they are the reason to open the app. Portrait and Blur are the reason to stay. |

Second round, same day:

| Area | Decision |
| --- | --- |
| **Free and Pro** | Free gives the full-quality result; Pro gives control. Free: Natural retouch, Background blur, essential portrait adjustments, full-resolution export. Pro: individual-area adjustments, per-face controls, depth controls, advanced masks, motion blur. **Never watermark, and never reduce export quality or resolution for free users.** |
| **Licensing** | No payment or licensing infrastructure yet. Validate demand for Pro first. |
| **Personality** | Keep the 3D rolls ring and the custom cursor for now, and judge them against measured performance and usability on real phones. The cursor must never interfere with interacting with the photo. Decoding text stays subtle. |
| **Opening tab** | A newly opened photo opens on **Looks**. After that the app remembers the tab the user last chose. |
| **Look changes** | The 30 Core plus Experimental direction is approved. **Nothing is permanently removed or merged until the proposed collection has been tested on real photographs.** Saved edits, Kept and compatibility are preserved. |
| **Pro validation** | Show Free and Pro labels with Pro unlocked for now. Add "Get Pro when it launches". **No silent analytics and no data collected without clear consent.** |
| **Testing** | Evaluation set of 15–20 licensed or CC0 photographs: diverse skin tones, portraits, indoor and outdoor light, landscapes, night. Never the owner's Pictures folder. The owner tests on a real phone from a checklist. |
| **Working rule** | Phase 0 first, incrementally, each fix tested and reported. Nothing from Phase 2 or later starts until Phase 0 is finished and tested. No changes to unrelated UI, features or architecture. |

---

## 1. Product direction

### What Lumen Atelier should become

**The editor where a look fits the photo and the face in it.**

One tap gives a result that already suits this photo's light and this person's skin. Every part of
that result is an ordinary control the user can open and change. That is the whole product: a
playground on the surface, a real editor one layer down, and no wall between them.

### Who it is for

| User | What they want | What they get |
| --- | --- | --- |
| Everyday user | A phone photo that looks like a good photographer took it, in under a minute | A look that fits, a natural retouch, a blurred background, a frame, export |
| Enthusiast | Control, and results they can stand behind | The same look opened up as curves, colour, masks and depth blur, all non-destructive |

### What it should not try to be

- **Not a Lightroom replacement.** No RAW, no catalogue, no tethering. Competing there loses.
- **Not a beauty app.** No face reshaping, no skin that looks airbrushed.
- **Not a collage or template tool.** That is a different product with a different engine.
- **Not a generative AI tool.** No invented skies or filled-in scenes.
- **Not a social network.** No feed, no accounts.

### Why someone would choose it

The honest answer today is "it is private and it runs in a browser". That is not enough.
After this roadmap the answer should be these four things, in this order:

| # | Differentiator | Why it can be real | State today |
| --- | --- | --- | --- |
| 1 | **Looks that fit the photo and respect skin** | Fitting already exists and is measured, not guessed. No mainstream filter app adapts a filter to the photo, and none can claim tested behaviour across skin tones. | Half built. Fits exposure and white balance only; twelve looks over-saturate skin. |
| 2 | **Match a look** from any photo you like | Already the signature feature, and unusual. | Works, but a same-scene test came back warmer and less saturated than the reference, and the result page is long. |
| 3 | **Natural portrait and blur with visible, correctable selection** | Detection, depth and masks already exist on the device. | First version; selection is hidden and the three blurs do not share it. |
| 4 | **Private by construction** | Nothing is uploaded; works offline; no account. | True today. It is a reason to trust the app, not a reason to open it. |

Everything in the roadmap serves one of these four. Anything that serves none is postponed.

---

## 2. Decisions by area

### 2.1 Looks: fewer, and each one earns its place

**Decided: three tiers, and no new looks until the Core set passes a test on real photographs.**

| Tier | What it holds | Where the user meets it |
| --- | --- | --- |
| **Core** (about 30) | Looks that pass the skin and distinctness tests on the evaluation set | The rolls, "For this photo", home |
| **Experimental** | Creative, unusual or scene-specific looks that are good but not for every photo | Its own shelf in the look browser, clearly labelled |
| **Archived** | Looks merged into another or retired | Not shown in the browser. An edit or a Kept entry that uses one keeps working and keeps its name. |

The 17 merges in `report.md` came from colour measurements, not from viewing photographs. Each one
is a proposal until it is confirmed side by side on the evaluation set. Where a "duplicate" turns
out to look clearly different on real photos (grain and effects were not measured), it moves to
Experimental instead of Archived.

| Decision | Detail | Why it matters | What the user notices |
| --- | --- | --- | --- |
| **Add** an evaluation set | 15–20 approved photos: faces across the full range of skin tones, night, backlit, overcast, snow, foliage, mixed light | Looks are tuned from memory today. Nothing catches a look that turns a face green. | Nothing directly. Everything below depends on it. |
| **Add** a skin guard in the engine | One control that limits how far a look may move skin | Skin is the main failure of the current library. Hand-tuning each look has not worked. | Faces stay believable under strong grades, on every skin tone. |
| **Curate** to about 30 Core | Starting point from `report.md`: keep 18, rework 11, build 1 new (Studio White); 6 to Experimental; 17 merge candidates to confirm by eye | Near-identical looks make a library feel cheap. | Every tap looks clearly different. |
| **Improve** fitting | Face-weighted exposure, contrast fit, per-look rules about what may bend | A look is applied the same way to a flat photo and a harsh one. | Right on the first tap, more often. |
| **Remove** harmful picks | "For this photo" drops looks that damage skin on this photo | A face only adds score today; it never removes a look. | Recommendations that can be trusted. |
| **Rule** for the future | A new look ships only if it passes the skin and distinctness tests and replaces a weaker look | Stops the library drifting back to 54. | A collection that stays curated. |

**Honest criticism:** the four trend rolls from 2026-11-14 were built in a day and differentiated
by effects more than colour. Four of their fourteen looks survive. Trend looks are worth having;
they need the same bar as the rest.

### 2.2 Portrait: natural, visible, correctable

**Recommendation: rebuild skin retouching around three ideas: keep real texture, show what is
selected, let the user fix it.**

| Decision | Detail | Why it matters | What the user notices |
| --- | --- | --- | --- |
| **Fix** | Heal spots beyond the 32nd; smoothing undoing heals; eye and under-eye regions | These are bugs in a pillar feature. | Tools that do what they say. |
| **Rebuild** skin smoothing | Three bands: keep tone, reduce blotches, keep pores | The current version removes mid-scale texture: that is the plastic look. | Smoother skin that still looks like skin. |
| **Add** even tone, redness, shine | Each one slider, each with a low ceiling | These are what a retoucher actually does; smoothing alone cannot do them. | A rested face, not an edited one. |
| **Add** lips and eye whites | Using outlines that are already detected | Small, cheap, expected. | Finishing touches without a beauty-filter feel. |
| **Add** "Show area" and Add/Erase | Reuses the mask overlay and brush | When detection is wrong today there is no fix. | Control when the automatic result misses. |
| **Add** Natural retouch | One button, one Amount, modest defaults | Most users will never open the individual sliders. | A good result in one tap. |
| **Add** per-face control | Tap a face to edit it alone | Group photos. | Retouch one person, leave another. |
| **Avoid** | Face reshaping, heavy smoothing ceilings | Conflicts with "natural" and with the product's honesty. | — |

No new model is needed for any of this.

### 2.3 Blur and selective editing: one selection, used everywhere

**Recommendation: stop building blurs. Build one selection system and one blur engine, then let
every blur and effect use them.**

| Decision | Detail | Why it matters | What the user notices |
| --- | --- | --- | --- |
| **Add** targets | Every blur and effect can apply to Everything, Background, Subject or a mask | Masks only drive local adjustments today. | "Blur the background", "motion on everything but her" work the same way. |
| **Add** refine controls | Feather, Expand/Contract, Refine edge on any mask | No mask can be adjusted after it is made. | Edges that can be fixed instead of redone. |
| **Rebuild** Background blur on the lens blur engine | The lens engine already avoids smearing the subject | The current Background blur leaves a halo around people. | Clean edges on the most-used blur. |
| **Merge** Lens blur and Background blur into one Blur tool | One entry, two modes (depth, subject) | Two blurs that stack silently is confusing. | One place for blur. |
| **Improve** motion blur | Direction and distance set by dragging on the photo; subject can stay sharp | Fixed at 12° on the whole image today. | A real panning shot. |
| **Add** tilt-shift and radial blur | Tilt-shift is nearly free once blur can follow a mask; radial is one new pass | Commonly wanted, cheap after the rebuild. | More creative range from the same tool. |
| **Postpone** a hair-matting model | Try edge refinement with existing code first | The candidate model is 214 MB. | — |

### 2.4 Effects: place them, don't just dial them

**Recommendation: add position and direction as handles on the photo, add Shuffle where a pattern
is fixed, and stop there.**

| Decision | Detail |
| --- | --- |
| **Improve first** | Light leak (position, angle, colour, shuffle), lens flare (position), flash (position, reach), motion blur and shutter drag (direction) |
| **Improve next** | Bloom (threshold, radius), halation and soft focus (radius), dust (shuffle, balance), grain (colour grain) |
| **Merge** | Dreamy blur into Soft focus: they are built from the same blur and overlap |
| **Leave alone** | Colour fringe. One slider is right. |
| **Avoid** | Blend modes, ghost counts, noise parameters: controls that cost a slider and change little |

Why it matters: a light leak that is always on the right edge with the same shape is a sticker.
One the user places is an edit. Roughly 14 new values, each written in both renderers.

### 2.5 Match a look: finish the signature feature

**Decided: this is the second thing to perfect, straight after the looks.**

It is the most distinctive thing in the app and it is not yet reliable enough to lead with.

- **Improve:** test it on the evaluation set; fix the warm, under-saturated bias; analyse as soon as a
  photo is dropped; shorten the result page to the photo, the look and three facts.
- **Keep** measurement-only matching as the main path. It is private, offline and free to run.
- **Do not invest** further in the optional AI description. It needs a server, it is slow on
  ordinary hardware, and it is not what makes the match good.

### 2.6 Experience and visual design

Identity stays as it is: black, ivory, one lilac action, orange for date stamps only, no glow.

| Decision | Detail | Why it matters |
| --- | --- | --- |
| **Fix** zoom while a tool is active on phones | Two fingers always zoom and pan | Retouching and masking are unusable without it. |
| **Test** on real phones | One mid-range Android, one iPhone | The app has only ever been checked in emulation. Every performance and usability claim is unproven. |
| **Reorganise** the phone dock (decided) | Edit · Looks · Portrait · Blur & Effects · More. Edit holds Light, Colour, Detail and Crop as chips; Match a look moves to the top of Looks and stays on home | Pillars two and three are two taps deep today. Decided: a newly opened photo starts on Looks; after that the app remembers the tab the user last chose. |
| **One pattern for every tool** | An automatic action and Amount first; detail below | Casual users get a result; enthusiasts lose nothing. |
| **Handles on the photo** | For position, direction, focus, light | Clearer than sliders for anything spatial. |
| **Compare per tool** | Hold shows the photo without the current tool only | A subtle retouch cannot be judged against the untouched original. |
| **Touch targets** | Nothing under 44 px | Several controls are 36–40 px today. |
| **Motion** | Things move only in response to a touch, 150–250 ms, and the photo itself is never animated. Keep the plain fade on look change. | Matches "understated". The particle dissolve was already removed for this reason. |
| **Personality, with conditions** (decided) | Keep the particle hero. Keep the custom cursor if it is polished, and the 3D rolls ring if it is fast. Simplify the decoding text to a first-load detail. Remove animation that distracts from editing. | The app should not become another generic black editor. The conditions need numbers to be testable: I suggest the ring stays only if home scrolls smoothly on the Phase 0 phones, and the cursor only if it never lags the pointer and is off over the photo. Nothing decorative moves over the editing canvas. |
| **Tuck away, do not remove** | Channel mixer, levels, LUT and XMP export under an "Advanced" group | Enthusiasts use them; beginners should not meet them first. |

---

## 3. Future features: build, postpone or avoid

| Feature | Verdict | When | Reasoning |
| --- | --- | --- | --- |
| **Frames and borders**, with 4:5 and 9:16 sizes | **Build** | Early (Phase 3) | Cheap: the Finish step already burns in date stamps and overlays. Visible in every shared photo. Social sizes are a gap today. |
| **Look links and QR** (settings only, never the photo) | **Build** | After the looks are curated (Phase 7) | The only way the app can spread while staying private. Cheap. Must wait until look names and ids are stable or links will break. |
| **Look card** (9:16 before/after with the look's name) | **Build** | With look links | It is the picture that carries the link. Small. |
| **Photo dump** (up to 20 photos, one look fitted to each) | **Build** | After fitting is improved (Phase 7) | Batch apply already exists. Its value is entirely the fitting: one look that suits twenty different photos. Built before that, it shows the fitting's weaknesses twenty times. |
| **Live camera with looks** | **Postpone** | Not before real-phone performance is known | A web app's camera is weaker than the phone's own, and a live preview at full frame rate on a mid-range phone is unproven. A one-day version is worth doing instead: a "Shoot" button that opens the phone's camera and applies the last look to the result. |
| **Scrapbook** (cut-out stickers, collage) | **Avoid for now** | — | It needs a layout canvas (a second product) and hair-quality cut-outs the current 256 px segmentation cannot give without a 214 MB model. High cost, weak fit with an editorial identity. |
| Text and stickers | **Avoid** | — | Same reason: template-app territory. |
| RAW import | **Avoid** | — | Large, and it chases Lightroom. |
| HEIC import | **Check first** | Phase 0 | iPhones normally hand a web page a JPEG, so this may not block iPhone users at all. Confirm on a real iPhone before spending anything; it would need a new library and your approval. |
| Accounts, cloud sync | **Avoid** | — | Removes the privacy advantage and adds a backend. |
| More looks, more trend rolls | **Avoid** | Until the 30 pass | Width was the problem. |

---

## 4. Roadmap

| Phase | Outcome for the user | Main work | Estimate | Depends on |
| --- | --- | --- | --- | --- |
| **0. Foundations** | Tools that do what they say; the app works on a real phone | Bug fixes from `report.md` phase 0; zoom in tools; touch targets; real-phone test; evaluation photo set and metrics test; HEIC check | 1–2 weeks | Photos you approve |
| **1. Looks you can trust** | About 30 Core looks, each distinct, each kind to skin, fitted to the photo; an Experimental shelf; nothing saved breaks | Skin guard; fitting (face-weighted exposure, contrast fit, per-look rules); rework and confirm on the evaluation set; the three tiers; tests for skin and distinctness | 3–4 weeks | Phase 0 set; your sign-off on each cut, and on names and groups |
| **2. Match a look** | Drop a photo you like and get a look you would keep | Test on the evaluation set; fix the warm, under-saturated bias; analyse on drop; short result page | 2–3 weeks | Phase 0 set; skin guard and fitting from Phase 1 |
| **3. Finish and find** | Frames, borders and social sizes; Portrait and Blur one tap away on a phone | Frames in Finish; 4:5 and 9:16; the new dock; "Advanced" group; the personality pass (cursor, ring, decoding text) | 1–2 weeks | Phase 0 phones for the speed checks. Small enough to overlap Phase 1 or 2. |
| **4. Portrait Studio** | A natural retouch in one tap, with areas you can see and correct | Three-band skin; even tone, redness, shine; lips, eye whites; Show area and correction; Natural retouch; per-face; saved detection | 3–4 weeks | Phase 0 |
| **5. Selection and Blur** | One Blur tool; clean background blur; any effect on any area | Targets and refine controls; blur engine fed by depth or mask; Background blur moved onto it; motion direction; tilt-shift; radial | 3–4 weeks | Phase 0 |
| **6. Effects you place** | Light, leaks and flares positioned by hand | Handles on the photo; new effect values; Shuffle; merge Dreamy into Soft focus | 1–2 weeks | Handle component and targets from Phase 5 |
| **7. Share** | Looks you can send; a dump in one go | Look links, QR, look card; photo dump | 2–3 weeks | Phase 1 (stable looks, better fitting) |

**Total: roughly 16–24 weeks for one developer.**

### Dependencies

```
Evaluation set ──► Skin guard ──► 30 looks ──► Look links / card
       │                │             │
       │                └─► Fitting ──┴──► Photo dump
       └─► Match a look fixes
Phone zoom fix ──► Portrait correction brushes
               └─► Mask refine ──► Targets ──► Blur engine ──► Motion / tilt-shift / radial
                                       └─► Effect handles
```

### If time is short

Ship phases 0 to 3 and stop. That alone changes what the product is: a small set of looks that
fit and respect skin, a Match a look worth showing people, and exports in the right shapes.
That is the reason to open the app. Portrait and Blur, the reason to stay, are the next two
releases.

---

## 5. Technical risks and performance

| Risk | Why it is real | What to do |
| --- | --- | --- |
| **Never tested on a real phone** | Only emulation so far; iPhone Safari untested | Phase 0. Set targets before building: for example a slider drag that stays smooth and a look that applies without a visible pause on a mid-range phone. Measure, then decide what Phases 3 and 4 can afford. |
| **Two renderers** | Every pixel change is written twice (GPU and CPU). Portrait already skipped the CPU side. Phases 1, 3, 4 and 5 all add pixel maths. | Decide per feature whether a CPU version is required, and write the exceptions down. This is the largest hidden cost in the plan. |
| **Phone performance of new passes** | Skin smoothing, mask-aware blur and depth blur are heavy; devices without WebGL2 get no portrait tools | Lower preview resolution while a finger is down; measure each phase on the Phase 0 phones. |
| **Skin-tone fairness** | The current skin detection assumes one hue range; nothing tests dark or very pale skin | The evaluation set must cover the range, and the tests must fail the build when a look or tool breaks on any of it. |
| **Segmentation edges** | A 256 px model cannot find individual hairs | Edge refinement first, honest wording in the UI, brush for the rest. Revisit a matting model only if real photos show it is needed. |
| **Photos stored in the browser** | Browsers can clear a site's storage, and Safari is stricter for sites that are not installed. Whether the app asks the browser to keep its storage was not checked in the audits. | Check it in Phase 0; tell users plainly to export what they want to keep. |
| **Library churn** | Removing 24 looks changes Kept lists | The existing alias table already redirects old looks; edited photos keep their own values. |
| **Export of combined blurs** | `report.md` found two possible failures (seams, and a size limit on large photos) by reading the code; neither was reproduced | Reproduce both before Phase 4 builds on those passes. |
| **Scope** | 15–22 weeks is long for a small team | The phases are independent releases. Do not start one before the previous one ships. |

---

## 6. Free and Pro

**Decided: freemium, starting with a one-time Pro purchase; look packs possibly later; no
subscription.** Do not build payment until people have shown they would pay.

### Where the line should sit

Agreed line: the free app has to be good enough that people show it to friends, so the result is
never held back; only the control over it is.

| | Free | Pro |
| --- | --- | --- |
| Looks | All Core looks, fitted to the photo, with Amount | Experimental shelf, future look packs, saving unlimited looks of your own |
| Match a look | A few matches, enough to be impressed | Unlimited, plus saving and sharing matched looks |
| Edit | Light, Colour, Detail, Crop, Auto | Curves, colour wheels, channel mixer, LUTs |
| Portrait | Natural retouch at full quality, and the essential adjustments | Individual-area adjustments, per-face control, correction brushes |
| Blur | Background blur at full quality | Depth controls, motion blur, tilt-shift, radial, effects on a chosen area |
| Masks | Subject, background and simple brush | Advanced masks: Select object, refine controls, combined masks |
| Export | Full resolution and full quality, no watermark, always | Batch, photo dump, AI upscale, LUT and XMP export |

The rows for Looks, Match a look, Edit and Masks are my proposals; the Portrait, Blur and Export
rows follow your decision.

The principle: **free gives the full-quality result; Pro gives the control over it.** That fits a
product whose pitch is "a playground on the surface, a real editor one layer down". Never
watermark and never cap free export size: both punish exactly the photos that would advertise
the app.

### The hard part

A one-time purchase with no accounts and no server still has to answer "how does the app know
this person paid, on their next phone too?" The usual answers are a licence key from a payment
provider or a store purchase through an app-store wrapper. Both add infrastructure, and because
everything runs in the browser, any check can be bypassed by someone determined. That is
acceptable for a product at this stage; it should be a known choice, not a surprise.

### Validating before building

Decided: labels first with Pro unlocked, a "Get Pro when it launches" option, no payment or
licensing code yet, and nothing collected without clear consent.

A way to measure interest that keeps the app's promise:

- **The button sends nothing by itself.** Tapping "Get Pro when it launches" opens a short
  sheet that says exactly what happens next.
- **The person chooses to tell you.** The sheet offers one action: "Tell me when Pro launches",
  which opens a sign-up page outside the editor (or a pre-filled email). They type their address
  themselves and press send. Interest is the number of sign-ups you receive.
- **Nothing is counted in the background.** No tap counters, no identifiers, no cookies. People
  who look and close the sheet leave no trace.
- **Optional, and also opt-in:** on that same page, one question, "Which Pro feature do you want
  most?", answers which features to build first.

This under-counts interest, because only people who act are counted. That is the honest price of
collecting nothing silently, and a sign-up is a much stronger signal than a tap.

Decide the price and the mechanism only after Phases 1 to 3 have shipped.

---

## 7. Still open

1. **Sign-off on each look cut**, and the names and grouping, once the evaluation set exists.
2. **The Free/Pro rows I proposed** (Looks, Match a look, Edit, Masks).
3. **Where the Pro sign-up page lives** (a page on your own site, a form service, or email).
4. **How you will know it is working.** The app collects nothing, by design. Without at least
   occasional sessions watching five people use it, every priority above is a judgement call.
