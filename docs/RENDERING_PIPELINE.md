# Rendering pipeline

Every pixel shown or exported is a pure function of **(original image, EditState)**.
The original file is stored untouched in IndexedDB (`originals` store) and is never
re-encoded or modified. Edits are a versioned JSON document
(`src/lib/schema/adjustments.ts`, `EDIT_SCHEMA_VERSION = 1`).

## Paths

| Path | Where | Used for |
| --- | --- | --- |
| WebGL2 (GPU) | `src/lib/engine/gl/renderer.ts`, `shaders.ts` | Interactive preview, export, preset thumbnails |
| CPU reference | `src/lib/engine/pixel.ts`, `cpu/cpuRender.ts` (Web Worker) | Fallback when WebGL2 is unavailable or fails, unit tests, `.cube` export |

Both paths consume the same derived parameters (`src/lib/engine/params.ts`), so a slider means
the same thing everywhere. The GLSL mirrors `pixel.ts` function by function.

## Order of operations

Source space (oriented original, before crop):

1. **Decode**: `createImageBitmap(file, { imageOrientation: 'from-image', colorSpaceConversion: 'default' })`.
   EXIF orientation is applied by the browser; embedded ICC profiles are converted to sRGB.
2. **Linearize**: sRGB transfer function → linear light. Intermediates are RGBA16F when
   `EXT_color_buffer_float` is available, otherwise sqrt-encoded RGBA8.
3. **Retouch** (only when active): healing spots (clone from an automatically chosen offset,
   colour-matched at the spot boundary), skin smoothing (bilateral "surface blur" plus restored
   fine detail, limited to the face mask and skin-like colours), under-eye, teeth, eyes, face light.
3b. **Lens blur** (only when `edit.lensBlur.amount > 0` and a depth map exists; see below).
4. **Blur pyramid**: separable Gaussian blurs at three radii defined as fractions of the image's
   long edge (`BLUR_RADII`), so results are resolution independent. Large radii are computed
   on 2×-downsampled copies.
5. **Detail**: colour noise reduction (OKLab chroma toward a medium blur), luminance noise reduction
   (edge-aware), sharpening (with edge masking), texture (medium band), clarity (large band, midtone
   weighted), dehaze (dark-channel style).
6. **White balance** (linear multipliers normalized to keep neutral luminance) and **exposure** (2^EV).
7. **Channel mixer** (linear 3×3).
8. **Tone**: on sRGB-encoded luminance: blacks, whites, shadows, highlights (smooth tonal weights),
   contrast (pivoted power curve that fixes 0 and 1), brightness (midtone gamma). Applied as a
   luminance ratio in linear light, then soft-clipped toward neutral to avoid hue shifts.
9. **Colour** in OKLab/OKLCh: 8 HSL bands (smoothly interpolated between band centres,
   chroma-weighted so greys are untouched), vibrance (skin-protected), saturation, colour grading
   (shadows/midtones/highlights/global wheels, with balance and blending), monochrome.
10. **Display encode** (sRGB), then **curves** (monotone cubic, master then per channel, 256-entry LUT)
    and **levels**. Optional imported **3D LUT** (`.cube`) with amount.
11. **Adjustment layers**: per mask layer, local exposure, WB, contrast, highlights, shadows,
    saturation, clarity, dehaze, colour tint and blur, mixed by the rasterized mask × opacity.
11b. **Glow effects** (roadmap 2.5, only when one is on): **bloom** (highlights of a blur at 2 % of
    the long edge added back), **halation** (a red rim where a 1.2 % blur is brighter than the pixel:
    light spilling past bright edges) and **dreamy soft blur** (a screen blend towards the 2 % blur).
    Linear light, on the finished develop; `glowStage` in pixel.ts, `glowFrag` in shaders.ts. Export
    pads tiles by the glow's reach on top of the detail blurs.

Output space:

12. **Geometry**: one affine matrix maps output pixels → source pixels (crop, 90° rotations, flips,
    straighten) and resamples bilinearly.
13. In this order, all relative to the crop: **colour fringe** (red sampled at 1 + k and blue at 1 − k
    of the distance from the frame centre, k ≤ 0.006), **flash** (bright punchy centre, darker
    edges, slightly cool), **vignette** (linear light), **light leak** and **lens flare** (procedural
    warm light screen-blended in linear light; the flare's sun sits top right with three ghosts),
    **dust and scratches** (specks and broken vertical lines sized to the long edge, at
    full-resolution pixel coordinates so tiles join; faded when smaller than a preview pixel) and
    **grain** (value noise at full-resolution pixel coordinates; attenuated when grain is smaller
    than a preview pixel). Every effect is 0 by default and then skipped (identity, tested).
14. **Dither** (±0.5/255) and 8-bit output.

## Lens blur (depth of field)

Inputs: the photo's **depth raster** (one byte per pixel, nearness 0 far … 255 near, full-image extent)
and `edit.lensBlur` (`amount`, `focus`, `falloff`, `highlights`, `focusPoint`, `protectSubject`; optional
in the edit state, absent = off). Both renderers implement the same passes: GLSL `lensPrepFrag`,
`lensGatherFrag`, `lensCompositeFrag` (`gl/shaders.ts`) and the CPU reference `lensBlurLinear`
(`cpu/cpuRender.ts`), built from the per-pixel helpers in `pixel.ts`. Parameters come from
`deriveLensParams` / `lensBlurPlan` in `params.ts`. It runs in **linear light** on the source image right
after retouching, before detail and develop, like a real lens.

- **Depth raster**: Depth Anything V2 Small's relative inverse depth (computed once per photo in the ML
  worker, normalized to its 0.5–99.5 % range, cached in IndexedDB `lumen-atelier-depth`) is resampled
  to ≤ 1024 px (2048 px for export), optionally **flattened per person** (each connected region of
  MediaPipe's subject mask is set to its own median depth when "Keep subject sharp" is on), then
  refined with a colour-guided joint bilateral filter (half resolution, two passes) and a guided filter
  on luminance, which pull the model's soft depth ramps onto the photo's edges (`src/lib/depth/raster.ts`).
- **Circle of confusion**: `coc = sign · s(t)`, `t = clamp((|n − n_focus| − band) / width)`, `s = t(2 − t)`;
  positive behind the focal plane, negative in front. `band` = 0.03 keeps the focal plane exactly sharp;
  `width` comes from Falloff; the radius at full blur is `amount/100 × 4 %` of the long edge.
- **Levels**: a coarse level at factor `f` (power of two, chosen so the radius is ≤ 8 level px) and, when
  `f ≥ 4`, a fine level at `f/4` covering blur up to `1.5 f` px, so blur grows progressively instead of
  cross-fading a sharp and a heavily downscaled image.
- **Prep** (per level): highlights are expanded (`bokehExpand`, luminance-based and exactly invertible) so
  out-of-focus lights keep their energy; each level pixel averages its `f × f` block using only texels at a
  similar CoC to the block centre (no mixing across depth edges); alpha stores the CoC in level pixels.
- **Gather**: scatter-as-gather disc blur with golden-angle samples (uniform disc, flat-topped bokeh). A
  sample contributes when its own CoC reaches the centre (`lensGatherWeight`), tested **per texel** of the
  bilinear footprint; samples behind the centre cannot spill over it by more than its own blur, so a sharp
  subject never receives background colour; blurred foreground spill is recorded in alpha.
- **Composite** (full resolution): joint-bilateral upsample of each level (weights by CoC similarity),
  fine→coarse by CoC, then `mix(sharp, compress(blur), max(t, foreground spill))`; `t` is 0 below 0.5 px
  of CoC, so in-focus pixels are bit-identical to the input. Amount 0 skips the passes (identity, tested).
- **Export tiles**: tiles are padded by `lensTilePadding(r) = r + 3f` px and their source origin is aligned to
  multiples of `f`, so the low-resolution grids line up and tiles match the whole-image render exactly
  (unit-tested). The 8-bit fallback (no float render targets) stores expanded colour as `sqrt(v/4)` and
  the CoC around 0.5.

## Colour-space assumptions

- Working and output space: **sRGB**. Wide-gamut sources are converted to sRGB at decode, so P3 colours
  outside sRGB are clipped. Exports are untagged sRGB, which browsers and most apps assume.
- Light-dependent operations (exposure, WB, mixing, blur, vignette) run in **linear light**.
- Perceptual operations run on **sRGB-encoded luminance** (tone) or **OKLab** (hue, chroma, grading),
  because RGB is not perceptually uniform.

## Preview vs export

- Preview: a downscaled copy (1280 / 2048 / 3072 px long edge; Settings → Performance), capped by
  `MAX_TEXTURE_SIZE`. Renders are coalesced to one per animation frame.
- Export (`src/engine/exporter.ts`): the full-resolution original is rendered in **2048 px tiles**. Each
  tile renders a padded source region (padding ≥ 3σ of the largest blur, plus healing offsets), and
  only the tile interior is kept, so tiles join seamlessly. Masks and grain use full-image
  coordinates. Output is never silently downscaled: the user picks the size, and if the browser
  can't allocate the canvas (> 16384 px side or ~268 MP) the export fails with an explanation.
- JPEG export flattens transparency onto white; PNG and WebP keep alpha. EXIF/GPS metadata is not
  copied into exports.

## Masks

Mask components (brush strokes, linear/radial gradients, segmentation targets) are stored as
vectors in normalized source coordinates and rasterized on demand (`src/lib/masks/rasterize.ts`)
at up to 1536 px for preview and 4096 px for export. Segmentation masks come from MediaPipe's
selfie multiclass model (person, hair, skin, clothes, background).

## Performance measures

- GPU preview, texture and framebuffer reuse (`ensureTarget` pool).
- Derived parameters and mask rasters cached by input identity.
- One render per animation frame; histogram read back from a 320 px downsample, throttled.
- Preset thumbnails rendered at 220 px when the main thread is idle, and cached.
- CPU work (statistics, CPU fallback) runs in Web Workers.
- The previous photo's bitmaps and GPU intermediates are released on photo switch.
- Undo history is bounded (80 entries) and grouped per gesture.
- Settings → Performance → **Run benchmark** measures full-pipeline render time on the device
  (with a GPU read-back each iteration so timings include GPU completion).
