# PRO PRESET LIBRARY: 36 Premium Color-Grading Looks

**Purpose:** Hand this file to the coding agent. It defines 36 one-click presets in the style of expensive paid packs (cinematic, moody, film, portrait, airy, landscape, street, B&W, social). Every preset is a complete set of slider values using the same controls as the app (Light, Colour, Detail, Effects).

> Preset names are original. "Inspired by" notes describe a general look, not any brand's proprietary preset.

---

## 0. READ FIRST: Instructions for the implementing agent

### 0.1 Parameter schema (map these to the app's real parameter names)

| Group | Key | Range | Notes |
|---|---|---|---|
| Light | `exposure` | -5.0 … +5.0 | **Delta**, added to the photo's current value |
| Light | `brightness`, `contrast`, `highlights`, `shadows`, `whites`, `blacks` | -100 … +100 | Deltas |
| Presence | `texture`, `clarity`, `dehaze` | -100 … +100 | Deltas |
| Colour | `temp`, `tint` | -100 … +100 | `temp` + is warmer, `tint` + is magenta, - is green |
| Colour | `vibrance`, `saturation` | -100 … +100 | Vibrance protects skin and saturated colours |
| HSL | `R O Y G A B P M` → `(hue, sat, lum)` | each -100 … +100 | R=red, O=orange, Y=yellow, G=green, A=aqua, B=blue, P=purple, M=magenta |
| Grading | `sh`, `mid`, `hi` → `(hue°, sat%, lum)` | hue 0-360, sat 0-100, lum -100…100 | Shadows, midtones, highlights wheels |
| Grading | `blend` (0-100), `balance` (-100…100) | | Wheel blending and shadow↔highlight balance |
| Curve | `fade` | 0 … 40 | Lifts the black point (matte look), in 0-255 units |
| Curve | `scurve` | -50 … +100 | S-curve strength on RGB master (negative = flat) |
| Curve | `shoulder` | 0 … 30 | Pulls white point down (soft film highlights) |
| Detail | `sharpen`, `nr` | 0 … 100 | Sharpening amount and luminance noise reduction |
| Effects | `vignette` | -100 … +100 | Negative = dark corners |
| Effects | `grain` → `(amount, size, roughness)` | 0-100 each | Film grain |
| Mode | `bw` | true/false | Convert to black and white |

Anything not listed in a preset is **0 / neutral**.

### 0.2 Rules that make presets look great on any photo

1. **Presets are deltas, not absolutes.** Add values to the photo's current settings. Never overwrite the user's exposure with a fixed number.
2. **Amount slider (0-100%)** multiplies every delta linearly. At 100% the preset is fully applied. At 50% it is half-strength. Curves, grading saturation and grain also scale. The existing "Applied ... Amount" control in the left panel already fits this.
3. **Processing order:** exposure → white balance (temp/tint) → tone (highlights/shadows/whites/blacks/contrast/brightness) → tone curve (fade/scurve/shoulder) → HSL → color grading → presence (texture/clarity/dehaze) → detail → effects (vignette/grain). Grain and vignette always come last.
4. **Skin protection:** HSL changes to **Orange (and Red)** are what move skin. Presets that shift Orange hue or saturation by more than ±10 should also use vibrance rather than raw saturation for global boosts.
5. **Clamp safely:** after applying, clamp every value to its legal range. Never clip more than about 1% of pixels at pure black or white unless the preset is intentionally "Crushed".
6. **Thumbnails:** generate each preset thumbnail by rendering the real preset on a small downscaled copy of the current photo (as the panel already does).
7. **Categories → tabs.** Use the category headings below as the category chips in the preset browser. Add a **"Premium"** tag so these appear first.
8. **Presets must be editable.** After applying, all sliders move to the preset's values so the user can fine-tune. Do not bake them into a hidden layer.

### 0.3 Data format

Store each preset as JSON. Example for preset #1:

```json
{
  "id": "teal-orange-blockbuster",
  "name": "Teal & Orange Blockbuster",
  "category": "Cinematic",
  "tags": ["premium", "cinema", "warm-skin", "teal-shadows"],
  "params": {
    "exposure": 0.05, "contrast": 18, "highlights": -25, "shadows": 12,
    "whites": 8, "blacks": -10, "clarity": 8, "dehaze": 6,
    "temp": 4, "vibrance": 10, "saturation": -4,
    "hsl": { "O": [0, 6, 4], "B": [-8, -10, -12], "A": [-15, 10, -8], "G": [-15, -15, -5] },
    "grading": { "sh": [195, 40, -6], "mid": [30, 8, 0], "hi": [38, 32, 4], "blend": 55, "balance": -10 },
    "curve": { "fade": 4, "scurve": 25, "shoulder": 3 },
    "effects": { "vignette": -12 }
  }
}
```

All 36 presets below use the same abbreviations; convert them to this JSON.

---

## 1. CINEMATIC

### 1. Teal & Orange Blockbuster
*Hollywood summer-movie look. Warm skin, teal shadows. Great for people and cityscapes.*
```
exposure +0.05 | contrast +18 | highlights -25 | shadows +12 | whites +8 | blacks -10
clarity +8 | dehaze +6 | temp +4 | vibrance +10 | saturation -4
hsl: O(0,+6,+4) A(-15,+10,-8) B(-8,-10,-12) G(-15,-15,-5)
grade: sh(195,40,-6) mid(30,8,0) hi(38,32,+4) blend 55 balance -10
curve: fade 4 | scurve 25 | shoulder 3
vignette -12
```

### 2. Neo Noir Teal
*Dark, cold and dramatic. Night streets, moody portraits.*
```
exposure -0.15 | contrast +24 | highlights -35 | shadows -8 | whites -6 | blacks -22
clarity +10 | dehaze +10 | temp -12 | tint -4 | vibrance -8 | saturation -14
hsl: O(+3,-8,0) A(-10,+15,-15) B(-5,+5,-20) G(-25,-30,-15)
grade: sh(200,55,-10) mid(210,12,0) hi(180,18,0) blend 60 balance -25
curve: fade 6 | scurve 35 | shoulder 6
vignette -28 | grain(14,30,45)
```

### 3. Midnight Cinema
*Deep blue-violet night grade with glowing highlights.*
```
exposure -0.1 | contrast +20 | highlights -20 | shadows +6 | whites +14 | blacks -16
clarity +6 | dehaze +8 | temp -10 | tint +6 | vibrance +6 | saturation -6
hsl: B(+4,+8,-18) P(+6,+12,-8) M(0,-10,0) O(0,+4,+2)
grade: sh(235,50,-8) mid(260,12,0) hi(30,22,+6) blend 60 balance -20
curve: fade 5 | scurve 28 | shoulder 4
vignette -20 | grain(8,25,40)
```

### 4. Desert Dune
*Sand-gold, desaturated, epic sci-fi look. Perfect for dry landscapes and Pakistani summer scenes.*
```
exposure +0.1 | contrast +14 | highlights -30 | shadows +14 | whites +4 | blacks -8
clarity +12 | dehaze +14 | temp +14 | tint +2 | vibrance -6 | saturation -14
hsl: O(+4,-4,+6) Y(+2,-10,+4) G(-30,-45,-8) A(-10,-35,-5) B(0,-30,-10)
grade: sh(30,25,-6) mid(38,14,0) hi(45,30,+6) blend 50 balance +8
curve: fade 8 | scurve 18 | shoulder 5
vignette -14 | grain(10,25,40)
```

### 5. Warm Cinema Amber
*Romantic amber glow like a drama film.*
```
exposure +0.05 | contrast +12 | highlights -22 | shadows +16 | whites +6 | blacks -6
clarity +4 | temp +18 | tint +3 | vibrance +8 | saturation -6
hsl: O(+3,+4,+5) Y(+5,-6,0) G(-20,-25,-8) B(+10,-25,-15)
grade: sh(25,32,-4) mid(35,12,0) hi(42,28,+6) blend 55 balance +5
curve: fade 7 | scurve 18 | shoulder 6
vignette -16 | grain(10,28,45)
```

### 6. Cold Thriller
*Steel-blue and washed out. Tense, modern, grey.*
```
exposure 0 | contrast +16 | highlights -28 | shadows +4 | whites -4 | blacks -14
clarity +14 | dehaze +12 | temp -16 | tint -2 | vibrance -12 | saturation -22
hsl: O(0,-6,0) B(0,-8,-14) A(-8,-15,-10) G(-20,-40,-12)
grade: sh(210,38,-6) mid(205,10,0) hi(195,14,+2) blend 55 balance -15
curve: fade 5 | scurve 30 | shoulder 4
vignette -18 | grain(10,25,40)
```

---

## 2. MOODY

### 7. Moody Forest
*Deep emerald greens, dark and rich. Made for trees, gardens, rain and mist like the user's current photo.*
```
exposure -0.2 | brightness -4 | contrast +16 | highlights +10 | shadows +8 | whites +6 | blacks -26
texture +8 | clarity +10 | dehaze +10 | temp -4 | tint -6 | vibrance +10 | saturation -10
hsl: R(0,-20,-10) O(+4,-10,0) Y(-30,-25,-12) G(+10,+8,-30) A(-5,+10,-20) B(0,-10,-25)
grade: sh(170,45,-8) mid(130,10,0) hi(65,18,+2) blend 55 balance -20
curve: fade 6 | scurve 28 | shoulder 4
vignette -22 | grain(10,28,40)
```

### 8. Dark Academia
*Brown, olive and bronze library mood. Old brick, books, autumn.*
```
exposure -0.1 | contrast +14 | highlights -20 | shadows +10 | whites -6 | blacks -12
clarity +8 | temp +12 | tint +4 | vibrance -4 | saturation -16
hsl: O(+2,-4,-4) Y(+10,-15,-8) G(-35,-30,-18) A(-20,-40,-15) B(0,-40,-20)
grade: sh(35,35,-8) mid(40,16,0) hi(50,20,+4) blend 50 balance 0
curve: fade 12 | scurve 22 | shoulder 8
vignette -24 | grain(14,30,50)
```

### 9. Moody Chocolate Brown
*Rich brown mids, creamy dark shadows. Portraits, coffee, interiors.*
```
exposure -0.15 | contrast +10 | highlights -18 | shadows +12 | whites -4 | blacks -10
clarity +6 | temp +10 | tint +3 | vibrance -2 | saturation -10
hsl: R(0,-6,-6) O(+2,0,-4) Y(+8,-20,-6) G(-30,-45,-15) A(-20,-50,-15) B(0,-50,-20)
grade: sh(25,40,-10) mid(30,18,0) hi(40,15,+3) blend 55 balance -5
curve: fade 10 | scurve 20 | shoulder 7
vignette -20 | grain(10,25,45)
```

### 10. Rainy Day Blue
*Cool, desaturated and soft. Puddles, grey skies, reflections.*
```
exposure -0.05 | contrast +10 | highlights -16 | shadows +14 | whites +4 | blacks -14
texture +6 | clarity +8 | dehaze +6 | temp -14 | tint -3 | vibrance -6 | saturation -18
hsl: O(0,-8,0) G(-25,-25,-8) A(-5,+5,-8) B(0,-5,-10)
grade: sh(215,35,-6) mid(200,10,0) hi(190,12,+3) blend 55 balance -10
curve: fade 9 | scurve 18 | shoulder 6
vignette -14 | grain(8,25,40)
```

---

## 3. FILM EMULATION

### 11. Portra Warm 400 (inspired by classic portrait film)
*Soft contrast, peachy skin, creamy pastels. The "expensive wedding photographer" look.*
```
exposure +0.2 | contrast -4 | highlights -20 | shadows +20 | whites +4 | blacks +4
clarity -4 | temp +9 | tint +3 | vibrance +6 | saturation -6
hsl: R(-3,-4,+4) O(+2,-2,+6) Y(+6,-12,+4) G(-12,-18,+4) A(+5,-10,+4) B(+4,-12,-4)
grade: sh(30,16,+3) mid(35,12,+2) hi(45,22,+5) blend 60 balance +5
curve: fade 12 | scurve 8 | shoulder 8
grain(18,32,50)
```

### 12. Superia Green Street (inspired by consumer green-cast film)
*Cool green shadows, punchy reds. Casual street and travel.*
```
exposure +0.05 | contrast +10 | highlights -14 | shadows +10 | whites +6 | blacks -4
temp -2 | tint -8 | vibrance +10 | saturation +2
hsl: R(0,+12,0) O(0,+4,0) Y(-10,-8,0) G(-5,+6,-6) A(-5,+12,-4) B(0,+10,-8)
grade: sh(150,28,-4) mid(110,8,0) hi(50,24,+4) blend 55 balance -10
curve: fade 8 | scurve 22 | shoulder 5
grain(22,36,55) | vignette -10
```

### 13. Tungsten Night 800 (inspired by cinema-stock night film)
*Glowing red halation feeling on lights, teal-blue shadows. Night cityscapes.*
```
exposure 0 | contrast +10 | highlights -22 | shadows +14 | whites +10 | blacks -6
dehaze -4 | temp -8 | tint +4 | vibrance +8 | saturation +2
hsl: R(+4,+10,+4) O(+2,+6,+6) B(-4,+8,-14) A(-10,+12,-10)
grade: sh(200,42,-6) mid(210,10,0) hi(15,34,+8) blend 60 balance -15
curve: fade 8 | scurve 20 | shoulder 8
grain(26,38,60) | vignette -10
```

### 14. Golden 200 Nostalgia (inspired by warm consumer film)
*Warm, golden, sunny memories.*
```
exposure +0.15 | contrast +6 | highlights -16 | shadows +16 | whites +4 | blacks 0
temp +16 | tint +4 | vibrance +6 | saturation +2
hsl: R(0,+6,0) O(+2,+4,+4) Y(+4,+10,+6) G(-20,-20,0) B(+8,-18,-8)
grade: sh(35,26,-2) mid(42,16,0) hi(48,30,+5) blend 55 balance +8
curve: fade 10 | scurve 12 | shoulder 7
grain(20,34,55) | vignette -8
```

### 15. Vintage 70s Faded
*Faded blacks, warm magenta cast, retro summer.*
```
exposure +0.1 | contrast -6 | highlights -12 | shadows +18 | whites -4 | blacks +8
temp +12 | tint +8 | vibrance -4 | saturation -8
hsl: R(+4,-6,0) O(+4,-4,+2) Y(+8,-14,0) G(-28,-32,0) A(-12,-30,0) B(+8,-30,-4)
grade: sh(330,26,+2) mid(30,16,+2) hi(48,28,+4) blend 65 balance +10
curve: fade 22 | scurve 6 | shoulder 12
grain(28,38,60) | vignette -14
```

---

## 4. PORTRAIT / SKIN

### 16. Creamy Skin Glow
*Smooth, bright, flattering. Everyday portraits and selfies.*
```
exposure +0.2 | brightness +4 | contrast -6 | highlights -16 | shadows +18 | whites +6 | blacks +2
texture -12 | clarity -8 | temp +5 | tint +2 | vibrance +8 | saturation -4
hsl: R(-2,-6,+6) O(+3,-2,+8) Y(+8,-14,+4) G(-20,-25,0) A(0,-20,0) B(0,-20,-6)
grade: sh(20,16,+2) mid(28,12,+2) hi(40,18,+4) blend 65 balance +6
curve: fade 8 | scurve 4 | shoulder 6
sharpen 20 | vignette -4
```

### 17. Golden Hour Portrait
*Sun-kissed rim-light glow. Outdoor portraits.*
```
exposure +0.15 | contrast +6 | highlights -24 | shadows +14 | whites +10 | blacks -4
clarity +2 | dehaze -4 | temp +16 | tint +3 | vibrance +10 | saturation -2
hsl: R(0,+4,+2) O(+2,+4,+6) Y(+8,-4,+4) G(-22,-22,-4) B(+6,-22,-10)
grade: sh(24,24,-3) mid(34,14,+1) hi(44,34,+8) blend 60 balance +10
curve: fade 6 | scurve 14 | shoulder 5
vignette -10 | grain(8,25,40)
```

### 18. Editorial Matte
*Fashion-magazine matte finish, muted, premium.*
```
exposure +0.05 | contrast +4 | highlights -20 | shadows +16 | whites -6 | blacks +6
texture -4 | clarity +2 | temp +3 | vibrance -10 | saturation -14
hsl: R(0,-10,0) O(0,-8,+2) Y(0,-24,0) G(-20,-45,-4) A(0,-45,0) B(0,-40,-6)
grade: sh(210,12,0) mid(30,8,0) hi(40,14,+2) blend 60 balance 0
curve: fade 18 | scurve 10 | shoulder 10
grain(10,25,40) | sharpen 24
```

### 19. High Fashion Clean
*Clean, crisp, slightly cool. Studio and product-style shots.*
```
exposure +0.15 | brightness +6 | contrast +14 | highlights -12 | shadows +8 | whites +14 | blacks -6
clarity +10 | dehaze +2 | temp -3 | vibrance +4 | saturation -4
hsl: O(0,-4,+4) R(0,-4,0) B(0,-10,-4)
grade: sh(215,12,0) mid(0,0,0) hi(50,8,+2) blend 50 balance 0
curve: fade 0 | scurve 26 | shoulder 0
sharpen 35 | nr 10
```

---

## 5. LIGHT & AIRY

### 20. Airy Wedding Bright
*Bright, soft, pastel. The bridal-blog look.*
```
exposure +0.5 | brightness +10 | contrast -10 | highlights -24 | shadows +26 | whites +10 | blacks +10
texture -6 | clarity -10 | dehaze -8 | temp +3 | vibrance +6 | saturation -8
hsl: O(+2,-2,+8) Y(+6,-18,+6) G(-18,-30,+8) A(-6,-20,+8) B(0,-24,+4)
grade: sh(30,10,+4) mid(35,10,+3) hi(45,16,+4) blend 70 balance 8
curve: fade 14 | scurve 0 | shoulder 10
sharpen 18
```

### 21. Soft Pastel Dream
*Hazy, dreamy pastel haze with a pink-lilac tint.*
```
exposure +0.35 | brightness +6 | contrast -14 | highlights -18 | shadows +22 | whites +4 | blacks +14
texture -8 | clarity -14 | dehaze -14 | temp +2 | tint +8 | vibrance +4 | saturation -6
hsl: R(+4,-4,+8) O(+2,-6,+8) G(-12,-24,+8) A(+4,-18,+8) B(+6,-20,+6) P(+2,0,+6) M(0,+4,+6)
grade: sh(300,16,+4) mid(330,10,+3) hi(40,14,+4) blend 75 balance 10
curve: fade 20 | scurve 0 | shoulder 12
grain(6,22,35)
```

### 22. Clean White Minimal
*Bright, neutral, whites truly white. Interiors, products, architecture.*
```
exposure +0.3 | brightness +8 | contrast +4 | highlights -14 | shadows +16 | whites +20 | blacks -2
clarity +4 | dehaze -2 | temp 0 | vibrance -4 | saturation -8
hsl: Y(0,-12,0) G(-15,-25,0) B(0,-14,0)
grade: sh(0,0,0) mid(0,0,0) hi(0,0,0) blend 50 balance 0
curve: fade 2 | scurve 12 | shoulder 0
sharpen 28 | nr 8
```

---

## 6. LANDSCAPE / TRAVEL

### 23. Epic Landscape Pop
*Rich, punchy, detailed. Mountains, skies, big views.*
```
exposure +0.05 | contrast +20 | highlights -34 | shadows +24 | whites +12 | blacks -14
texture +16 | clarity +18 | dehaze +14 | temp +3 | vibrance +24 | saturation +6
hsl: O(0,+6,0) Y(-4,+12,0) G(-6,+14,-6) A(0,+10,-8) B(0,+16,-16)
grade: sh(220,20,-4) mid(0,0,0) hi(42,18,+3) blend 50 balance 0
curve: fade 0 | scurve 28 | shoulder 2
sharpen 45 | nr 12
```

### 24. Golden Hour Glow
*Warm sunset gold on any outdoor scene.*
```
exposure +0.1 | contrast +14 | highlights -30 | shadows +20 | whites +8 | blacks -8
clarity +8 | dehaze +4 | temp +20 | tint +4 | vibrance +16 | saturation +2
hsl: R(+2,+8,+2) O(+2,+10,+4) Y(+4,+14,+6) G(-18,-8,-4) B(+8,-14,-12)
grade: sh(260,16,-4) mid(34,16,0) hi(42,40,+8) blend 55 balance +12
curve: fade 4 | scurve 20 | shoulder 4
vignette -10
```

### 25. Tropical Vivid
*Bold, vibrant greens and turquoise. Beaches, jungle, travel.*
```
exposure +0.1 | contrast +14 | highlights -24 | shadows +16 | whites +10 | blacks -8
texture +8 | clarity +10 | dehaze +8 | temp +4 | vibrance +26 | saturation +8
hsl: O(0,+4,+2) Y(-8,+10,+4) G(+6,+18,-4) A(+4,+24,-6) B(0,+20,-10)
grade: sh(190,20,-2) mid(120,6,0) hi(50,20,+4) blend 50 balance 0
curve: fade 0 | scurve 22 | shoulder 2
sharpen 35
```

### 26. Nordic Cool
*Cold, muted, minimal Scandinavian look.*
```
exposure +0.1 | contrast +8 | highlights -20 | shadows +14 | whites +6 | blacks -6
clarity +8 | temp -12 | tint -2 | vibrance -6 | saturation -16
hsl: O(0,-8,0) Y(-10,-30,0) G(-18,-35,-4) A(-4,-10,0) B(0,-6,-8)
grade: sh(215,24,-3) mid(205,8,0) hi(190,12,+3) blend 55 balance -5
curve: fade 6 | scurve 16 | shoulder 4
sharpen 30
```

---

## 7. STREET / URBAN

### 27. Gritty Street
*High contrast, textured, desaturated. Documentary and urban life.*
```
exposure -0.05 | contrast +24 | highlights -26 | shadows +6 | whites +6 | blacks -20
texture +18 | clarity +20 | dehaze +10 | temp +2 | vibrance -10 | saturation -18
hsl: R(0,+4,0) O(0,-6,0) Y(0,-14,0) G(-20,-40,-8) B(0,-24,-12)
grade: sh(210,20,-6) mid(35,8,0) hi(45,14,+2) blend 50 balance 0
curve: fade 3 | scurve 36 | shoulder 2
sharpen 50 | grain(24,34,60) | vignette -16
```

### 28. Neon Night City
*Magenta and cyan glow. Night lights, signs, rain reflections.*
```
exposure +0.05 | contrast +16 | highlights -18 | shadows +10 | whites +12 | blacks -14
clarity +4 | dehaze +6 | temp -6 | tint +10 | vibrance +22 | saturation +6
hsl: R(+4,+10,0) O(+2,0,0) B(-6,+16,-10) P(0,+22,0) M(0,+24,+2) A(-6,+18,-6)
grade: sh(250,48,-8) mid(300,14,0) hi(180,26,+4) blend 65 balance -12
curve: fade 4 | scurve 26 | shoulder 4
vignette -18 | grain(10,26,40)
```

*(Existing "Cyberpunk Neon" and "Y2K Flash" already in the app. Keep them, but this is a more refined alternative.)*

---

## 8. BLACK & WHITE (set `bw: true`)

### 29. Deep Contrast Noir
*Rich blacks, bright whites, dramatic.*
```
bw | exposure 0 | contrast +30 | highlights -20 | shadows +4 | whites +14 | blacks -26
clarity +16 | dehaze +10 | texture +10
bw mix: R(+10) O(+12) Y(+6) G(-6) A(-14) B(-24) P(-10) M(0)   // red/orange up = bright skin, blue down = dark skies
curve: fade 0 | scurve 40 | shoulder 0
vignette -22 | grain(16,30,50)
```

### 30. Soft Matte B&W
*Gentle, lifted blacks, elegant. Portraits and weddings.*
```
bw | exposure +0.1 | contrast -4 | highlights -16 | shadows +16 | whites +2 | blacks +6
clarity -4 | texture -4
bw mix: R(+8) O(+10) Y(+4) G(0) A(-4) B(-10) P(-4) M(0)
curve: fade 16 | scurve 8 | shoulder 8
grain(14,30,50) | vignette -8
```

### 31. Grainy Documentary
*Classic photojournalism with heavy film grain.*
```
bw | exposure 0 | contrast +20 | highlights -22 | shadows +8 | whites +6 | blacks -14
clarity +14 | texture +12
bw mix: R(+6) O(+8) Y(+4) G(-4) A(-8) B(-16) P(-4) M(0)
curve: fade 4 | scurve 28 | shoulder 3
grain(40,40,65) | vignette -14
```

---

## 9. SOCIAL / INFLUENCER

### 32. Matte Pop (social-media favourite)
*Matte blacks with punchy colour. Works on almost everything.*
```
exposure +0.1 | contrast +6 | highlights -18 | shadows +16 | whites +4 | blacks +4
clarity +4 | temp +4 | vibrance +18 | saturation +2
hsl: R(0,+6,0) O(+2,+2,+4) Y(-4,+6,0) G(-8,+4,0) A(0,+10,0) B(0,+10,-8)
grade: sh(210,14,0) mid(30,8,0) hi(45,16,+3) blend 60 balance 0
curve: fade 14 | scurve 16 | shoulder 6
sharpen 28
```

### 33. Warm Sunset Orange
*Burnt-orange sunset mood for golden evenings.*
```
exposure 0 | contrast +14 | highlights -26 | shadows +10 | whites +8 | blacks -10
clarity +4 | temp +22 | tint +6 | vibrance +14 | saturation +2
hsl: R(+4,+8,0) O(+2,+8,+2) Y(+6,+10,+4) G(-26,-24,-6) B(+14,-20,-14) P(+6,-6,-4)
grade: sh(280,24,-6) mid(25,18,0) hi(35,42,+6) blend 60 balance +12
curve: fade 6 | scurve 22 | shoulder 4
vignette -14 | grain(8,25,40)
```

### 34. Pastel Pink Aesthetic
*Soft pink-peach tones, cute and bright.*
```
exposure +0.3 | brightness +4 | contrast -8 | highlights -16 | shadows +20 | whites +6 | blacks +8
texture -6 | clarity -8 | temp +4 | tint +10 | vibrance +8 | saturation -4
hsl: R(+4,-2,+8) O(+4,-4,+8) Y(+6,-16,+6) G(-14,-26,+6) B(+8,-18,+4) P(0,+4,+6) M(-4,+8,+8)
grade: sh(340,16,+3) mid(10,12,+2) hi(25,18,+4) blend 70 balance 8
curve: fade 14 | scurve 4 | shoulder 9
```

### 35. Clean Influencer Bright
*Bright, clean, slightly warm. Lifestyle and food.*
```
exposure +0.3 | brightness +6 | contrast +8 | highlights -16 | shadows +14 | whites +12 | blacks -2
clarity +6 | temp +5 | vibrance +14 | saturation 0
hsl: O(+2,+2,+6) Y(0,+4,+4) G(-6,+4,0) A(0,+6,0) B(0,+4,-4)
grade: sh(0,0,0) mid(30,6,0) hi(45,12,+3) blend 50 balance 0
curve: fade 4 | scurve 18 | shoulder 2
sharpen 32
```

### 36. Cyber Teal Magenta Glow
*Modern teal shadows, magenta highlights. Gaming and tech aesthetic.*
```
exposure 0 | contrast +18 | highlights -20 | shadows +8 | whites +10 | blacks -12
clarity +6 | dehaze +6 | temp -4 | tint +8 | vibrance +18 | saturation +4
hsl: R(+6,+8,0) B(-8,+12,-10) A(-6,+16,-6) P(+4,+14,0) M(0,+16,+2)
grade: sh(185,42,-6) mid(280,10,0) hi(320,30,+4) blend 65 balance -8
curve: fade 5 | scurve 24 | shoulder 4
vignette -14 | grain(8,25,40)
```

---

## 10. QUALITY CHECKLIST (agent must verify)

- [ ] All 36 presets load, appear in the browser with real thumbnails, and can be searched by name or tag.
- [ ] Applying any preset updates every slider so the user can edit it afterwards.
- [ ] The **Amount** slider (0-100%) scales every delta smoothly, including grading, curve and grain.
- [ ] Applying a preset twice does **not** stack. It replaces the previous preset and starts from the photo's base state.
- [ ] Test each preset on 4 photos: a bright outdoor shot, a dark/night shot, a portrait, and a green/forest shot. Check there is no obvious clipping, banding, or orange/radioactive skin.
- [ ] B&W presets fully desaturate and use the `bw mix` channel weights (or HSL luminance as a fallback).
- [ ] Undo/redo restores the state from before the preset.
- [ ] Preset JSON lives in one file (for example `presets/premium.json`) so more can be added later.
- [ ] Export (full resolution) matches the preview look.

---

## 11. BONUS: quick-edit ideas (optional)

- **"Surprise me"** button that applies a random Premium preset at 70%.
- **Preset strength memory:** remember the last Amount used per preset.
- **Favourites** star on every preset.
- **Auto-match** that picks the best 3 presets for the current photo (dark → Moody, bright → Airy, green dominant → Forest/Tropical, portrait → Creamy/Portra).

---

## 12. Implementation record (2026-10-11)

These looks were merged with `docs/PREMIUM_PRESETS.md` into the app's **Signature Collection** tab
(`'signature'` in `src/lib/presets/library.ts`; first and default tab). Every look was rendered with the
app's CPU renderer on a bright sky fixture and the 19 Windows wallpapers, and compared on the library test
palette with the 70 original presets and the 30 from `PREMIUM_PRESETS.md`.

**Conversion to the app schema:** `temp` → `temperature`; `sharpen` → `detail.sharpening`; `nr` →
`detail.noiseReduction`; `bw` → `monochrome: 100` with the `bw mix` as HSL luminance; neutral wheels
omitted. The curve is the master curve through x = 0, 0.25, 0.5, 0.75, 1, with black point `fade / 255`,
white point `1 - shoulder / 255`, and the quarter points moved by `scurve × 0.0012`. Values are applied the
app's existing way: absolute partial settings blended by the Intensity slider (Lightroom-style), not deltas
added on top of the photo's own settings. Applying a second preset already replaces the first.

**Rule for overlaps:** when both docs describe the same look, the `PREMIUM_PRESETS.md` version was kept: it
never clipped more than the original on any test image and kept skin closer to neutral. A look was also
dropped if it duplicated one of the original 70, clipped highlights, pushed light skin saturation up by
0.15 or more, or was within 0.01 of another preset.

| # | Look | Result | Reason |
| --- | --- | --- | --- |
| 1 | Teal & Orange Blockbuster | merged | Same look as Blockbuster Teal & Amber (kept) |
| 2 | Neo Noir Teal | merged | Covered by Neo-Noir Emerald, Nordic Noir and the original Moody Blue Cinema |
| 3 | Midnight Cinema | **added** | |
| 4 | Desert Dune | merged | Same look as Desert Epic (kept) |
| 5 | Warm Cinema Amber | **added** | |
| 6 | Cold Thriller | dropped | Same name and look as an original preset |
| 7 | Moody Forest | **added** | Distinct from Moody Forest Fog (dark emerald vs grey fog) |
| 8 | Dark Academia | dropped | Same name and look as an original preset |
| 9 | Moody Chocolate Brown | **added** | |
| 10 | Rainy Day Blue | **added** | |
| 11 | Portra Warm 400 | merged | Same look as Golden Portrait Negative (kept); film-brand name; within 0.009 of #16 |
| 12 | Superia Green Street | **added as Green Cast Street** | Renamed: film-brand name |
| 13 | Tungsten Night 800 | merged | Same look as Cinema Tungsten 500 (kept) |
| 14 | Golden 200 Nostalgia | merged | Same look as Expired Summer Gold (kept) |
| 15 | Vintage 70s Faded | dropped | Same look as the original Retro 70s |
| 16 | Creamy Skin Glow | merged | Same look as Luminous Skin (kept) |
| 17 | Golden Hour Portrait | merged | Same look as Bronze Glow (kept); light skin saturation +0.16 |
| 18 | Editorial Matte | merged | Same look as Bone Matte Editorial (kept); 0.016 from the original Quiet Luxury |
| 19 | High Fashion Clean | merged | Same look as Glossy Cover (kept); clipped up to 10.6 % more pure white |
| 20 | Airy Wedding Bright | merged | Same look as Ivory Bridal (kept) |
| 21 | Soft Pastel Dream | **added** | |
| 22 | Clean White Minimal | dropped | Clipped 17 % more of a bright sky; same look as the original Clean Studio |
| 23 | Epic Landscape Pop | **added** | |
| 24 | Golden Hour Glow | merged | Same name and look as the PREMIUM version (kept); light skin saturation +0.24 |
| 25 | Tropical Vivid | dropped | Same look as the original Tropical Greens; light skin saturation +0.16 |
| 26 | Nordic Cool | merged | Same look as Nordic Noir (kept) |
| 27 | Gritty Street | **added** | |
| 28 | Neon Night City | merged | Same look as Electric Night (kept) |
| 29 | Deep Contrast Noir | merged | Same look as Couture Monochrome (kept, 0.016 apart); clipped highlights |
| 30 | Soft Matte B&W | **added** | |
| 31 | Grainy Documentary | merged | Same look as Silver Gelatin (kept) |
| 32 | Matte Pop | **added** | |
| 33 | Warm Sunset Orange | merged | Same look as Golden Hour Glow (kept); light skin saturation +0.23 |
| 34 | Pastel Pink Aesthetic | merged | Same look as Peach Soft Light / Storybook Pastel (kept) |
| 35 | Clean Influencer Bright | dropped | Same look as the original Clean Bright Lifestyle |
| 36 | Cyber Teal Magenta Glow | merged | Same look as Electric Night (kept); 0.025 from the original Night Neon |

Result: 30 + 11 = **41 Signature presets**, 111 in the library. Descriptions were rewritten as one
sentence each, in the library's style. The quick-edit ideas in section 11 are not implemented.
