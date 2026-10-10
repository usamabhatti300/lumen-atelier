/**
 * Versioned, non-destructive edit model.
 *
 * Every rendered pixel is a pure function of (original image, EditState).
 * The original image is never modified. Ranges defined here drive slider UI,
 * validation (clamping), preset blending, and the AI mapping.
 */
import { z } from 'zod';

export const EDIT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Control ranges (single source of truth)
// ---------------------------------------------------------------------------

export interface Range {
  min: number;
  max: number;
  default: number;
  step: number;
}
const r = (min: number, max: number, def = 0, step = 1): Range => ({ min, max, default: def, step });

export const RANGES = {
  basic: {
    exposure: r(-5, 5, 0, 0.01),
    brightness: r(-100, 100),
    contrast: r(-100, 100),
    highlights: r(-100, 100),
    shadows: r(-100, 100),
    whites: r(-100, 100),
    blacks: r(-100, 100),
    temperature: r(-100, 100),
    tint: r(-100, 100),
    vibrance: r(-100, 100),
    saturation: r(-100, 100),
    monochrome: r(0, 100),
  },
  presence: {
    texture: r(-100, 100),
    clarity: r(-100, 100),
    dehaze: r(-100, 100),
  },
  detail: {
    sharpening: r(0, 150),
    sharpenMasking: r(0, 100),
    noiseReduction: r(0, 100),
    colorNoiseReduction: r(0, 100),
  },
  hsl: {
    hue: r(-100, 100),
    saturation: r(-100, 100),
    luminance: r(-100, 100),
  },
  grading: {
    hue: r(0, 360, 0, 1),
    saturation: r(0, 100),
    luminance: r(-100, 100),
    blending: r(0, 100, 50),
    balance: r(-100, 100),
  },
  mixer: r(-200, 200),
  levels: {
    inBlack: r(0, 253, 0),
    inWhite: r(2, 255, 255),
    gamma: r(0.1, 9.99, 1, 0.01),
    outBlack: r(0, 255, 0),
    outWhite: r(0, 255, 255),
  },
  effects: {
    vignette: r(-100, 100),
    vignetteMidpoint: r(0, 100, 50),
    vignetteRoundness: r(-100, 100, 0),
    vignetteFeather: r(0, 100, 50),
    grain: r(0, 100),
    grainSize: r(0, 100, 25),
    grainRoughness: r(0, 100, 50),
  },
} as const;

export const HSL_BANDS = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
] as const;
export type HslBandName = (typeof HSL_BANDS)[number];

/** Band centre hues in degrees, measured in OKLCh hue space (see color/oklab.ts). */
export const HSL_BAND_HUES: Record<HslBandName, number> = {
  red: 25,
  orange: 55,
  yellow: 100,
  green: 140,
  aqua: 195,
  blue: 255,
  purple: 300,
  magenta: 345,
};

export const CURVE_CHANNELS = ['master', 'red', 'green', 'blue'] as const;
export type CurveChannel = (typeof CURVE_CHANNELS)[number];

export const GRADE_ZONES = ['shadows', 'midtones', 'highlights', 'global'] as const;
export type GradeZone = (typeof GRADE_ZONES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Curve control point [x, y] in display-referred 0..1. */
export type CurvePoint = [number, number];

export interface HslBand {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface GradeWheel {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface MixerRow {
  r: number;
  g: number;
  b: number;
}

export interface Adjustments {
  basic: {
    exposure: number;
    brightness: number;
    contrast: number;
    highlights: number;
    shadows: number;
    whites: number;
    blacks: number;
    temperature: number;
    tint: number;
    vibrance: number;
    saturation: number;
    monochrome: number;
  };
  presence: { texture: number; clarity: number; dehaze: number };
  detail: {
    sharpening: number;
    sharpenMasking: number;
    noiseReduction: number;
    colorNoiseReduction: number;
  };
  hsl: Record<HslBandName, HslBand>;
  curves: Record<CurveChannel, CurvePoint[]>;
  grading: {
    shadows: GradeWheel;
    midtones: GradeWheel;
    highlights: GradeWheel;
    global: GradeWheel;
    blending: number;
    balance: number;
  };
  /** Channel mixer, percentages. Output R = r*R + g*G + b*B (identity by default). */
  mixer: { red: MixerRow; green: MixerRow; blue: MixerRow };
  levels: { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number };
  effects: {
    vignette: number;
    vignetteMidpoint: number;
    vignetteRoundness: number;
    vignetteFeather: number;
    grain: number;
    grainSize: number;
    grainRoughness: number;
  };
}

export type Rotate90 = 0 | 1 | 2 | 3;

export interface CropRect {
  /** Normalized to the oriented frame (after 90° rotations), 0..1. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Geometry {
  rotate90: Rotate90;
  flipH: boolean;
  flipV: boolean;
  /** Fine rotation in degrees, -45..45. */
  straighten: number;
  crop: CropRect;
  /** Locked aspect ratio (w/h) or null for free. */
  aspect: number | null;
}

// --- Masks / adjustment layers ---------------------------------------------

export type MaskMode = 'add' | 'erase';

export interface BrushComponent {
  type: 'brush';
  id: string;
  mode: MaskMode;
  /** Brush diameter as a fraction of the image's long edge. */
  size: number;
  /** 0 = hard edge, 1 = fully feathered. */
  softness: number;
  /** 0..1 */
  opacity: number;
  /** Stroke path, normalized source-image coordinates. */
  points: [number, number][];
}

export interface LinearComponent {
  type: 'linear';
  id: string;
  mode: MaskMode;
  /** Full effect at (x0,y0), fading to none at (x1,y1). Normalized coordinates. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RadialComponent {
  type: 'radial';
  id: string;
  mode: MaskMode;
  cx: number;
  cy: number;
  /** Radii as a fraction of the long edge. */
  rx: number;
  ry: number;
  /** Degrees. */
  rotation: number;
  /** 0..1 */
  feather: number;
  /** Affect outside of the ellipse instead of inside. */
  invert: boolean;
}

export const SEGMENT_TARGETS = ['subject', 'background', 'hair', 'skin', 'clothes'] as const;
export type SegmentTarget = (typeof SEGMENT_TARGETS)[number];

export interface SegmentComponent {
  type: 'segment';
  id: string;
  mode: MaskMode;
  target: SegmentTarget;
}

export type MaskComponent = BrushComponent | LinearComponent | RadialComponent | SegmentComponent;

export interface LocalAdjustments {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  saturation: number;
  clarity: number;
  dehaze: number;
  /** Gaussian blur strength (e.g. background blur), 0..100. */
  blur: number;
  /** Colour overlay. */
  tintHue: number;
  tintAmount: number;
}

export const LOCAL_RANGES: Record<keyof LocalAdjustments, Range> = {
  exposure: r(-4, 4, 0, 0.01),
  contrast: r(-100, 100),
  highlights: r(-100, 100),
  shadows: r(-100, 100),
  temperature: r(-100, 100),
  tint: r(-100, 100),
  saturation: r(-100, 100),
  clarity: r(-100, 100),
  dehaze: r(-100, 100),
  blur: r(0, 100),
  tintHue: r(0, 360),
  tintAmount: r(0, 100),
};

export interface MaskLayer {
  id: string;
  name: string;
  visible: boolean;
  /** 0..100 */
  opacity: number;
  invert: boolean;
  components: MaskComponent[];
  adjustments: LocalAdjustments;
}

// --- Portrait retouching ---------------------------------------------------

export interface HealSpot {
  id: string;
  /** Centre, normalized source coordinates. */
  x: number;
  y: number;
  /** Radius as a fraction of the long edge. */
  r: number;
  /** Source sample offset (normalized), chosen automatically when the spot is placed. */
  dx: number;
  dy: number;
}

export interface Retouch {
  skinSmoothing: number;
  /** How much fine texture (pores) to keep while smoothing, 0..100. */
  skinTexture: number;
  eyeEnhance: number;
  teethWhitening: number;
  faceLight: number;
  underEye: number;
  spots: HealSpot[];
}

export const RETOUCH_RANGES = {
  skinSmoothing: r(0, 100),
  skinTexture: r(0, 100, 70),
  eyeEnhance: r(0, 100),
  teethWhitening: r(0, 100),
  faceLight: r(0, 100),
  underEye: r(0, 100),
} as const;

// --- Lens blur (depth of field) ---------------------------------------------

/**
 * Depth-aware lens blur. Photo-specific (like retouching), so it is not part
 * of `Adjustments` and never travels with presets. Optional in the edit state:
 * a missing value means "off", so older saved edits stay valid.
 */
export interface LensBlur {
  /** Strength (maximum blur disc size), 0..100. 0 is off. */
  amount: number;
  /** Focal plane distance: 0 = nearest, 100 = farthest part of the scene. */
  focus: number;
  /** How gradually the blur grows away from the focal plane, 0..100. */
  falloff: number;
  /** Brightness of out-of-focus highlights (bokeh), 0..100. */
  highlights: number;
  /** Where the user clicked to focus (normalized source coordinates), for the on-canvas marker. */
  focusPoint: [number, number] | null;
  /** Keep the detected person on one focal plane so they stay sharp (uses subject detection). */
  protectSubject: boolean;
}

export const LENS_BLUR_RANGES = {
  amount: r(0, 100),
  focus: r(0, 100, 0),
  falloff: r(0, 100, 50),
  highlights: r(0, 100, 50),
} as const;

export function defaultLensBlur(): LensBlur {
  return { amount: 0, focus: 0, falloff: 50, highlights: 50, focusPoint: null, protectSubject: true };
}

// --- LUT ---------------------------------------------------------------------

export interface LutRef {
  /** Identifier of a LUT stored in IndexedDB (lut store). */
  id: string;
  name: string;
  /** 0..100 */
  amount: number;
}

// --- Complete edit state ---------------------------------------------------

export interface AppliedPreset {
  id: string;
  name: string;
  /** 0..100 */
  amount: number;
  /** Adjustments that were in effect before the preset was applied. */
  baseline: Adjustments;
  /** The preset's partial adjustments. */
  values: PartialAdjustments;
  /** Paths ("basic.exposure") edited by hand since applying; kept when amount changes. */
  overrides: string[];
}

export interface EditState {
  version: typeof EDIT_SCHEMA_VERSION;
  adjustments: Adjustments;
  geometry: Geometry;
  layers: MaskLayer[];
  retouch: Retouch;
  lut: LutRef | null;
  appliedPreset: AppliedPreset | null;
  /** Toggles the visibility of all global adjustments (layers/retouch unaffected). */
  adjustmentsVisible: boolean;
  /** Depth-aware lens blur; absent means off (added without a schema version bump). */
  lensBlur?: LensBlur;
}

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type PartialAdjustments = DeepPartial<Adjustments>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const identityCurve = (): CurvePoint[] => [
  [0, 0],
  [1, 1],
];
const zeroBand = (): HslBand => ({ hue: 0, saturation: 0, luminance: 0 });
const zeroWheel = (): GradeWheel => ({ hue: 0, saturation: 0, luminance: 0 });

export function defaultAdjustments(): Adjustments {
  return {
    basic: {
      exposure: 0,
      brightness: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      temperature: 0,
      tint: 0,
      vibrance: 0,
      saturation: 0,
      monochrome: 0,
    },
    presence: { texture: 0, clarity: 0, dehaze: 0 },
    detail: { sharpening: 0, sharpenMasking: 0, noiseReduction: 0, colorNoiseReduction: 0 },
    hsl: Object.fromEntries(HSL_BANDS.map((b) => [b, zeroBand()])) as Record<HslBandName, HslBand>,
    curves: {
      master: identityCurve(),
      red: identityCurve(),
      green: identityCurve(),
      blue: identityCurve(),
    },
    grading: {
      shadows: zeroWheel(),
      midtones: zeroWheel(),
      highlights: zeroWheel(),
      global: zeroWheel(),
      blending: 50,
      balance: 0,
    },
    mixer: {
      red: { r: 100, g: 0, b: 0 },
      green: { r: 0, g: 100, b: 0 },
      blue: { r: 0, g: 0, b: 100 },
    },
    levels: { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 },
    effects: {
      vignette: 0,
      vignetteMidpoint: 50,
      vignetteRoundness: 0,
      vignetteFeather: 50,
      grain: 0,
      grainSize: 25,
      grainRoughness: 50,
    },
  };
}

export function defaultGeometry(): Geometry {
  return {
    rotate90: 0,
    flipH: false,
    flipV: false,
    straighten: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    aspect: null,
  };
}

export function defaultRetouch(): Retouch {
  return {
    skinSmoothing: 0,
    skinTexture: 70,
    eyeEnhance: 0,
    teethWhitening: 0,
    faceLight: 0,
    underEye: 0,
    spots: [],
  };
}

export function defaultLocalAdjustments(): LocalAdjustments {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    temperature: 0,
    tint: 0,
    saturation: 0,
    clarity: 0,
    dehaze: 0,
    blur: 0,
    tintHue: 30,
    tintAmount: 0,
  };
}

export function defaultEditState(): EditState {
  return {
    version: EDIT_SCHEMA_VERSION,
    adjustments: defaultAdjustments(),
    geometry: defaultGeometry(),
    layers: [],
    retouch: defaultRetouch(),
    lut: null,
    appliedPreset: null,
    adjustmentsVisible: true,
  };
}

// ---------------------------------------------------------------------------
// Validation (Zod). Numbers are clamped to range rather than rejected, so that
// slightly out-of-range values from imports or AI mapping are made safe.
// ---------------------------------------------------------------------------

const clampTo = (range: Range) =>
  z
    .number()
    .refine(Number.isFinite, 'must be finite')
    .transform((v) => Math.min(range.max, Math.max(range.min, v)));

const unit = z
  .number()
  .refine(Number.isFinite)
  .transform((v) => Math.min(1, Math.max(0, v)));

export const CurvePointsSchema = z
  .array(z.tuple([unit, unit]))
  .min(2)
  .max(16)
  .transform((pts) => normalizeCurve(pts));

const HslBandSchema = z.object({
  hue: clampTo(RANGES.hsl.hue),
  saturation: clampTo(RANGES.hsl.saturation),
  luminance: clampTo(RANGES.hsl.luminance),
});

const GradeWheelSchema = z.object({
  hue: z
    .number()
    .refine(Number.isFinite)
    .transform((v) => ((v % 360) + 360) % 360),
  saturation: clampTo(RANGES.grading.saturation),
  luminance: clampTo(RANGES.grading.luminance),
});

const MixerRowSchema = z.object({
  r: clampTo(RANGES.mixer),
  g: clampTo(RANGES.mixer),
  b: clampTo(RANGES.mixer),
});

function sectionSchema<T extends Record<string, Range>>(ranges: T) {
  return z.object(
    Object.fromEntries(Object.entries(ranges).map(([k, range]) => [k, clampTo(range)])) as {
      [K in keyof T]: ReturnType<typeof clampTo>;
    },
  );
}

export const AdjustmentsSchema = z.object({
  basic: sectionSchema(RANGES.basic),
  presence: sectionSchema(RANGES.presence),
  detail: sectionSchema(RANGES.detail),
  hsl: z.object(
    Object.fromEntries(HSL_BANDS.map((b) => [b, HslBandSchema])) as Record<
      HslBandName,
      typeof HslBandSchema
    >,
  ),
  curves: z.object({
    master: CurvePointsSchema,
    red: CurvePointsSchema,
    green: CurvePointsSchema,
    blue: CurvePointsSchema,
  }),
  grading: z.object({
    shadows: GradeWheelSchema,
    midtones: GradeWheelSchema,
    highlights: GradeWheelSchema,
    global: GradeWheelSchema,
    blending: clampTo(RANGES.grading.blending),
    balance: clampTo(RANGES.grading.balance),
  }),
  mixer: z.object({ red: MixerRowSchema, green: MixerRowSchema, blue: MixerRowSchema }),
  levels: sectionSchema(RANGES.levels),
  effects: sectionSchema(RANGES.effects),
});

/**
 * Partial adjustments (presets). Built by making every level optional.
 * Unknown keys are stripped (and reported by the importer).
 */
export const PartialAdjustmentsSchema = z.object({
  basic: sectionSchema(RANGES.basic).partial().optional(),
  presence: sectionSchema(RANGES.presence).partial().optional(),
  detail: sectionSchema(RANGES.detail).partial().optional(),
  hsl: z
    .object(
      Object.fromEntries(HSL_BANDS.map((b) => [b, HslBandSchema.partial().optional()])) as Record<
        HslBandName,
        z.ZodOptional<ReturnType<typeof HslBandSchema.partial>>
      >,
    )
    .optional(),
  curves: z
    .object({
      master: CurvePointsSchema.optional(),
      red: CurvePointsSchema.optional(),
      green: CurvePointsSchema.optional(),
      blue: CurvePointsSchema.optional(),
    })
    .optional(),
  grading: z
    .object({
      shadows: GradeWheelSchema.partial().optional(),
      midtones: GradeWheelSchema.partial().optional(),
      highlights: GradeWheelSchema.partial().optional(),
      global: GradeWheelSchema.partial().optional(),
      blending: clampTo(RANGES.grading.blending).optional(),
      balance: clampTo(RANGES.grading.balance).optional(),
    })
    .optional(),
  mixer: z
    .object({
      red: MixerRowSchema.partial().optional(),
      green: MixerRowSchema.partial().optional(),
      blue: MixerRowSchema.partial().optional(),
    })
    .optional(),
  levels: sectionSchema(RANGES.levels).partial().optional(),
  effects: sectionSchema(RANGES.effects).partial().optional(),
});

const coord = z.number().refine(Number.isFinite).transform((v) => Math.min(2, Math.max(-1, v)));
const maskMode = z.enum(['add', 'erase']);

export const MaskComponentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('brush'),
    id: z.string().max(64),
    mode: maskMode,
    size: z.number().min(0.0005).max(1),
    softness: unit,
    opacity: unit,
    points: z.array(z.tuple([coord, coord])).max(20_000),
  }),
  z.object({
    type: z.literal('linear'),
    id: z.string().max(64),
    mode: maskMode,
    x0: coord,
    y0: coord,
    x1: coord,
    y1: coord,
  }),
  z.object({
    type: z.literal('radial'),
    id: z.string().max(64),
    mode: maskMode,
    cx: coord,
    cy: coord,
    rx: z.number().min(0.001).max(4),
    ry: z.number().min(0.001).max(4),
    rotation: z.number().min(-360).max(360),
    feather: unit,
    invert: z.boolean(),
  }),
  z.object({
    type: z.literal('segment'),
    id: z.string().max(64),
    mode: maskMode,
    target: z.enum(SEGMENT_TARGETS),
  }),
]);

export const LocalAdjustmentsSchema = z.object(
  Object.fromEntries(
    Object.entries(LOCAL_RANGES).map(([k, range]) => [k, clampTo(range)]),
  ) as Record<keyof LocalAdjustments, ReturnType<typeof clampTo>>,
);

export const MaskLayerSchema = z.object({
  id: z.string().max(64),
  name: z.string().max(80),
  visible: z.boolean(),
  opacity: clampTo(r(0, 100, 100)),
  invert: z.boolean(),
  components: z.array(MaskComponentSchema).max(200),
  adjustments: LocalAdjustmentsSchema,
});

export const GeometrySchema = z.object({
  rotate90: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  flipH: z.boolean(),
  flipV: z.boolean(),
  straighten: clampTo(r(-45, 45)),
  crop: z.object({ x: unit, y: unit, w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1) }),
  aspect: z.number().positive().max(20).nullable(),
});

export const RetouchSchema = z.object({
  skinSmoothing: clampTo(RETOUCH_RANGES.skinSmoothing),
  skinTexture: clampTo(RETOUCH_RANGES.skinTexture),
  eyeEnhance: clampTo(RETOUCH_RANGES.eyeEnhance),
  teethWhitening: clampTo(RETOUCH_RANGES.teethWhitening),
  faceLight: clampTo(RETOUCH_RANGES.faceLight),
  underEye: clampTo(RETOUCH_RANGES.underEye),
  spots: z
    .array(
      z.object({
        id: z.string().max(64),
        x: coord,
        y: coord,
        r: z.number().min(0.001).max(0.25),
        dx: z.number().min(-1).max(1),
        dy: z.number().min(-1).max(1),
      }),
    )
    .max(64),
});

export const LensBlurSchema = z.object({
  amount: clampTo(LENS_BLUR_RANGES.amount),
  focus: clampTo(LENS_BLUR_RANGES.focus),
  falloff: clampTo(LENS_BLUR_RANGES.falloff),
  highlights: clampTo(LENS_BLUR_RANGES.highlights),
  focusPoint: z.tuple([unit, unit]).nullable(),
  protectSubject: z.boolean(),
});

export const EditStateSchema = z.object({
  version: z.literal(EDIT_SCHEMA_VERSION),
  adjustments: AdjustmentsSchema,
  geometry: GeometrySchema,
  layers: z.array(MaskLayerSchema).max(32),
  retouch: RetouchSchema,
  lut: z
    .object({ id: z.string().max(64), name: z.string().max(120), amount: clampTo(r(0, 100, 100)) })
    .nullable(),
  appliedPreset: z
    .object({
      id: z.string().max(64),
      name: z.string().max(120),
      amount: clampTo(r(0, 100, 100)),
      baseline: AdjustmentsSchema,
      values: PartialAdjustmentsSchema,
      overrides: z.array(z.string().max(64)).max(500),
    })
    .nullable(),
  adjustmentsVisible: z.boolean(),
  lensBlur: LensBlurSchema.optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sorts, dedupes by x, pins endpoints' x to [0,1] domain. */
export function normalizeCurve(points: CurvePoint[]): CurvePoint[] {
  const sorted = [...points]
    .map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))] as CurvePoint)
    .sort((a, b) => a[0] - b[0]);
  const out: CurvePoint[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-4) out[out.length - 1] = p;
    else out.push(p);
  }
  if (out.length === 1) out.push([out[0][0] < 0.5 ? 1 : 0, out[0][0] < 0.5 ? 1 : 0]);
  return out.sort((a, b) => a[0] - b[0]);
}

export function isIdentityCurve(points: CurvePoint[]): boolean {
  return points.every(([x, y]) => Math.abs(x - y) < 1e-4);
}

/** Recursively merges partial adjustments onto a full set (presets, paste). */
export function mergeAdjustments(base: Adjustments, partial: PartialAdjustments): Adjustments {
  return deepMerge(base, partial) as Adjustments;
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return structuredClone(base);
  if (Array.isArray(patch) || typeof patch !== 'object' || patch === null) return structuredClone(patch);
  const out: Record<string, unknown> = structuredClone(base as Record<string, unknown>);
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = k in out ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out;
}

/** Leaf paths ("basic.exposure", "curves.master") defined in a partial. */
export function leafPaths(partial: PartialAdjustments): string[] {
  const out: string[] = [];
  const walk = (node: unknown, prefix: string) => {
    if (node === undefined) return;
    if (Array.isArray(node) || typeof node !== 'object' || node === null) {
      out.push(prefix);
      return;
    }
    // Curves are atomic leaves; walking into point arrays is meaningless.
    for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
  };
  walk(partial, '');
  return out;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone = structuredClone(obj) as Record<string, unknown>;
  let node = clone;
  for (const k of keys.slice(0, -1)) {
    node[k] = { ...(node[k] as Record<string, unknown>) };
    node = node[k] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
  return clone as T;
}

/** Range for a dotted adjustment path, used by UI and blending. */
export function rangeForPath(path: string): Range | undefined {
  const [section, key, sub] = path.split('.');
  if (section === 'hsl' && sub) return RANGES.hsl[sub as keyof typeof RANGES.hsl];
  if (section === 'grading') {
    if (sub) return RANGES.grading[sub as 'hue' | 'saturation' | 'luminance'];
    return RANGES.grading[key as 'blending' | 'balance'];
  }
  if (section === 'mixer') return RANGES.mixer;
  const group = (RANGES as unknown as Record<string, Record<string, Range>>)[section];
  return group?.[key];
}

export function isDefaultAdjustments(a: Adjustments): boolean {
  return JSON.stringify(a) === JSON.stringify(defaultAdjustments());
}
