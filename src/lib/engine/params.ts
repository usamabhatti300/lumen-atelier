/**
 * Converts the user-facing Adjustments (slider units) into normalized
 * rendering parameters. Both the WebGL2 shaders and the CPU reference
 * pipeline consume these, so the two paths share one interpretation of every
 * slider. See docs/RENDERING_PIPELINE.md for the order of operations.
 */
import { bakeCurve, CURVE_LUT_SIZE } from '../color/curves';
import { oklchToOklab } from '../color/oklab';
import { whiteBalanceMultipliers } from '../color/whiteBalance';
import {
  CURVE_CHANNELS,
  HSL_BANDS,
  HSL_BAND_HUES,
  isIdentityCurve,
  type Adjustments,
  type GradeWheel,
  type LocalAdjustments,
} from '../schema/adjustments';

export interface DevelopParams {
  wb: [number, number, number];
  exposureMul: number;
  /** Row-major 3x3 channel mixer. */
  mixer: number[];
  mixerActive: boolean;
  tone: {
    blacks: number;
    whites: number;
    shadows: number;
    highlights: number;
    contrast: number;
    brightness: number;
  };
  /** Band centre hues (sorted ascending) and per-band parameters in band order. */
  hslHues: number[];
  hslHueShift: number[]; // degrees
  hslSat: number[]; // -1..1
  hslLum: number[]; // -1..1
  hslActive: boolean;
  vibrance: number; // -1..1
  saturation: number; // -1..1
  monochrome: number; // 0..1
  grading: {
    shadows: [number, number, number]; // a, b, L offset
    midtones: [number, number, number];
    highlights: [number, number, number];
    global: [number, number, number];
    split1: number;
    split2: number;
    width: number;
    active: boolean;
  };
  /** CURVE_LUT_SIZE * 4 floats: master, red, green, blue. */
  curveLut: Float32Array;
  curvesActive: boolean;
  levels: { inBlack: number; inWhite: number; invGamma: number; outBlack: number; outWhite: number };
  levelsActive: boolean;
  detail: {
    texture: number;
    clarity: number;
    dehaze: number;
    sharpen: number;
    sharpenMask: number;
    noise: number;
    colorNoise: number;
  };
  vignette: { amount: number; midpoint: number; roundness: number; feather: number };
  grain: { amount: number; size: number; roughness: number };
}

const GRADE_CHROMA = 0.11;
const GRADE_LUMA = 0.12;

function wheelToAbL(w: GradeWheel): [number, number, number] {
  const [, a, b] = oklchToOklab(0, (w.saturation / 100) * GRADE_CHROMA, w.hue);
  return [a, b, (w.luminance / 100) * GRADE_LUMA];
}

export function deriveDevelopParams(adj: Adjustments): DevelopParams {
  const b = adj.basic;
  const hues = HSL_BANDS.map((band) => HSL_BAND_HUES[band]);
  const hslHueShift = HSL_BANDS.map((band) => (adj.hsl[band].hue / 100) * 30);
  const hslSat = HSL_BANDS.map((band) => adj.hsl[band].saturation / 100);
  const hslLum = HSL_BANDS.map((band) => adj.hsl[band].luminance / 100);

  const m = adj.mixer;
  const mixer = [m.red.r, m.red.g, m.red.b, m.green.r, m.green.g, m.green.b, m.blue.r, m.blue.g, m.blue.b].map(
    (v) => v / 100,
  );
  const mixerActive = mixer.some((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) > 1e-6);

  const curveLut = new Float32Array(CURVE_LUT_SIZE * 4);
  CURVE_CHANNELS.forEach((ch, i) => curveLut.set(bakeCurve(adj.curves[ch]), i * CURVE_LUT_SIZE));
  const curvesActive = CURVE_CHANNELS.some((ch) => !isIdentityCurve(adj.curves[ch]));

  const g = adj.grading;
  const bal = g.balance / 100;
  const grading = {
    shadows: wheelToAbL(g.shadows),
    midtones: wheelToAbL(g.midtones),
    highlights: wheelToAbL(g.highlights),
    global: wheelToAbL(g.global),
    split1: 0.36 - 0.16 * bal,
    split2: 0.68 - 0.16 * bal,
    width: 0.06 + 0.22 * (g.blending / 100),
    active: [g.shadows, g.midtones, g.highlights, g.global].some(
      (w) => w.saturation !== 0 || w.luminance !== 0,
    ),
  };

  const lv = adj.levels;
  const levels = {
    inBlack: lv.inBlack / 255,
    inWhite: Math.max(lv.inWhite, lv.inBlack + 1) / 255,
    invGamma: 1 / lv.gamma,
    outBlack: lv.outBlack / 255,
    outWhite: lv.outWhite / 255,
  };
  const levelsActive =
    lv.inBlack !== 0 || lv.inWhite !== 255 || lv.gamma !== 1 || lv.outBlack !== 0 || lv.outWhite !== 255;

  return {
    wb: whiteBalanceMultipliers(b.temperature, b.tint),
    exposureMul: Math.pow(2, b.exposure),
    mixer,
    mixerActive,
    tone: {
      blacks: b.blacks / 100,
      whites: b.whites / 100,
      shadows: b.shadows / 100,
      highlights: b.highlights / 100,
      contrast: b.contrast / 100,
      brightness: b.brightness / 100,
    },
    hslHues: hues,
    hslHueShift,
    hslSat,
    hslLum,
    hslActive: [...hslHueShift, ...hslSat, ...hslLum].some((v) => v !== 0),
    vibrance: b.vibrance / 100,
    saturation: b.saturation / 100,
    monochrome: b.monochrome / 100,
    grading,
    curveLut,
    curvesActive,
    levels,
    levelsActive,
    detail: {
      texture: adj.presence.texture / 100,
      clarity: adj.presence.clarity / 100,
      dehaze: adj.presence.dehaze / 100,
      sharpen: adj.detail.sharpening / 100,
      sharpenMask: adj.detail.sharpenMasking / 100,
      noise: adj.detail.noiseReduction / 100,
      colorNoise: adj.detail.colorNoiseReduction / 100,
    },
    vignette: {
      amount: adj.effects.vignette / 100,
      midpoint: adj.effects.vignetteMidpoint / 100,
      roundness: adj.effects.vignetteRoundness / 100,
      feather: adj.effects.vignetteFeather / 100,
    },
    grain: {
      amount: adj.effects.grain / 100,
      size: adj.effects.grainSize / 100,
      roughness: adj.effects.grainRoughness / 100,
    },
  };
}

export interface LocalParams {
  exposureMul: number;
  wb: [number, number, number];
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  clarity: number;
  dehaze: number;
  blur: number;
  tint: [number, number]; // OKLab a,b offset
}

export function deriveLocalParams(l: LocalAdjustments): LocalParams {
  const [, ta, tb] = oklchToOklab(0, (l.tintAmount / 100) * 0.12, l.tintHue);
  return {
    exposureMul: Math.pow(2, l.exposure),
    wb: whiteBalanceMultipliers(l.temperature, l.tint),
    contrast: l.contrast / 100,
    highlights: l.highlights / 100,
    shadows: l.shadows / 100,
    saturation: l.saturation / 100,
    clarity: l.clarity / 100,
    dehaze: l.dehaze / 100,
    blur: l.blur / 100,
    tint: [ta, tb],
  };
}

/** Blur radii as fractions of the image long edge (resolution-independent). */
export const BLUR_RADII = {
  /** Fine detail: sharpening, noise reduction. */
  small: 0.0012,
  /** Texture band, skin smoothing. */
  medium: 0.006,
  /** Clarity / local contrast, dehaze. */
  large: 0.025,
  /** Maximum background blur for mask layers at blur = 100. */
  layerMax: 0.03,
};

/** Minimum blur radius in pixels, so detail controls still act on small previews. */
export const MIN_BLUR_PX = { small: 0.75, medium: 1.5, large: 4 };
