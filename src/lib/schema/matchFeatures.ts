/**
 * Compact, versioned colour/tone statistics of a reference image, used for
 * target-aware matching (src/lib/analysis/match.ts). Stored in reference
 * presets (`reference.features`) so a saved look can later be matched to any
 * photo. Everything is bounded and validated: presets are untrusted input.
 */
import { z } from 'zod';

/** Perceptual-luminance quantiles stored in `lum` (same order). */
export const LUM_QUANTILES = [0.01, 0.05, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.95, 0.99] as const;
/** Number of OKLCh hue bins (15 degrees each) in `hues`. */
export const HUE_BINS = 24;

const unit = z.number().refine(Number.isFinite).min(0).max(1);
const ab = z.number().refine(Number.isFinite).min(-0.5).max(0.5);
const chroma = z.number().refine(Number.isFinite).min(0).max(0.5);

const ZoneSchema = z.object({ a: ab, b: ab, s: unit });

export const HueBinSchema = z.object({
  /** Share of chromatic pixels (C >= 0.03) in this bin. */
  w: unit,
  /** Mean chroma, mean lightness and circular-mean hue (degrees) of those pixels. */
  C: chroma,
  L: unit,
  h: z.number().refine(Number.isFinite).min(0).max(360),
});

export const MatchFeaturesSchema = z.object({
  v: z.literal(1),
  lum: z.array(unit).length(LUM_QUANTILES.length),
  /** Mean OKLab lightness. */
  Lmean: unit,
  chroma: z.object({ p50: chroma, mean: chroma, p90: chroma }),
  /** Fraction of all pixels with chroma >= 0.03. */
  chromatic: unit,
  /** Mean OKLab a/b of nearly colourless pixels (C < 0.035) and their share. */
  cast: ZoneSchema,
  /** Near-neutral (C < 0.06) tints in shadows, midtones and highlights (OKLab L < 0.42, < 0.72, rest). */
  zones: z.tuple([ZoneSchema, ZoneSchema, ZoneSchema]),
  hues: z.array(HueBinSchema).length(HUE_BINS),
  mono: z.boolean(),
});

export type MatchFeatures = z.infer<typeof MatchFeaturesSchema>;
export type HueBin = z.infer<typeof HueBinSchema>;
