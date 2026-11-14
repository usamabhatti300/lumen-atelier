# Lumen Atelier: post-implementation audit

_2026-11-14. Follows `PRODUCT_AUDIT_AND_IMPROVEMENT_PLAN.md`._

## How this audit was done

After the improvement pass was built and tested, a reviewer with no knowledge of the first audit or
of the changes opened the app as a new user: phone (390 × 844, touch) and desktop (1440 × 900), every
main screen, and **all 41 looks applied to the sample photo**. It formed its impressions before
reading any project document, then checked fourteen claims of the pass one by one.

Not reached: Select object, the Remove fill, portrait retouching (the sample has no face), lens
blur, AI upscale, dragging the curve and colour mix, hold-to-preview, offline use, reduced motion, a
real phone. Swipe between looks could not be driven by the reviewer's synthetic swipe (the
end-to-end test for it passes). Everything ran under software rendering on a CPU-only laptop.

---

## Verdict

**Better, and not there yet.** The pass fixed the journey's bugs and gave the looks a real identity,
but the second look found one serious defect the first audit and my own checks missed (the exposure
fit blowing out bright photos, now fixed) and several things that still keep the app below
Lightroom Mobile, VSCO and Snapseed.

| Area | Score /10 | Reason |
| --- | --- | --- |
| First impression | 5.5 | Strong headline and actions, then a soft hero photo and empty space on desktop |
| Identity | 7.5 | Wordmark, frame numbers, date stamp and rolls are distinctive |
| Looks quality | 5 → see below | About ten excellent looks; nine were blown out by the exposure fit (fixed after this score); about nine are subtle on this photo |
| Looks browsing | 5.5 | The phone strip is good; previews don't show the fit; desktop tiles are small |
| Editing on phone | 7 | The Light sheet is very good; a sheet left tall hurt later tools (fixed); crop takes two taps |
| Editing depth on desktop | 7.5 | Curve, colour mix, grading, mixer, levels, masks and effects are all there |
| Motion | 6 | Recognisable, but the dissolve plays on every look tap and the intro on every hard load |
| Consistency | 6 | Leftover "preset" and "favourites" (fixed); two slider styles; some wrapped labels |
| Speed feel | 7.5 | Photo and six previews on screen in 1.5 s on a phone; export in half a second |
| Trust and honesty | 6.5 | Honest notes and privacy copy; undermined by previews that differ from the result |

Average 6.4. The scores were given before the fixes in the next section.

---

## The seven questions

**Does it feel like a premium product?** In the phone editor, the export dialog and the Match a look
dialog on desktop, yes. On home, no: the particle hero shows the only large photo on the first
screen soft and blocky, and desktop home has large empty areas.

**Are the looks beautiful enough to want to try?** About ten are: Silver Retain, Velvet Slide,
Classic Monochrome, Silver Gelatin, Tea Stain, Cocoa, Golden Hour, Midnight Cinema, Powder Blue and
Peach Soft Light. The rest ranged from fine to broken, for the reasons under "What it found".

**Is editing enjoyable?** On the phone Light sheet, yes. Auto was sensible but timid and silent.

**Is anything still confusing?** "Preset" in Match a look, "favourites" beside "Kept", "project"
beside "edit", engineering terms in Settings and Match, a roll row that a mouse could not scroll.

**Are animations smooth and purposeful?** The look dissolve is distinctive but tiring when you
browse many looks; the intro costs two to three seconds on every hard load, on every page.

**Is it fast?** Yes, even under software rendering.

**Does it have a recognisable identity?** Yes, strongest in the editor and export, weakest on home.

---

## Check of the pass's claims

| Claim | Result |
| --- | --- |
| 41 looks in 8 rolls | Pass |
| None is a near-copy of the original | **Fail on this photo**: Autumn Mood, Mediterranean Summer, Green Room and Tungsten Hours differ only slightly from the sample; Daylight, Clean Studio and Pocket Flash read as unchanged at tile size |
| A fresh photo opens on "For this photo" with six picks and the traits | Pass (the traits line was cut off on desktop; fixed) |
| Applying a look on a phone does not move the photo | Pass (identical position and size before, during and after) |
| Teal and Orange is fitted for exposure only | Pass (note reads "exposure +0.09"; the look is subtle on this photo) |
| Auto: twice reports "Already balanced"; one undo reverts | Pass |
| Crop has Cancel; Escape cancels | Pass, with a bug: the cancelled crop came back on Undo (fixed) |
| The dock's More returns to the grid; Photos has a back chevron | Pass |
| The look chip hides while crop is active | Pass |
| The export preview shows the photo | Pass |
| Home leads with your edits once you have one; a first visit keeps the story | Pass ("your edits" at 313 px of 844) |
| Editor chrome is near-neutral | Pass (a slight fixed violet lean, the same under any look) |
| The look library uses a real photo and opens on "all" | Pass |
| Wording says look and roll | **Fail**: "preset" five times in Match a look and once in Settings (fixed) |
| No application errors in the console | Pass |

---

## What it found, and what was done

### Fixed after this audit

| Finding | Fix |
| --- | --- |
| **Nine looks were pushed about +1.2 EV and blew the sky to white** (Sunday Negative, Retro 70s, Warm Film Cinema, Airy Blue Film, Faded Film, Creamy Beige, Moss, Dark Academia, Night Neon). Dark Academia, "dim, warm and bookish", rendered bright and washed; six of them collapsed into the same picture. Cause: the adaptive exposure fit only guarded the brightest 0.5% of pixels, which on a sunlit street were already white, so the guard never engaged. This flaw is older than this pass (roadmap 1.2) but the curated library made it obvious | A second guard on the top 3% of pixels (not past 0.90, nor more than 0.03 above where they were), and the largest offset is now ±1.0 EV. Rules in `docs/AI_ARCHITECTURE.md` |
| A cancelled crop came back on Undo, and each cancel added two history entries | Cancel now rewinds to the state from before the tool opened (when only the crop changed) |
| Auto said nothing about what it changed | A short line: "Auto: exposure +0.08 · shadows +18 · vibrance +16" |
| A sheet pulled tall for one tool stayed tall for the next, so Crop and Remove worked on a 232 px photo | Each tool opens at its own compact size |
| "preset" in Match a look and Settings; "favourites" beside "Kept"; "Generic look"; "Export JSON" | "look" throughout; Keep / Remove from Kept; "As measured"; "Export as a file" |
| Settings said adaptive looks even out white balance | Says what it does now: exposure, and the photo's own cast only |
| The desktop roll row could not be scrolled with a mouse | The wheel turns it sideways |
| The "picked for this photo" line was cut off | It wraps |

### Not fixed in this pass (ordered by impact)

1. **Look previews don't show the fit.** A tile shows the look as made; the photo gets the look
   fitted to it. With the exposure fix the gap is small on most photos, but it still exists. Fix:
   render each visible tile with the same fit (about 30–50 ms per tile, so it needs to run off the
   main thread or be spread over idle time).
2. **Some looks are subtle on some photos.** Daylight and Clean Studio are meant to be gentle, but
   Autumn Mood, Mediterranean Summer, Green Room and Tungsten Hours did little on a street with no
   foliage, sea or lamps, because they work on colours this photo lacks. Look-alike groups on this
   photo: Neo-Noir Emerald / Sodium Streetlight / Gritty Street, and Silver Retain / Silver Gelatin.
   They were judged on one photo; the library needs to be reviewed on a portrait, a landscape and a
   night scene, which the repo doesn't have.
3. **Deep blacks in six looks** (Newsprint, Silver Retain, Silver Gelatin, Velvet Slide, Vivid
   Postcard, Analog Flash: 8–15% of pixels near black against 3% in the original). Partly by
   design for the monochrome looks; Vivid Postcard and Analog Flash should be eased.
4. **Home's hero.** Even with four times the particles the photo reads as low resolution. Both
   audits recommend a real photo there, with the particles as a brief entrance at most.
5. **The dissolve on every look tap, and the intro on every hard load.** Both audits recommend a
   quick cross-fade after the first apply, and the intro once per session.
6. **Desktop look tiles are small** (about 120 × 90 px). A wider left rail, or a one-column list
   with larger previews, would let a look be judged before it is applied.
7. **Crop takes an extra tap** ("Adjust crop on photo"); phone Colour opens on the curve.
8. **Touch targets still under 44 px** on phones: Export (40), Light chips (36), Auto and Reset
   (40), crop ratios (40), export format and size segments (36), the export dialog's close (36).
9. **Match a look**: starting it from home makes a second edit of the same photo; the saved name
   was not carried to the chip in one path; its copy still has engineering terms (model names,
   "Image statistics"); the result page is long on phones. Unchanged from the first audit's
   "medium" list.
10. **No HEIC or RAW**, and no sync between devices.

---

## Tests after the final changes

- Type-check clean; lint 0 errors.
- Unit tests and the affected end-to-end tests: see `PROJECT_STATUS.md` for the exact runs and
  results (only tests that were actually run are listed there).

---

## What would still stop it competing

In order:

1. **Look trust**: previews must show exactly what a tap will give, on every photo.
2. **Look range, proven on real photos**: portraits, night, landscape. One sample photo is not enough
   to tune or to show a library.
3. **A home screen that sells the product with a sharp photograph.**
4. **The formats people's cameras produce**: HEIC first.
5. **The trend features in the Gen Z research** (digicam kit, blur effects, photo dumps, frames,
   look cards, a camera with live looks): the engine can carry them; none exists yet.
6. **Calmer motion** while browsing looks.
7. **A real-phone pass** on Android and iPhone, which has never been done.

## Decisions that are yours

1. Keep or remove the showpieces from the morning of 2026-11-14 (particle hero, intro on every load,
   look dissolve on every tap, custom cursor, 3D rolls ring). Two independent audits now recommend
   calming or removing them; I have kept them.
2. Which of the eight researched features to build first.
3. Whether to add three or four licensed sample photos (a portrait, a night scene, a landscape) so
   looks can be tuned and shown properly.
