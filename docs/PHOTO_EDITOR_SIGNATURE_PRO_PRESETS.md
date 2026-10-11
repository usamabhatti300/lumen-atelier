# Signature Pro Preset Library — Claude Code Implementation Brief

## Goal

Add a genuinely premium library of original photo-editing presets to the existing photo editor. Aim for the polish associated with professional paid packs: intentional color separation, smooth highlight roll-off, rich but detailed shadows, controlled saturation, attractive skin tones, and distinct moods.

**Important:** the app already has “Match a reference look.” Do not rebuild that feature. Integrate these presets into the existing preset schema, rendering pipeline, edit history, and UI.

Create original recipes. Do not copy paid preset files, proprietary LUTs, or claim exact emulation of a commercial pack, film stock, photographer, or brand. Background references: [Adobe color grading](https://www.adobe.com/learn/lightroom-cc/web/adjust-photo-tone-with-color-grading) and [Lightroom editing controls](https://helpx.adobe.com/ie/lightroom/desktop/edit-photos/edit-photos.html).

## Quality bar

- A preset is a real editable recipe, not a name, CSS overlay, fake preview, or random slider values.
- Inspect the current renderer and schema first. Use only controls that genuinely work.
- Possible controls: exposure, contrast, highlights, shadows, whites, blacks, RGB/channel curves, temperature/tint, vibrance/saturation, HSL, color grading, grain, vignette, texture, clarity and dehaze—but omit any unsupported control rather than faking it.
- Every preset must have a distinct visual signature, not merely a different name or tiny exposure change.
- Preserve highlight detail, shadow detail and natural skin tones across varied skin tones and lighting.
- Keep edits non-destructive; applying another preset replaces the prior preset contribution unless stacking is already an intentional feature.
- Generate thumbnails through the real renderer and cache them.
- Preserve reference matching, crop, masks, import/export, undo/redo, history and existing presets.
- Avoid new dependencies and unrelated UI redesigns unless necessary.

## Deliverables

1. Implement the **80 original signature recipes** below.
2. Add categories, search, favorites, recent presets, descriptions and “best for” metadata.
3. Add before/after and intensity only if the existing engine can implement them correctly.
4. Create real-rendered, cached thumbnails.
5. Add validation/tests and a `PRESET_LIBRARY_NOTES.md` describing implementation, tests and limitations.
6. Prefer 80 excellent presets over hundreds of weak variants.

## Suggested data model

Adapt the existing schema first; do not rewrite a working architecture unnecessarily.

```ts
type HslChannel = { hue: number; saturation: number; luminance: number };
type Grade = { hue: number; saturation: number; luminance: number };
type Recipe = {
  exposure?: number; contrast?: number; highlights?: number; shadows?: number;
  whites?: number; blacks?: number; temperature?: number; tint?: number;
  vibrance?: number; saturation?: number; texture?: number; clarity?: number;
  dehaze?: number;
  grain?: { amount: number; size?: number; roughness?: number };
  vignette?: { amount: number; midpoint?: number; feather?: number };
  toneCurve?: { rgb?: [number, number][]; red?: [number, number][];
    green?: [number, number][]; blue?: [number, number][] };
  hsl?: Partial<Record<"red"|"orange"|"yellow"|"green"|"aqua"|"blue"|"purple"|"magenta", HslChannel>>;
  colorGrading?: { shadows?: Grade; midtones?: Grade; highlights?: Grade;
    blending?: number; balance?: number };
};
type Preset = {
  id: string; name: string; category: string; description: string;
  mood: string[]; bestFor: string[]; strength: "subtle"|"balanced"|"bold";
  recipe: Recipe; tags: string[]; version: number;
};
```

Recipe values below are **directional starting points**. Map to actual project units and clamp to valid ranges. The shorthand `B` means exposure, contrast, highlights, shadows, whites, blacks; `WB` means temperature, tint; `Color` means vibrance, saturation; `Grade` means shadows hue/saturation, highlights hue/saturation. HSL values are signed hue/saturation/luminance changes. Leave unspecified controls unchanged. Do not use the sample numbers blindly if the app's units differ.

# 80 original signature recipes

## A. Signature / Editor’s Picks

### 01. Obsidian Cinema — `obsidian-cinema`
Mood: deep, restrained cinematic. Best for portraits, travel and moody scenes.
- B: `-0.10, +22, -32, +16, -8, -20`; WB: `-3, +2`; Color: `+10, -5`
- HSL: orange sat `-6`, orange lum `+8`; yellow sat `-18`; green hue `-12`, sat `-20`; aqua sat `+8`; blue sat `-10`
- Grade: shadows `205/10`, midtones `32/4`, highlights `42/8`, balance `-10`; gentle S-curve.

### 02. Velvet Hour — `velvet-hour`
Warm soft highlights and rich shadows. Portraits and golden-hour lifestyle.
- B: `+0.10, +12, -28, +20, +4, -12`; WB: `+5, +2`; Color: `+12, -2`
- HSL: orange lum `+8`; yellow sat `-12`; green sat `-18`; blue sat `-8`
- Grade: shadows `220/5`, highlights `38/9`, blending `55`, balance `+12`.

### 03. Silver Screen — `silver-screen`
Cool, refined filmic contrast without heavy teal. Fashion and portraits.
- B: `0, +18, -30, +14, +2, -16`; WB: `-4, +1`; Color: `-3, -6`
- HSL: yellow sat `-20`; green sat `-15`; blue lum `+6`
- Grade: shadows `215/7`, highlights `42/3`; subtle S-curve and restrained grain.

### 04. Porcelain Light — `porcelain-light`
Luminous, delicate beauty and wedding look.
- B: `+0.20, -5, -35, +22, +8, -4`; WB: `+1, +2`; Color: `+6, -4`
- HSL: orange sat `-4`, lum `+10`; yellow sat `-14`; green sat `-12`; blue sat `-10`
- Grade: highlights `40/4`, shadows `215/3`; soft highlight roll-off.

### 05. Deep Atmosphere — `deep-atmosphere`
Dark but detailed cinematic depth for forests, mountains and travel.
- B: `-0.25, +24, -38, +12, -8, -22`; WB: `-4, +2`; Color: `+8, -8`
- HSL: green sat `-15`, lum `-8`; aqua sat `+6`; blue lum `-10`
- Grade: shadows `200/12`, midtones `210/4`, highlights `38/5`.

### 06. Clean Lux — `clean-lux`
Neutral editorial crispness without clinical color.
- B: `+0.05, +14, -22, +12, +7, -10`; WB: `0, +1`; Color: `+5, -3`
- HSL: orange lum `+5`; yellow sat `-10`; green sat `-12`; blue sat `-8`
- Subtle cool shadows, neutral highlights, medium-soft S-curve.

### 07. Noir Emerald — `noir-emerald`
Dark elegant forest green for woodland and fashion.
- B: `-0.15, +20, -28, +10, 0, -24`; WB: `-2, +1`; Color: `+8, -7`
- HSL: green hue `-18`, sat `-12`, lum `-12`; yellow sat `-20`; aqua hue `-8`
- Grade: shadows `165/6`, highlights `45/4`; retain foliage variation.

### 08. Arctic Dream — `arctic-dream`
Misty pale blue, silver light and ethereal winter atmosphere.
- B: `+0.15, -8, -30, +24, +6, +2`; WB: `-8, +2`; Color: `-6, -10`
- HSL: aqua hue `-10`, sat `+6`; blue hue `-8`, sat `-5`, lum `+10`; green sat `-18`
- Grade: shadows `210/7`, highlights `205/5`; avoid aggressive teal.

### 09. Analog Poetry — `analog-poetry`
Nostalgic, tactile, slightly faded lifestyle and travel.
- B: `+0.10, -8, -25, +18, -4, +10`; WB: `+3, +2`; Color: `-8, -7`
- HSL: orange lum `+5`; yellow hue `-5`, sat `-15`; green hue `-10`, sat `-22`; blue sat `-12`
- Lifted black curve, warm highlights, nearly neutral shadows, fine grain if supported.

### 10. Editorial Afterglow — `editorial-afterglow`
Polished warm editorial for fashion, portraits and travel.
- B: `+0.05, +10, -30, +16, +3, -10`; WB: `+4, +2`; Color: `+8, -3`
- HSL: orange sat `-3`, lum `+7`; yellow sat `-15`; green sat `-20`; blue sat `-10`
- Grade: shadows `215/4`, highlights `36/8`; gentle S-curve.

## B. Cinematic

### 11. Teal & Amber Reserve — `teal-amber-reserve`
- B: `-0.05, +20, -32, +15, 0, -18`; WB: `+1, +2`; Color: `+14, -4`
- HSL: orange lum `+8`; yellow sat `-12`; green sat `-16`; aqua hue `-12`, sat `+12`; blue hue `-8`
- Grade: shadows `195/12`, midtones `28/5`, highlights `40/10`, balance `-8`.

### 12. Midnight Blockbuster — `midnight-blockbuster`
- B: `-0.30, +28, -38, +8, -10, -24`; WB: `-5, +3`; Color: `+10, -8`
- HSL: blue lum `-10`; orange lum `+6`; green sat `-20`
- Grade: shadows `218/14`, highlights `35/6`; strong but smooth S-curve.

### 13. Desert Epic — `desert-epic`
- B: `+0.05, +18, -30, +14, 0, -14`; WB: `+8, +3`; Color: `+10, -4`
- HSL: orange hue `-3`, lum `+7`; yellow hue `-8`, sat `-8`; blue sat `-20`
- Grade: shadows `215/5`, highlights `35/12`.

### 14. Cold Open — `cold-open`
- B: `-0.10, +18, -30, +12, 0, -16`; WB: `-8, +1`; Color: `+5, -8`
- HSL: aqua sat `+8`; blue lum `-8`; green sat `-16`
- Grade: shadows `210/12`, highlights `48/3`.

### 15. Romantic Thriller — `romantic-thriller`
- B: `-0.05, +16, -34, +18, 0, -18`; WB: `+3, +5`; Color: `+8, -6`
- HSL: orange lum `+6`; magenta sat `-8`; green sat `-24`; blue sat `-8`
- Grade: shadows `225/8`, highlights `345/4`.

### 16. Bleach Bypass Lite — `bleach-bypass-lite`
- B: `-0.05, +28, -22, -5, +5, -22`; Color: `-18, -12`
- HSL: green sat `-12`; blue sat `-12`; orange lum `+4`; texture/clarity `+8` only if supported
- High contrast and restrained color; avoid halos.

### 17. Neo-Noir Rain — `neo-noir-rain`
- B: `-0.25, +25, -25, +8, 0, -25`; WB: `-6, +4`; Color: `+12, -8`
- HSL: blue hue `-10`, sat `+12`, lum `-10`; magenta sat `+8`; yellow sat `-20`
- Grade: shadows `220/15`, highlights `190/8`.

### 18. Sunset Credits — `sunset-credits`
- B: `+0.05, +14, -35, +12, 0, -12`; WB: `+7, +2`; Color: `+12, -3`
- HSL: orange lum `+8`; yellow sat `-10`; blue sat `-12`
- Grade: shadows `215/5`, highlights `30/12`.

## C. Film & Analog

### 19. 35mm Nostalgia — `35mm-nostalgia`
- B: `+0.10, -6, -25, +15, 0, +8`; WB: `+3, +2`; Color: `-6, -5`
- HSL: yellow sat `-12`; green hue `-8`, sat `-18`; blue sat `-10`
- Lifted black point, warm highlights, fine grain if supported.

### 20. Warm Negative — `warm-negative`
- B: `+0.05, -4, -30, +16, 0, +6`; WB: `+6, +3`; Color: `-4, -4`
- HSL: orange lum `+5`; yellow hue `-5`, sat `-10`; blue sat `-12`
- Soft highlight shoulder, subtle grain.

### 21. Cool Lab Print — `cool-lab-print`
- B: `0, +8, -28, +14, 0, +4`; WB: `-5, +2`; Color: `-8, -7`
- HSL: green sat `-15`; blue lum `+5`; yellow sat `-18`
- Cool shadows, neutral highlights, faded toe.

### 22. Expired Summer — `expired-summer`
- B: `+0.15, -12, -25, +20, 0, +12`; WB: `+7, +4`; Color: `-10, -10`
- HSL: green hue `-12`, sat `-22`; yellow sat `-14`; blue hue `+8`, sat `-18`
- Faded curve; whites must not become yellow.

### 23. Faded Chrome — `faded-chrome`
- B: `+0.05, +10, -28, +10, 0, +5`; WB: `-2, +1`; Color: `-8, -8`
- HSL: green sat `-18`; aqua sat `-5`; blue lum `+5`
- Cool bias and controlled highlight roll-off.

### 24. Copper Grain — `copper-grain`
- B: `+0.05, +12, -24, +12, 0, -8`; WB: `+5, +3`; Color: `-4, -4`
- HSL: orange lum `+4`; yellow sat `-12`; green sat `-20`; blue sat `-12`
- Warm highlights, neutral/cool shadows, subtle grain.

## D. Icy / Pale Blue

### 25. Pale Blue Hour — `pale-blue-hour`
- B: `+0.15, -6, -28, +20, +4, +2`; WB: `-7, +1`; Color: `-8, -8`
- HSL: aqua hue `-8`, sat `+5`; blue hue `-5`, lum `+10`; green sat `-15`
- Grade: shadows `210/6`, highlights `205/4`.

### 26. Glacier Glow — `glacier-glow`
- B: `+0.20, +4, -35, +22, +8, -2`; WB: `-9, +2`; Color: `-3, -6`
- HSL: aqua sat `+10`, lum `+8`; blue lum `+12`; yellow sat `-20`
- Bright clean highlights; no cyan skin.

### 27. Blue Porcelain — `blue-porcelain`
- B: `+0.10, -5, -30, +18, +5, +3`; WB: `-5, +3`; Color: `-10, -8`
- HSL: orange lum `+5`; green sat `-18`; blue sat `-5`, lum `+8`
- Smooth transitions and blue-grey palette.

### 28. Winter Silence — `winter-silence`
- B: `-0.05, +10, -30, +16, 0, -12`; WB: `-8, +1`; Color: `-12, -12`
- HSL: green sat `-25`; aqua sat `+4`; blue lum `+4`
- Cool shadows, neutral highlights, subtle grain.

### 29. Mist & Milk — `mist-and-milk`
- B: `+0.25, -14, -32, +26, +4, +8`; WB: `-4, +1`; Color: `-12, -10`
- HSL: green sat `-20`; blue sat `-10`; orange lum `+5`
- Low-contrast fog look; retain texture and detail.

## E. Luxury Editorial

### 30. Runway Black — `runway-black`
- B: `-0.05, +24, -25, +10, +6, -25`; WB: `-1, +1`; Color: `-2, -6`
- HSL: yellow sat `-18`; green sat `-20`; blue sat `-10`; orange lum `+5`
- Strong smooth curve, controlled skin.

### 31. Cashmere Neutral — `cashmere-neutral`
- B: `+0.10, +6, -28, +18, +4, -5`; WB: `+2, +2`; Color: `-4, -5`
- HSL: orange sat `-4`, lum `+7`; yellow sat `-14`; green sat `-20`
- Creamy neutrals; white fabric remains neutral.

### 32. Museum Light — `museum-light`
- B: `+0.10, +12, -35, +14, +5, -8`; WB: `0, +1`; Color: `-3, -5`
- HSL: red sat `-4`; yellow sat `-10`; green sat `-14`; blue sat `-8`
- Neutral color and refined contrast.

### 33. Black Tie — `black-tie`
- B: `-0.10, +22, -28, +12, 0, -22`; WB: `-1, +2`; Color: `+3, -5`
- HSL: blue lum `-8`; yellow sat `-15`; orange lum `+5`
- Deep blacks without losing suit, hair or fabric detail.

### 34. Champagne Editorial — `champagne-editorial`
- B: `+0.10, +8, -30, +16, +5, -6`; WB: `+4, +2`; Color: `+2, -5`
- HSL: orange lum `+6`; yellow sat `-15`; green sat `-20`
- Grade: shadows `215/3`, highlights `38/7`.

## F. Portrait & Skin

### 35. True Skin Studio — `true-skin-studio`
- B: `+0.10, +5, -28, +16, +4, -6`; WB: `0, +1`; Color: `+6, -2`
- HSL: orange hue `0`, sat `-3`, lum `+7`; red sat `-3`; yellow sat `-8`
- Neutral shadows, slightly warm highlights; retain real texture.

### 36. Softbox Cream — `softbox-cream`
- B: `+0.20, -4, -35, +22, +6, +1`; WB: `+2, +2`; Color: `+4, -4`
- HSL: orange lum `+8`, sat `-4`; yellow sat `-12`; green sat `-18`
- Soft roll-off; no artificial blur.

### 37. Bronze Sculpt — `bronze-sculpt`
- B: `+0.05, +16, -28, +12, 0, -14`; WB: `+3, +2`; Color: `+8, -2`
- HSL: orange lum `+4`, sat `-2`; yellow sat `-12`; blue sat `-8`
- Warm midtones and neutral shadows; preserve deep skin richness.

### 38. Beauty Neutral — `beauty-neutral`
- B: `+0.10, +3, -32, +18, +4, -4`; WB: `0, 0`; Color: `+3, -3`
- HSL: orange hue `0`, sat `-2`, lum `+6`; red sat `-2`; magenta sat `-4`
- Minimal curve; respect natural undertones.

### 39. Windowlight Poet — `windowlight-poet`
- B: `+0.15, -5, -32, +22, +3, +2`; WB: `+3, +1`; Color: `+4, -4`
- HSL: orange lum `+7`; yellow sat `-10`; green sat `-16`
- Gentle warm highlights, slightly cool shadows.

### 40. Editorial Flash Skin — `editorial-flash-skin`
- B: `-0.05, +14, -35, +10, +8, -12`; WB: `+1, +1`; Color: `+5, -3`
- HSL: orange lum `+5`, sat `-3`; yellow sat `-10`; blue sat `-8`
- Crisp detail and controlled specular highlights; no plastic skin.

## G. Matte & Muted

### 41. Soft Memory — `soft-memory`
- B: `+0.10, -12, -25, +20, 0, +12`; WB: `+2, +1`; Color: `-10, -8`
- HSL: green sat `-18`; yellow sat `-10`; blue sat `-12`
- Lifted black curve, gentle highlight shoulder.

### 42. Sage Matte — `sage-matte`
- B: `+0.05, -8, -28, +18, 0, +9`; WB: `+1, +2`; Color: `-8, -8`
- HSL: green hue `-14`, sat `-20`, lum `+4`; yellow sat `-12`; blue sat `-10`
- Soft matte curve and restrained greens.

### 43. Dusty Rose Film — `dusty-rose-film`
- B: `+0.10, -8, -25, +16, 0, +8`; WB: `+2, +5`; Color: `-7, -8`
- HSL: red sat `-5`; magenta sat `-8`; green sat `-18`; orange lum `+5`
- Faint rosy highlights, not a pink wash.

### 44. Washed-Out Wonder — `washed-out-wonder`
- B: `+0.20, -18, -30, +24, -2, +15`; WB: `+2, +1`; Color: `-14, -12`
- HSL: green sat `-20`; blue sat `-16`; yellow sat `-12`
- Deliberately faded but readable.

## H. Golden Hour

### 45. Honey Light — `honey-light`
- B: `+0.10, +8, -32, +15, +4, -8`; WB: `+6, +2`; Color: `+10, -2`
- HSL: orange lum `+7`; yellow sat `-10`; green sat `-16`; blue sat `-8`
- Grade: shadows `215/3`, highlights `38/10`.

### 46. Amber Glass — `amber-glass`
- B: `+0.05, +14, -35, +12, 0, -12`; WB: `+8, +2`; Color: `+8, -4`
- HSL: orange hue `-2`, lum `+5`; yellow hue `-5`, sat `-12`; green sat `-20`
- Warm highlights, deep neutral shadows.

### 47. Sunlit Linen — `sunlit-linen`
- B: `+0.20, -2, -30, +20, +7, 0`; WB: `+4, +1`; Color: `+3, -4`
- HSL: yellow sat `-12`; orange lum `+7`; green sat `-15`
- Airy whites without yellow cast.

### 48. Last Light 35 — `last-light-35`
- B: `+0.05, +12, -30, +14, 0, -10`; WB: `+7, +3`; Color: `+8, -4`
- HSL: orange lum `+6`; yellow sat `-14`; blue sat `-12`
- Soft grain and gentle S-curve.

## I. Earthy & Forest

### 49. Moss Cathedral — `moss-cathedral`
- B: `-0.10, +18, -32, +16, 0, -18`; WB: `-2, +2`; Color: `+5, -8`
- HSL: green hue `-18`, sat `-10`, lum `-8`; yellow sat `-18`; aqua sat `+4`
- Grade: shadows `175/7`, highlights `42/4`.

### 50. Olive Gold — `olive-gold`
- B: `+0.05, +10, -25, +14, 0, -10`; WB: `+3, +2`; Color: `+5, -5`
- HSL: green hue `-12`, sat `-15`, lum `-2`; yellow hue `-6`, sat `-10`; blue sat `-10`
- Golden highlights, muted olive greens.

### 51. Rainforest Ink — `rainforest-ink`
- B: `-0.20, +22, -35, +10, 0, -22`; WB: `-3, +1`; Color: `+7, -8`
- HSL: green sat `-12`, lum `-10`; yellow sat `-22`; blue lum `-8`
- Rich varied greens; retain shadow detail.

### 52. Earth & Ash — `earth-and-ash`
- B: `+0.05, +10, -28, +16, 0, -8`; WB: `+2, +1`; Color: `-8, -8`
- HSL: orange sat `-4`; yellow sat `-15`; green sat `-20`; blue sat `-18`
- Warm browns and quiet cool-grey shadows.

## J. Wedding & Romance

### 53. Ivory Vows — `ivory-vows`
- B: `+0.20, -3, -38, +22, +7, -2`; WB: `+2, +2`; Color: `+4, -4`
- HSL: orange lum `+7`; yellow sat `-14`; green sat `-16`; blue sat `-10`
- Creamy but neutral whites; preserve dress detail.

### 54. Rosewater Film — `rosewater-film`
- B: `+0.10, -7, -30, +20, 0, +5`; WB: `+3, +4`; Color: `-4, -6`
- HSL: orange lum `+6`; magenta sat `-8`; yellow sat `-12`; green sat `-20`
- Soft pink warmth in highlights only.

### 55. Garden Ceremony — `garden-ceremony`
- B: `+0.10, +5, -32, +18, +4, -5`; WB: `+2, +1`; Color: `+5, -4`
- HSL: green hue `-10`, sat `-16`, lum `+4`; yellow sat `-12`; orange lum `+6`
- Balanced skin and foliage, no neon greens.

### 56. Candlelit Vows — `candlelit-vows`
- B: `-0.05, +10, -35, +18, 0, -10`; WB: `+7, +2`; Color: `+3, -5`
- HSL: orange lum `+5`; yellow sat `-12`; blue sat `-14`
- Warm highlights and calm shadows; retain candle detail.

## K. Street & Flash

### 57. Direct Flash Archive — `direct-flash-archive`
- B: `-0.05, +20, -38, +10, +8, -18`; WB: `+1, +1`; Color: `+5, -5`
- HSL: red sat `-3`; orange lum `+4`; yellow sat `-12`; blue sat `-8`
- Crisp editorial contrast without fake sharpening.

### 58. Concrete Poetry — `concrete-poetry`
- B: `-0.05, +18, -30, +14, 0, -18`; WB: `-3, +1`; Color: `-8, -10`
- HSL: green sat `-15`; yellow sat `-12`; blue lum `-5`
- Cool urban neutrals, preserved skin.

### 59. Neon Side Street — `neon-side-street`
- B: `-0.20, +20, -30, +8, 0, -20`; WB: `-5, +4`; Color: `+14, -2`
- HSL: blue sat `+10`, lum `-8`; magenta sat `+10`; yellow sat `-18`
- Grade: shadows `225/10`, highlights `320/6`.

### 60. Late Night Candid — `late-night-candid`
- B: `-0.10, +12, -28, +16, 0, -12`; WB: `+2, +3`; Color: `+8, -6`
- HSL: orange lum `+5`; blue lum `-6`; green sat `-18`
- Control mixed light; don't turn all shadows purple.

## L. Travel & Landscape

### 61. Alpine Air — `alpine-air`
- B: `+0.10, +10, -32, +18, +5, -8`; WB: `-3, +1`; Color: `+12, -2`
- HSL: blue sat `+6`, lum `+8`; green sat `-8`; yellow sat `-8`
- Crisp atmosphere without excessive dehaze.

### 62. Oceanic Depth — `oceanic-depth`
- B: `-0.05, +14, -30, +14, 0, -12`; WB: `-4, +1`; Color: `+12, -3`
- HSL: aqua hue `-8`, sat `+10`; blue hue `-6`, sat `+8`; yellow sat `-12`
- Cool sea tones; protect skin and sand.

### 63. Terracotta Coast — `terracotta-coast`
- B: `+0.10, +12, -30, +14, 0, -10`; WB: `+5, +2`; Color: `+8, -3`
- HSL: orange lum `+5`; yellow sat `-10`; aqua sat `+4`; blue sat `-8`
- Warm architecture, blue water, natural skin.

### 64. High Desert Air — `high-desert-air`
- B: `+0.10, +12, -35, +16, 0, -10`; WB: `+4, +1`; Color: `+8, -5`
- HSL: orange lum `+6`; yellow hue `-8`, sat `-10`; blue sat `-18`
- Sandy highlights and clean neutral shadows.

### 65. Tropical Chrome — `tropical-chrome`
- B: `+0.05, +14, -30, +14, 0, -10`; WB: `+2, +1`; Color: `+16, -1`
- HSL: green hue `-8`, sat `-5`; aqua sat `+8`; blue sat `+8`; yellow sat `-8`
- Vivid but controlled; avoid radioactive foliage.

### 66. Storm Atlas — `storm-atlas`
- B: `-0.10, +18, -38, +16, 0, -16`; WB: `-5, +2`; Color: `+5, -8`
- HSL: blue lum `-8`; green sat `-12`; yellow sat `-18`
- Cool atmosphere with restrained separation.

## M. Black & White

### 67. Platinum Noir — `platinum-noir`
- Use real monochrome mode/B&W mixer, not just saturation `-100` if a mixer exists.
- B: `0, +22, -30, +12, +5, -20`; texture `+5`, clarity `+4` if supported.
- B&W mix: orange `+8`, yellow `+4`, green `-5`, aqua `-4`, blue `-12`.
- Rich blacks and luminous midtones.

### 68. Silver Gelatin — `silver-gelatin`
- Monochrome; contrast `+14`, highlights `-32`, shadows `+18`, whites `+4`, blacks `-12`.
- B&W mix: red `+3`, orange `+8`, yellow `+5`, green `+2`, blue `-10`.
- Fine grain if supported; avoid clipped skin.

### 69. Hard Light Noir — `hard-light-noir`
- Monochrome; contrast `+30`, highlights `-22`, shadows `-4`, whites `+8`, blacks `-26`.
- B&W mix: orange `+5`, yellow `-2`, green `-8`, blue `-15`; clarity `+8` if supported.
- Dramatic light; offer reduced strength.

### 70. Soft Mono Poetry — `soft-mono-poetry`
- Monochrome; contrast `-6`, highlights `-35`, shadows `+22`, whites `+3`, blacks `+6`.
- B&W mix: orange `+8`, yellow `+5`, green `+2`, blue `-6`.
- Soft curve and lifted blacks, no harsh grain.

### 71. Fashion Silver — `fashion-silver`
- Monochrome; contrast `+20`, highlights `-30`, shadows `+12`, whites `+7`, blacks `-18`.
- B&W mix: orange `+6`, yellow `+2`, blue `-10`; texture `+4` if supported.
- Refined, crisp editorial.

## N. Creator / Social

### 72. Creator Clean Pop — `creator-clean-pop`
- B: `+0.10, +10, -25, +16, +5, -8`; WB: `+1, +1`; Color: `+16, -1`
- HSL: orange lum `+5`; green sat `-8`; blue sat `+4`
- Modern color with skin protection; no oversharpening.

### 73. Soft Flash Diary — `soft-flash-diary`
- B: `+0.15, +8, -32, +18, +5, +2`; WB: `+3, +2`; Color: `+2, -5`
- HSL: yellow sat `-12`; green sat `-18`; blue sat `-10`
- Soft flash aesthetic with restrained warmth.

### 74. Weekend Film — `weekend-film`
- B: `+0.10, -5, -28, +18, 0, +7`; WB: `+4, +2`; Color: `-5, -6`
- HSL: orange lum `+5`; green sat `-18`; blue sat `-12`
- Subtle grain if available; candid friendly look.

### 75. Urban Sunfade — `urban-sunfade`
- B: `+0.10, -8, -25, +18, 0, +8`; WB: `+3, +1`; Color: `-6, -8`
- HSL: yellow sat `-10`; green sat `-20`; blue sat `-12`
- Faded but contemporary; preserve whites.

## O. Experimental / Art House

### 76. Cross Process Cyan — `cross-process-cyan`
- B: `0, +16, -28, +10, 0, -14`; WB: `-3, -2`; Color: `+8, -3`
- Grade: shadows `185/10`, highlights `45/7`; subtle channel-curve crossover only if reliable.

### 77. Magenta Monsoon — `magenta-monsoon`
- B: `-0.05, +12, -30, +14, 0, -12`; WB: `-2, +6`; Color: `+12, -3`
- HSL: magenta sat `+8`; green sat `-18`; blue sat `+4`
- Keep magenta in selected tonal regions rather than tinting the whole image.

### 78. Infrared Garden — `infrared-garden`
- False-color-inspired creative look, not real infrared capture.
- B: `+0.05, +16, -28, +14, 0, -12`; Color: `+8, -2`
- Shift greens toward pale yellow/cyan as HSL permits; reduce green saturation slightly, raise green luminance, lower blue luminance.
- Intensity control is essential.

### 79. Dream Frequency — `dream-frequency`
- B: `+0.15, -10, -28, +20, 0, +5`; WB: `+2, +5`; Color: `-8, -8`
- Grade: highlights `320/5`, shadows `200/5`
- Gentle fade and restrained color separation.

### 80. Duotone Velvet — `duotone-velvet`
- Use real monochrome or near-monochrome mode if supported.
- B: contrast `+12`, highlights `-25`, shadows `+10`, blacks `-14`; saturation around `-55`.
- Grade: shadows `225/12`, highlights `35/10`.
- Preserve luminance structure. If true duotone is unsupported, label it honestly as split-tone.

---

# Implementation requirements

## 1. Intensity
- `0%` means original image, `100%` means full recipe.
- Intermediate values interpolate between original settings and the recipe without repeated destructive processing.
- Interpolate hue along the shortest angular path.
- Keep curves valid and monotonic during interpolation.
- Handle monochrome mode transitions deliberately.
- Applying another preset should replace the prior preset contribution by default unless stacking is already supported.
- Undo must restore the exact previous state.

## 2. Thumbnails and UI
Use the actual renderer to create consistent thumbnails on at least: (1) portrait with light/medium skin, (2) deep-skin portrait, (3) landscape with sky/water/foliage, (4) forest/low light, (5) night/neon, (6) bright wedding/white fabric. Cache by source fingerprint + preset ID + preset version + renderer version. Never render full-resolution images on hover. Keep the current design system; add search, category chips, favorites, active state, short descriptions and “best for” labels. Preview presets on the user's actual photo.

## 3. Skin and scene guardrails
- Use existing subject/skin masks only if reliable. Otherwise do not claim selective skin protection.
- Avoid clipping highlights where practical.
- Preserve variation in foliage; don't collapse all greens into one hue.
- Prevent blues turning purple unless intentional.
- Scale grain sensibly with output resolution.
- Avoid excessive clarity/dehaze halos on faces.
- Keep auto-exposure separate from creative grading if that feature exists.

## 4. Claude Code execution plan

### Phase A — Audit
Inspect preset schema, renderer, adjustment units, history model, image state flow, thumbnail system and tests. Find the existing reference-match workflow and preserve it. List controls actually supported. Briefly summarize findings, then continue unless a destructive architectural decision is unavoidable.

### Phase B — Catalog
Add all 80 recipes as typed data with stable IDs. Adapt to existing schema; omit unsupported controls. Add descriptions, categories, mood, tags and best-for metadata. Keep recipe data separate from UI components.

### Phase C — Integration
Wire recipes into the real renderer and history pipeline. Implement search, categories, favorites, recent presets, descriptions, actual-rendered thumbnails, and before/after/intensity if correctly supported. Allow reference-match output to be saved as a custom preset. Preserve undo/redo, crop, masks, import/export and existing presets.

### Phase D — Visual QA
Test each preset on at least four image types: light/medium skin portrait, deep-skin portrait, green outdoor/forest landscape, and bright whites. Also test representative presets on night images and flat/low-contrast photos. Inspect actual renders, not just unit tests. Fix clipping, banding, oversaturation, skin shifts, posterization and near-duplicate looks.

### Phase E — Automated validation
Test unique IDs, valid categories, non-empty metadata, finite values and supported ranges, valid curve points, correct HSL/grading schema, no ignored settings, no duplicate/near-duplicate recipes, successful rendering of every recipe, intensity 0% matching original, valid intermediate values, undo restoring prior state, and existing reference-match/crop/import-export/history tests passing.

### Phase F — Finish
Run lint, type-check, tests and production build. Fix errors caused by this work. Write `PRESET_LIBRARY_NOTES.md`. Report exact number implemented, exact checks run and results, unsupported controls, and remaining limitations. Do not claim all 80 are complete unless all 80 are connected to the real renderer and validated.

## Acceptance criteria

- 80 original, distinct, editable recipes implemented.
- Real image renderer changes; no CSS-only or thumbnail-only tricks.
- Search, categories and favorites work.
- Real-rendered cached thumbnails.
- Before/after, undo/redo and export remain correct.
- Looks behave reasonably across different photos and do not routinely destroy skin or clip highlights.
- Every recipe passes validation and has a unique ID.
- Existing reference-match workflow remains functional.
- Lint, type-check, tests and production build pass, or pre-existing failures are clearly documented.

**Start by auditing the repository, then implement in small, testable batches. Do not stop after creating names, metadata or UI cards. Tune recipes against actual rendered images.**
