/**
 * CPU reference implementation of the per-pixel develop stages.
 *
 * The GLSL fragment shader (shaders.ts) mirrors these functions. This module
 * is used for: unit tests of the colour math, the CPU fallback renderer when
 * WebGL2 is unavailable, LUT (.cube) export, and analysis of rendered output.
 *
 * Colour-space assumptions: input pixels are sRGB-encoded (the browser has
 * already converted embedded ICC profiles to sRGB on decode). Exposure, white
 * balance, mixing and the tone ratio are applied in LINEAR light; tone shaping
 * is computed on an sRGB-encoded luminance value (perceptually spaced); hue,
 * saturation and grading are computed in OKLab/OKLCh; curves and levels act on
 * display-encoded values.
 */
import { linearSrgbToOklab, oklabToLinearSrgb } from '../color/oklab';
import { linearToSrgb, luminance, srgbToLinear } from '../color/srgb';
import { CURVE_LUT_SIZE, sampleLut } from '../color/curves';
import { LENS, STREAK, type DevelopParams, type LensParams, type LensPlan, type LocalParams } from './params';

export type RGB = [number, number, number];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Perceptual encode/decode of luminance (sRGB curve, extended linearly above 1). */
export function encodeY(y: number): number {
  return y > 1 ? 1 + (y - 1) * 0.4 : linearToSrgb(y);
}
export function decodeY(p: number): number {
  return p > 1 ? 1 + (p - 1) / 0.4 : srgbToLinear(Math.max(0, p));
}

const BELL_NORM = 0.10546875; // max of p(1-p)^3

/** Global tone shaping on perceptual luminance p. */
export function toneShape(p: number, t: DevelopParams['tone']): number {
  let q = p;
  const pc = clamp(q, 0, 1);
  q += t.blacks * 0.1 * Math.pow(1 - pc, 4);
  q += t.whites * 0.12 * Math.pow(pc, 4);
  const pc2 = clamp(q, 0, 1);
  q += t.shadows * 0.22 * ((pc2 * Math.pow(1 - pc2, 3)) / BELL_NORM);
  q += t.highlights * 0.22 * ((Math.pow(pc2, 3) * (1 - pc2)) / BELL_NORM);
  q = applyContrast(q, t.contrast);
  if (t.brightness !== 0) q = Math.pow(Math.max(q, 0), Math.pow(2, -0.7 * t.brightness));
  return q;
}

export function applyContrast(p: number, c: number): number {
  if (c === 0) return p;
  const k = c > 0 ? 1 + 1.3 * c : 1 / (1 - 0.75 * c);
  const m = 0.46;
  const pc = clamp(p, 0, 1);
  const q = pc < m ? m * Math.pow(pc / m, k) : 1 - (1 - m) * Math.pow((1 - pc) / (1 - m), k);
  return q + (p - pc);
}

/** Scale linear RGB to a new luminance, preserving hue; soft-clips above 1. */
export function setLuminance(rgb: RGB, yNew: number): RGB {
  const y = luminance(rgb[0], rgb[1], rgb[2]);
  let out: RGB;
  if (y < 1e-6) out = [yNew, yNew, yNew];
  else {
    const k = yNew / y;
    out = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
  }
  return softClip(out);
}

/** Desaturates toward the pixel's luminance so no channel exceeds 1 (avoids hue skew). */
export function softClip(rgb: RGB): RGB {
  const r = Math.max(rgb[0], 0);
  const g = Math.max(rgb[1], 0);
  const b = Math.max(rgb[2], 0);
  const mx = Math.max(r, g, b);
  if (mx <= 1) return [r, g, b];
  const y = Math.min(luminance(r, g, b), 1);
  const t = clamp((mx - 1) / Math.max(mx - y, 1e-6), 0, 1);
  return [mix(r, y, t), mix(g, y, t), mix(b, y, t)];
}

/** Interpolates the 8 HSL band parameters at hue h (degrees, OKLCh). */
export function bandInterp(hues: number[], values: number[], h: number): number {
  const n = hues.length;
  for (let i = 0; i < n; i++) {
    const h0 = hues[i];
    const h1 = i === n - 1 ? hues[0] + 360 : hues[i + 1];
    let hh = h;
    if (hh < h0) hh += 360;
    if (hh >= h0 && hh < h1) {
      const t = smoothstep(0, 1, (hh - h0) / (h1 - h0));
      return mix(values[i], values[(i + 1) % n], t);
    }
  }
  return values[0];
}

/** Colour stage in OKLab: HSL bands, vibrance, saturation, grading, monochrome. */
export function colorStage(lin: RGB, P: DevelopParams): RGB {
  let [L, a, b] = linearSrgbToOklab(Math.max(lin[0], 0), Math.max(lin[1], 0), Math.max(lin[2], 0));
  let C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  if (P.hslActive && C > 1e-5) {
    const cw = smoothstep(0, 0.06, C);
    const shift = bandInterp(P.hslHues, P.hslHueShift, h);
    const sat = bandInterp(P.hslHues, P.hslSat, h);
    const lum = bandInterp(P.hslHues, P.hslLum, h);
    h += shift * cw;
    C *= Math.max(0, 1 + sat * cw);
    L += lum * 0.16 * cw;
  }
  if (P.vibrance !== 0) {
    let dh = Math.abs(h - 55) % 360;
    if (dh > 180) dh = 360 - dh;
    const skin = Math.exp(-Math.pow(dh / 25, 2));
    const protect = P.vibrance > 0 ? 1 - 0.6 * skin : 1;
    C *= Math.max(0, 1 + P.vibrance * (1 - smoothstep(0, 0.18, C)) * protect);
  }
  if (P.saturation !== 0) C *= Math.max(0, 1 + P.saturation);

  const rad = (h * Math.PI) / 180;
  a = C * Math.cos(rad);
  b = C * Math.sin(rad);

  if (P.grading.active) {
    const g = P.grading;
    const ws = 1 - smoothstep(g.split1 - g.width, g.split1 + g.width, L);
    const wh = smoothstep(g.split2 - g.width, g.split2 + g.width, L);
    const wm = clamp(1 - ws - wh, 0, 1);
    a += ws * g.shadows[0] + wm * g.midtones[0] + wh * g.highlights[0] + g.global[0];
    b += ws * g.shadows[1] + wm * g.midtones[1] + wh * g.highlights[1] + g.global[1];
    L += ws * g.shadows[2] + wm * g.midtones[2] + wh * g.highlights[2] + g.global[2];
  }
  if (P.monochrome > 0) {
    a *= 1 - P.monochrome;
    b *= 1 - P.monochrome;
  }
  L = clamp(L, 0, 1.25);
  return softClip(oklabToLinearSrgb(L, a, b));
}

/** Global develop from linear RGB (after detail stage) to linear RGB. */
export function developLinear(input: RGB, P: DevelopParams): RGB {
  let r = input[0] * P.wb[0] * P.exposureMul;
  let g = input[1] * P.wb[1] * P.exposureMul;
  let b = input[2] * P.wb[2] * P.exposureMul;
  if (P.mixerActive) {
    const m = P.mixer;
    const nr = m[0] * r + m[1] * g + m[2] * b;
    const ng = m[3] * r + m[4] * g + m[5] * b;
    const nb = m[6] * r + m[7] * g + m[8] * b;
    r = Math.max(nr, 0);
    g = Math.max(ng, 0);
    b = Math.max(nb, 0);
  }
  const y = luminance(r, g, b);
  const p = encodeY(y);
  const q = toneShape(p, P.tone);
  const toned = q === p ? softClip([r, g, b]) : setLuminance([r, g, b], decodeY(Math.max(q, 0)));
  return colorStage(toned, P);
}

/** Display-referred stages: curves then levels. Input/output sRGB-encoded 0..1. */
export function displayStage(srgb: RGB, P: DevelopParams): RGB {
  let [r, g, b] = srgb;
  if (P.curvesActive) {
    const lut = P.curveLut;
    const n = CURVE_LUT_SIZE;
    const master = lut.subarray(0, n);
    r = sampleLut(lut.subarray(n, 2 * n), sampleLut(master, r));
    g = sampleLut(lut.subarray(2 * n, 3 * n), sampleLut(master, g));
    b = sampleLut(lut.subarray(3 * n, 4 * n), sampleLut(master, b));
  }
  if (P.levelsActive) {
    const lv = P.levels;
    const f = (v: number) => {
      const x = clamp((v - lv.inBlack) / (lv.inWhite - lv.inBlack), 0, 1);
      return lv.outBlack + Math.pow(x, lv.invGamma) * (lv.outWhite - lv.outBlack);
    };
    r = f(r);
    g = f(g);
    b = f(b);
  }
  return [r, g, b];
}

/**
 * Full non-spatial develop of one sRGB pixel. Spatial operations (detail,
 * masks, vignette, grain, retouch) are handled by the renderers.
 */
export function developPixel(srgb: RGB, P: DevelopParams): RGB {
  const lin: RGB = [srgbToLinear(srgb[0]), srgbToLinear(srgb[1]), srgbToLinear(srgb[2])];
  const out = developLinear(lin, P);
  return displayStage([linearToSrgb(out[0]), linearToSrgb(out[1]), linearToSrgb(out[2])], P);
}

/**
 * Detail stage (noise reduction, sharpening, texture, clarity, dehaze).
 * x: pixel; s/m/l: small/medium/large Gaussian blurs of the image at that
 * pixel. All linear RGB.
 */
export function detailStage(x: RGB, s: RGB, m: RGB, l: RGB, D: DevelopParams['detail']): RGB {
  let out: RGB = x;
  if (D.colorNoise > 0) {
    const [L, a, b] = linearSrgbToOklab(Math.max(x[0], 0), Math.max(x[1], 0), Math.max(x[2], 0));
    const [, am, bm] = linearSrgbToOklab(Math.max(m[0], 0), Math.max(m[1], 0), Math.max(m[2], 0));
    out = softClip(oklabToLinearSrgb(L, mix(a, am, D.colorNoise), mix(b, bm, D.colorNoise)));
  }
  const y = luminance(out[0], out[1], out[2]);
  const p0 = encodeY(y);
  const ps = encodeY(luminance(s[0], s[1], s[2]));
  const pm = encodeY(luminance(m[0], m[1], m[2]));
  const pl = encodeY(luminance(l[0], l[1], l[2]));
  let p = p0;
  if (D.noise > 0) {
    const fine = Math.abs(p0 - ps);
    p = mix(p, ps, D.noise * (1 - smoothstep(0.015, 0.09, fine)));
  }
  if (D.sharpen > 0) {
    const edge = smoothstep(0.004, 0.04, Math.abs(ps - pm));
    p += D.sharpen * 1.6 * (p0 - ps) * mix(1, edge, D.sharpenMask);
  }
  if (D.texture !== 0) p += D.texture * 1.1 * (ps - pm);
  if (D.clarity !== 0) {
    const mid = 1 - Math.pow(clamp(2 * p - 1, -1, 1), 2);
    p += D.clarity * 0.8 * (pm - pl) * (0.35 + 0.65 * mid) + D.clarity * 0.35 * (p0 - pl) * mid;
  }
  if (p !== p0) out = setLuminance(out, decodeY(Math.max(p, 0)));
  if (D.dehaze !== 0) out = dehaze(out, l, D.dehaze);
  return out;
}

/** Dark-channel-prior style haze removal (simplified, airlight fixed near white). */
export function dehaze(x: RGB, blurLarge: RGB, amount: number): RGB {
  const A = 0.92;
  const dark = Math.min(blurLarge[0], blurLarge[1], blurLarge[2]);
  if (amount > 0) {
    const t = Math.max(1 - 0.9 * amount * (dark / A), 0.25);
    return softClip(x.map((v) => Math.max((v - A) / t + A, 0)) as RGB);
  }
  const k = -amount * 0.55;
  return [mix(x[0], A * 0.85, k), mix(x[1], A * 0.86, k), mix(x[2], A * 0.88, k)];
}

/** Vignette factor (applied as a linear-light multiplier or lift). u,v in -1..1 of the output frame. */
export function vignetteWeight(u: number, v: number, aspect: number, V: DevelopParams['vignette']): number {
  const k = (V.roundness + 1) / 2;
  const sx = mix(1, aspect, k);
  const sy = 1;
  const d = (Math.hypot(u * sx, v * sy) / Math.hypot(sx, sy)) * Math.SQRT2;
  const r0 = mix(0.25, 1.25, V.midpoint);
  const w = mix(0.05, 1.1, V.feather);
  return smoothstep(r0 - w * 0.5, r0 + w * 0.5, d);
}

export function applyVignette(lin: RGB, weight: number, amount: number): RGB {
  if (amount === 0 || weight === 0) return lin;
  if (amount < 0) {
    const f = 1 + amount * weight * 0.9;
    return [lin[0] * f, lin[1] * f, lin[2] * f];
  }
  const t = amount * weight * 0.75;
  return [mix(lin[0], 1, t), mix(lin[1], 1, t), mix(lin[2], 1, t)];
}

/** Local (masked) adjustments on a linear pixel. Blur/clarity handled by the renderer. */
export function localAdjust(lin: RGB, L: LocalParams, blurLarge: RGB | null): RGB {
  let r = lin[0] * L.exposureMul * L.wb[0];
  let g = lin[1] * L.exposureMul * L.wb[1];
  let b = lin[2] * L.exposureMul * L.wb[2];
  let out: RGB = [r, g, b];
  if (L.contrast !== 0 || L.highlights !== 0 || L.shadows !== 0 || (L.clarity !== 0 && blurLarge)) {
    const p0 = encodeY(luminance(r, g, b));
    let p = p0;
    const pc = clamp(p, 0, 1);
    p += L.shadows * 0.22 * ((pc * Math.pow(1 - pc, 3)) / BELL_NORM);
    p += L.highlights * 0.22 * ((Math.pow(pc, 3) * (1 - pc)) / BELL_NORM);
    p = applyContrast(p, L.contrast);
    if (L.clarity !== 0 && blurLarge) {
      const pl = encodeY(luminance(blurLarge[0], blurLarge[1], blurLarge[2]));
      const mid = 1 - Math.pow(clamp(2 * p - 1, -1, 1), 2);
      p += L.clarity * 0.9 * (p0 - pl) * mid;
    }
    out = setLuminance(out, decodeY(Math.max(p, 0)));
  }
  if (L.dehaze !== 0 && blurLarge) out = dehaze(out, blurLarge, L.dehaze);
  if (L.saturation !== 0 || L.tint[0] !== 0 || L.tint[1] !== 0) {
    const [Lk, a, bb] = linearSrgbToOklab(Math.max(out[0], 0), Math.max(out[1], 0), Math.max(out[2], 0));
    const s = Math.max(0, 1 + L.saturation);
    out = softClip(oklabToLinearSrgb(Lk, a * s + L.tint[0], bb * s + L.tint[1]));
  }
  [r, g, b] = out;
  return softClip([r, g, b]);
}

/** Deterministic hash noise in [-1, 1] (mirrors the GLSL implementation). */
export function hashNoise(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return (h - Math.floor(h)) * 2 - 1;
}

export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hashNoise(ix, iy);
  const b = hashNoise(ix + 1, iy);
  const c = hashNoise(ix, iy + 1);
  const d = hashNoise(ix + 1, iy + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

/**
 * Film grain at a full-resolution pixel position. `scale` is the preview's
 * pixels-per-full-resolution-pixel; grain amplitude is attenuated when grain
 * cells become smaller than a preview pixel (approximating the averaging).
 */
export function grainValue(fx: number, fy: number, G: DevelopParams['grain'], scale: number): number {
  const cell = mix(0.8, 6, G.size);
  const cellPreview = cell * scale;
  const atten = Math.min(1, cellPreview);
  const n1 = valueNoise(fx / cell, fy / cell);
  const n2 = valueNoise((fx / cell) * 2.3 + 17.1, (fy / cell) * 2.3 + 5.3);
  return (n1 * (1 - G.roughness * 0.5) + n2 * G.roughness * 0.5) * atten;
}

export function applyGrainSrgb(srgb: RGB, n: number, amount: number): RGB {
  if (amount === 0) return srgb;
  const y = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  const w = 0.35 + 0.65 * (1 - Math.pow(2 * y - 1, 2));
  const d = n * amount * 0.11 * w;
  return [clamp(srgb[0] + d, 0, 1), clamp(srgb[1] + d, 0, 1), clamp(srgb[2] + d, 0, 1)];
}

// ---------------------------------------------------------------------------
// Lens blur (depth of field). Mirrored by lensPrepFrag / lensGatherFrag /
// lensCompositeFrag in gl/shaders.ts; the image-level CPU pass is
// lensBlurLinear in cpu/cpuRender.ts. Units: nearness n is 0 (far) .. 1 (near);
// CoC values are blur-disc radii in pixels of the pass that uses them, signed
// (+ behind the focal plane, - in front of it).
// ---------------------------------------------------------------------------

export const GOLDEN_ANGLE = 2.399963229728653;

/** Signed blur size in [-1, 1] for a pixel of nearness `n`. Zero inside the in-focus band. */
export function lensCoc(n: number, L: Pick<LensParams, 'focus' | 'band' | 'width'>): number {
  const d = L.focus - n;
  const t = clamp((Math.abs(d) - L.band) / L.width, 0, 1);
  const s = t * (2 - t);
  return d < 0 && s > 0 ? -s : s;
}

/**
 * Expands highlights before blurring so out-of-focus lights stay bright and
 * form discs (an 8-bit source clips them at 1.0). Luminance-based, so hue is
 * kept; exactly inverted by bokehCompress.
 */
export function bokehExpand(rgb: RGB, boost: number): RGB {
  const y = luminance(rgb[0], rgb[1], rgb[2]);
  const T = LENS.highlightThreshold;
  if (boost <= 0 || y <= T) return rgb;
  const k = (y + boost * (y - T) * (y - T)) / y;
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}

export function bokehCompress(rgb: RGB, boost: number): RGB {
  const y = luminance(rgb[0], rgb[1], rgb[2]);
  const T = LENS.highlightThreshold;
  if (boost <= 0 || y <= T) return rgb;
  const g = T + (Math.sqrt(1 + 4 * boost * (y - T)) - 1) / (2 * boost);
  const k = g / y;
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}

/** How much a neighbour with CoC `a` may stand in for a pixel with CoC `ref` (keeps edges between depths clean). */
export function cocSimilarity(a: number, ref: number): number {
  const tau = 0.5 + 0.25 * Math.abs(ref);
  return 1 - smoothstep(tau, 2 * tau, Math.abs(a - ref));
}

/** Gather sample `k` of `n` on a disc of radius `R` (golden-angle spiral, uniform density): [dx, dy, r]. */
export function lensSample(k: number, n: number, R: number): [number, number, number] {
  const r = R * Math.sqrt((k + 0.5) / n);
  const a = k * GOLDEN_ANGLE;
  return [r * Math.cos(a), r * Math.sin(a), r];
}

/**
 * Scatter-as-gather weight of a sample at distance `r` from the centre: the
 * sample contributes if its own blur disc reaches the centre. A sample behind
 * the centre may not spill over it by more than the centre's own blur (a
 * blurred background never bleeds over a sharp subject). Returns
 * [weight, foreground weight]; the latter measures blurred foreground spilling
 * over a sharper centre.
 */
export function lensGatherWeight(sampleCoc: number, centerCoc: number, r: number): [number, number] {
  const c0 = Math.abs(centerCoc);
  let cs = Math.abs(sampleCoc);
  if (sampleCoc > centerCoc + 0.5) cs = Math.min(cs, c0 * 2 + 0.5);
  const w = clamp(cs - r + 0.5, 0, 1);
  const fg = sampleCoc < centerCoc - 0.5 && cs > c0 ? w : 0;
  return [w, fg];
}

/**
 * Composite weights for a pixel with CoC `cocPx` (render px): [t, u], where t
 * mixes sharp → blurred and u mixes the fine level → the coarse level. The
 * blurred image is only trusted once the CoC reaches about a pixel of the
 * level it comes from.
 */
export function lensBlendWeights(cocPx: number, plan: Pick<LensPlan, 'factor' | 'fine'>): [number, number] {
  const c = Math.abs(cocPx);
  if (!plan.fine) return [smoothstep(0.5, 0.5 + plan.factor, c), 1];
  return [smoothstep(0.5, 0.5 + plan.fine.factor, c), smoothstep(0.75 * plan.factor, 1.5 * plan.factor, c)];
}

// ---------------------------------------------------------------------------
// Photo effects (roadmap 2.5). Mirrored by glowFrag and the effects block of
// outputFrag in gl/shaders.ts; cpuRender.ts applies them in the same order:
// glow stage (source space, after layers), then in the output frame: fringe
// (sampling), flash, vignette, light leak, flare, dust, grain.
// ---------------------------------------------------------------------------

const lum = (c: RGB) => luminance(c[0], c[1], c[2]);
const toLin = (c: RGB): RGB => [srgbToLinear(clamp(c[0], 0, 1)), srgbToLinear(clamp(c[1], 0, 1)), srgbToLinear(clamp(c[2], 0, 1))];
const toDisp = (c: RGB): RGB => [linearToSrgb(c[0]), linearToSrgb(c[1]), linearToSrgb(c[2])];

/** Screen blend in linear light: brightens like light added on film, never past white. */
export function screenAdd(lin: RGB, add: RGB): RGB {
  return [0, 1, 2].map((k) => 1 - (1 - clamp(lin[k], 0, 1)) * (1 - clamp(add[k], 0, 1))) as RGB;
}

/** Halation's colour: the red/orange of light scattered back through film's red layer. */
export const HALATION_TINT: RGB = [1.0, 0.28, 0.08];

/**
 * Soft focus, bloom, halation and dreamy soft blur, on display-encoded values. `halo` and `glow`
 * are the photo blurred at BLUR_RADII.halation and BLUR_RADII.glow at this pixel.
 */
export function glowStage(disp: RGB, halo: RGB, glow: RGB, F: DevelopParams['fx']): RGB {
  const x0 = toLin(disp);
  let x: RGB = [...x0];
  const g = toLin(glow);
  if (F.softFocus > 0) {
    // A soft copy laid over the sharp one (the structure stays), with a little contrast put back.
    const h = toLin(halo);
    const t = F.softFocus * 0.65;
    x = [mix(x[0], h[0], t), mix(x[1], h[1], t), mix(x[2], h[2], t)];
    const p = encodeY(lum(x));
    x = setLuminance(x, decodeY(Math.max(applyContrast(p, 0.12 * F.softFocus), 0)));
  }
  if (F.bloom > 0) {
    const m = smoothstep(0.25, 0.9, lum(g)) * F.bloom * 1.2;
    x = [x[0] + g[0] * m, x[1] + g[1] * m, x[2] + g[2] * m];
  }
  if (F.halation > 0) {
    // Light spilling from brighter surroundings: a rim past bright edges, none inside flat areas.
    const yh = lum(toLin(halo));
    const e = Math.max(0, yh - lum(x0)) * smoothstep(0.15, 0.7, yh) * F.halation * 1.8;
    x = [x[0] + HALATION_TINT[0] * e, x[1] + HALATION_TINT[1] * e, x[2] + HALATION_TINT[2] * e];
  }
  if (F.dreamy > 0) {
    const soft = screenAdd(x, [g[0] * 0.85, g[1] * 0.85, g[2] * 0.85]);
    const t = F.dreamy * 0.8;
    x = [0, 1, 2].map((k) => mix(x[k], mix(soft[k], g[k], 0.35), t)) as RGB;
  }
  return toDisp(softClip(x));
}

/** Weight of tap `i` of a streak pass (see STREAK in params.ts): equal, or fading away from the light. */
export function streakWeight(i: number, decay: boolean): number {
  if (!decay) return 1;
  const q = 1 - i / STREAK.taps;
  return q * q;
}

/** The part of a linear-light pixel that leaves a trail in shutter drag: its highlights. */
export function dragHighlight(lin: RGB): RGB {
  const m = smoothstep(STREAK.dragLow, STREAK.dragHigh, lum(lin));
  return [lin[0] * m, lin[1] * m, lin[2] * m];
}

/**
 * Shutter drag's blend: the trail (display-encoded, from the two streak passes) is added over the
 * sharp photo as 1 - (1 - x) * exp(-a), a screen blend whose light has a soft shoulder, so it
 * approaches white without clipping. A pixel that is itself a highlight takes half the trail.
 */
export function dragComposite(disp: RGB, trail: RGB, amount: number): RGB {
  if (amount <= 0) return disp;
  const t = toLin(trail);
  if (t[0] <= 0 && t[1] <= 0 && t[2] <= 0) return disp; // no light reaches this pixel: untouched
  const x = toLin(disp);
  const k = STREAK.dragGain * Math.sqrt(amount) * (1 - 0.5 * smoothstep(STREAK.dragLow, STREAK.dragHigh, lum(x)));
  return toDisp([0, 1, 2].map((c) => 1 - (1 - x[c]) * Math.exp(-t[c] * k)) as RGB);
}

/** Chromatic aberration: red is sampled at (1 + k) and blue at (1 - k) of the distance from the frame's centre. */
export function fringeScale(amount: number): number {
  return amount * 0.006;
}

/** Distance from the frame's centre, 0 at the centre and 1 in the corners (u, v in 0..1). */
export function frameRadius(u: number, v: number, aspect: number): number {
  return Math.hypot((u - 0.5) * aspect, v - 0.5) / Math.hypot(aspect * 0.5, 0.5);
}

/** On-camera flash: a bright, punchy centre falling off to darker edges, slightly cool. Linear in, linear out. */
export function flashLin(lin: RGB, d: number, amount: number): RGB {
  if (amount <= 0) return lin;
  const fall = 1 - smoothstep(0, 0.85, d);
  const gain = 1 + amount * (0.55 * fall - 0.45 * (1 - fall));
  const lit: RGB = [lin[0] * gain, lin[1] * gain, lin[2] * gain];
  const p = encodeY(lum(lit));
  const out = setLuminance(lit, decodeY(Math.max(applyContrast(p, 0.35 * amount), 0)));
  return softClip([out[0] * (1 - 0.03 * amount), out[1], out[2] * (1 + 0.05 * amount)]);
}

/** Light leak: warm light (to add with screenAdd) bleeding in from the right edge, with an uneven front. */
export function lightLeak(u: number, v: number, aspect: number, amount: number): RGB {
  if (amount <= 0) return [0, 0, 0];
  const n = valueNoise(v * 3 + 11.3, 0.7);
  const edge = smoothstep(0.55 + 0.12 * n, 1.05, u);
  const blob = Math.exp(-(((u - 1) * aspect) ** 2 + (v - 0.3) ** 2) / 0.18);
  const w = clamp(edge * 0.7 + blob * 0.8, 0, 1) * amount * 0.85;
  const t = smoothstep(0, 1, v);
  return [w, mix(0.32, 0.72, t) * w, mix(0.06, 0.28, t) * w];
}

/** The flare's ghosts: [distance along source → centre (1 = centre), radius, r, g, b]. */
export const FLARE_GHOSTS: [number, number, number, number, number][] = [
  [1.35, 0.045, 0.6, 1.0, 0.7],
  [1.75, 0.08, 0.7, 0.6, 1.0],
  [2.1, 0.03, 1.0, 0.8, 0.5],
];
const FLARE_SRC = [0.8, 0.2];
const FLARE_TINT: RGB = [1.0, 0.85, 0.65];

/** Lens flare from a sun near the top right: hot spot, a horizontal streak and ghosts (to add with screenAdd). */
export function lensFlare(u: number, v: number, aspect: number, amount: number): RGB {
  if (amount <= 0) return [0, 0, 0];
  const px = u * aspect;
  const sx = FLARE_SRC[0] * aspect;
  const sy = FLARE_SRC[1];
  const cx = 0.5 * aspect;
  const d2 = (px - sx) ** 2 + (v - sy) ** 2;
  const hot = Math.exp(-d2 / 0.012) + 0.35 * Math.exp(-d2 / 0.08);
  const streak = 0.35 * Math.exp(-((v - sy) ** 2) / 0.00015) * Math.exp(-Math.abs(px - sx) / (0.6 * aspect));
  const out: RGB = [FLARE_TINT[0] * (hot + streak), FLARE_TINT[1] * (hot + streak), FLARE_TINT[2] * (hot + streak)];
  for (const [k, r, gr, gg, gb] of FLARE_GHOSTS) {
    const gx = sx + (cx - sx) * k;
    const gy = sy + (0.5 - sy) * k;
    const disc = (1 - smoothstep(r * 0.7, r, Math.hypot(px - gx, v - gy))) * 0.18;
    out[0] += gr * disc;
    out[1] += gg * disc;
    out[2] += gb * disc;
  }
  return [out[0] * amount, out[1] * amount, out[2] * amount];
}

/**
 * Dust and scratches at a full-resolution output pixel (fx, fy). Returns a signed cover in
 * [-1, 1]: positive lightens (dust on a scanned negative), negative darkens. Features are sized to
 * the photo's long edge so the preview and the export match; `scale` is preview px per full px,
 * and features smaller than a preview pixel fade as they would when averaged.
 */
export function dustValue(fx: number, fy: number, longEdge: number, scale: number, amount: number): number {
  if (amount <= 0) return 0;
  const unit = longEdge / 1500;
  const soft = Math.max(1 / scale, 0.6 * unit);
  // Specks: at most one per cell, kept inside its cell.
  const cell = 60 * unit;
  const ci = Math.floor(fx / cell);
  const cj = Math.floor(fy / cell);
  let speck = 0;
  if (hashNoise(ci + 0.31, cj + 7.7) > 1 - 0.5 * amount) {
    const r = (0.8 + 0.85 * (hashNoise(ci + 3.1, cj + 1.3) + 1)) * unit;
    const room = 0.5 * Math.max(0, cell - 2 * r - 4 * unit);
    const px = (ci + 0.5) * cell + hashNoise(ci + 5.7, cj + 2.9) * room;
    const py = (cj + 0.5) * cell + hashNoise(ci + 8.3, cj + 6.1) * room;
    const a = 1 - smoothstep(r - soft * 0.5, r + soft * 0.5, Math.hypot(fx - px, fy - py));
    speck = a * Math.min(1, r * scale) * (hashNoise(ci + 9.1, cj + 4.4) > -0.3 ? 1 : -1);
  }
  // Scratches: thin, broken vertical lines in a few bands.
  const band = 220 * unit;
  const bi = Math.floor(fx / band);
  let scratch = 0;
  if (hashNoise(bi + 1.7, 13.1) > 1 - 0.3 * amount) {
    const x0 = (bi + 0.5) * band + hashNoise(bi + 2.3, 4.1) * 0.4 * band + valueNoise(fy / (400 * unit), bi * 1.3) * 6 * unit;
    const w = 0.6 * unit;
    const a = 1 - smoothstep(w, w + soft, Math.abs(fx - x0));
    scratch = a * Math.min(1, 2 * w * scale) * smoothstep(0, 0.3, valueNoise(fy / (300 * unit), bi * 2.7 + 9));
  }
  return clamp(speck + 0.7 * scratch, -1, 1) * (0.35 + 0.65 * amount);
}

/** Applies a dust cover (display-encoded). */
export function applyDust(c: RGB, t: number): RGB {
  if (t === 0) return c;
  if (t > 0) return [mix(c[0], 0.95, t), mix(c[1], 0.95, t), mix(c[2], 0.93, t)];
  const k = 1 + 0.85 * t;
  return [c[0] * k, c[1] * k, c[2] * k];
}
