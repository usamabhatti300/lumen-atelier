# Real-phone test checklist

The app has only been checked in a desktop browser pretending to be a phone. This list is what to
try on a real one. It takes about 20 minutes per phone. Ideally one iPhone (Safari) and one
Android phone (Chrome).

**Before you start:** the fixes from 2026-11-15 must be live on your Render address. Open the
site, and if an "Update available" banner appears, tap Reload.

For each line, note **OK**, **Slow** or **Broken**, and one sentence if it is not OK. A screen
recording of anything broken helps more than a description.

Phone model: ____________  System version: ____________  Browser: ____________

## 1. Opening and installing

| # | Do this | Expect | Result |
| --- | --- | --- | --- |
| 1.1 | Open the site | Home appears within a few seconds; the opening animation plays once | |
| 1.2 | Scroll home up and down | Smooth; the hero and the rolls ring do not stutter | |
| 1.3 | Install the app (Android: Install app. iPhone: Share → Add to Home Screen) | An icon appears; opening it shows the app full screen | |
| 1.4 | Turn on aeroplane mode and open the installed app | It opens and a photo you edited before can be opened | |

## 2. Getting a photo in

| # | Do this | Expect | Result |
| --- | --- | --- | --- |
| 2.1 | Tap to choose a photo taken with this phone's camera | It opens in the editor | |
| 2.2 | **iPhone only:** choose a photo straight from the Photos library, without converting it | It opens. If you see a message that the format is not supported, write down its exact words | |
| 2.3 | Choose a large photo (the phone's highest camera setting) | It opens; note roughly how many seconds | |
| 2.4 | **Android only:** in your gallery app, Share a photo → Lumen Atelier | It opens in the editor | |

## 3. Looks

| # | Do this | Expect | Result |
| --- | --- | --- | --- |
| 3.1 | Tap five different looks, one after another | Each appears within about a second; the phone does not freeze | |
| 3.2 | Swipe left and right on the photo | The look changes each time | |
| 3.3 | Drag the Amount slider slowly from 0 to 150 | The photo follows your finger without lag | |
| 3.4 | Press and hold the photo | The original shows; letting go returns the edit | |
| 3.5 | Scroll the row of roll names sideways | Smooth; every roll can be reached | |

## 4. Editing

| # | Do this | Expect | Result |
| --- | --- | --- | --- |
| 4.1 | Light → drag Exposure back and forth | The photo follows without lag | |
| 4.2 | Tap Auto | The photo changes and a short message says what changed | |
| 4.3 | Pinch to zoom in, drag to move around, double-tap | Zooms, pans, and returns to fit | |
| 4.4 | More → Crop → drag a corner → Done | The crop is kept | |
| 4.5 | Are any buttons hard to hit with a thumb? | List them | |

## 5. Portrait (use a photo with a face)

| # | Do this | Expect | Result |
| --- | --- | --- | --- |
| 5.1 | More → Portrait and wait | "1 face found" (or the right number); note the seconds | |
| 5.2 | Drag Skin smoothing to 60 | Skin is smoother, eyes, lips and hair stay sharp | |
| 5.3 | Tap Heal spots, then tap a blemish | A ring appears and the blemish is gone | |
| 5.4 | **New:** with Heal spots still on, pinch with two fingers | The photo zooms. No extra ring is left behind | |
| 5.5 | **New:** zoomed in, tap another blemish with one finger | It heals; then pinch out again | |
| 5.6 | Drag Eyes to 60 on a photo where the eyes are half closed | Only the visible part of the eye brightens, not the eyelid | |
| 5.7 | Drag Under-eye to 60 on a photo where the head is tilted | The lightened area sits under each eye, not beside it | |

## 6. Masks, Remove and blur

| # | Do this | Expect | Result |
| --- | --- | --- | --- |
| 6.1 | More → Masks → add a brush layer and paint | A red tint follows your finger | |
| 6.2 | **New:** while the brush is active, pinch with two fingers | The photo zooms and no paint stroke is left from the pinch | |
| 6.3 | More → Remove → paint over a small object | It is filled in; note the seconds | |
| 6.4 | More → Detail → Lens blur → drag Amount up | A progress message, then the background blurs; note the seconds | |
| 6.5 | Portrait → Background → Blur while Lens blur is on | A line of text says the background is being blurred twice | |

## 7. Effects and export

| # | Do this | Expect | Result |
| --- | --- | --- | --- |
| 7.1 | More → Effects → tap three effect tiles | Each appears on the photo at once | |
| 7.2 | Export → choose the Camcorder overlay | The preview shows it | |
| 7.3 | Export a JPEG at full size | It finishes; note the seconds | |
| 7.4 | Save to Photos, or Share | The photo arrives in your gallery and looks like the preview | |
| 7.5 | Export a large photo with Lens blur, Bloom and Motion blur all on | It finishes with no visible lines or squares in the result | |

## 8. General

| # | Question | Answer |
| --- | --- | --- |
| 8.1 | Does the phone get hot, or the battery drop quickly, in ten minutes of editing? | |
| 8.2 | Did the app ever reload by itself or show a blank screen? | |
| 8.3 | **Desktop only:** does the custom cursor ever lag behind the mouse or get in the way on the photo? | |
| 8.4 | Close the app, reopen it an hour later | Your edits are still there | |
| 8.5 | Anything that felt slow, confusing or cheap? | |

## What I will do with the results

- "Slow" on sections 1 and 3 decides whether the rolls ring and the opening animation stay as they are.
- 2.2 decides whether iPhone photo support needs any work at all.
- 4.5 gives the list of buttons to enlarge.
- 5, 6 and 7 timings set how heavy the Portrait and Blur work in later phases is allowed to be.
