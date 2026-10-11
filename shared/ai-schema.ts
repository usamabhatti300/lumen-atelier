/**
 * Shared contract between the browser and the API server for the AI style
 * interpretation step of the reference-to-preset workflow.
 *
 * The vision model is ONLY asked for qualitative, categorical judgements
 * (e.g. "shadows have a moderate teal tint", "greens are subdued"). It never
 * returns slider values. The browser combines these judgements with measured
 * image statistics through a deterministic, documented mapping
 * (src/lib/analysis/mapping.ts). See docs/AI_ARCHITECTURE.md.
 *
 * This file must stay dependency-light (zod only) and use erasable TS syntax
 * because Node runs it directly via type stripping.
 */
import { z } from 'zod';

export const HUE_NAMES = [
  'none',
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'purple',
  'magenta',
  'pink',
] as const;

export const TINT_STRENGTHS = ['none', 'subtle', 'moderate', 'strong'] as const;

export const ColorTintSchema = z.strictObject({
  hue: z.enum(HUE_NAMES),
  strength: z.enum(TINT_STRENGTHS),
});
export type ColorTint = z.infer<typeof ColorTintSchema>;

export const CONTENT_WARNINGS = [
  'screenshot_ui',
  'multiple_photos',
  'illustration_or_render',
  'monochrome',
  'heavy_text_overlay',
  'very_low_quality',
  'not_a_photo',
  'mixed_lighting',
  'night_or_neon',
] as const;

export const SCENE_TYPES = [
  'portrait',
  'group_portrait',
  'fashion',
  'landscape',
  'cityscape',
  'street',
  'night',
  'interior',
  'product',
  'food',
  'other',
] as const;

/**
 * Model-facing schema: no length limits, because structured-output JSON
 * schemas support only a subset of constraints. Lengths are enforced by
 * StyleInterpretationSchema below when the response is validated.
 */
export const StyleInterpretationModelSchema = z.strictObject({
  styleSummary: z
    .string()
    .describe(
      'One or two sentences describing the photographic look, e.g. "Muted cinematic editorial with cool cyan shadows, warm natural skin, subdued greens and lifted blacks."',
    ),
  moodTags: z.array(z.string()).describe('Up to 6 short lowercase mood/style words.'),
  sceneType: z.enum(SCENE_TYPES),
  contentWarnings: z
    .array(z.enum(CONTENT_WARNINGS))
    .describe('Issues that make the image a weak or ambiguous style reference.'),
  tone: z.strictObject({
    contrast: z.enum(['very_low', 'low', 'medium', 'high', 'very_high']),
    blacks: z.enum(['crushed', 'deep', 'neutral', 'lifted', 'faded']),
    highlights: z.enum(['clipped', 'bright', 'controlled', 'muted']),
    exposureIntent: z.enum(['dark_moody', 'low_key', 'balanced', 'bright', 'high_key']),
  }),
  color: z.strictObject({
    temperatureFeel: z.enum(['very_cool', 'cool', 'neutral', 'warm', 'very_warm']),
    saturationFeel: z.enum(['monochrome', 'muted', 'natural', 'rich', 'vivid']),
    shadowTint: ColorTintSchema,
    midtoneTint: ColorTintSchema,
    highlightTint: ColorTintSchema,
    greens: z.enum(['not_present', 'subdued', 'natural', 'vivid', 'shifted_yellow', 'shifted_teal']),
    blues: z.enum(['not_present', 'subdued', 'natural', 'vivid', 'shifted_teal', 'shifted_purple']),
    skin: z.enum(['not_present', 'natural', 'warm', 'golden', 'pale', 'desaturated', 'pink']),
  }),
  texture: z.strictObject({
    grain: z.enum(['none', 'fine', 'moderate', 'heavy', 'uncertain']),
    vignette: z.enum(['none', 'subtle', 'strong', 'uncertain']),
    softness: z.enum(['crisp', 'natural', 'soft', 'dreamy_glow']),
  }),
  confidence: z.enum(['low', 'medium', 'high']),
  notes: z
    .array(z.string())
    .describe('Short notes about uncertainty, e.g. "Grain may be JPEG compression".'),
});

/** Strict validation applied to every model response (server and client). */
export const StyleInterpretationSchema = StyleInterpretationModelSchema.extend({
  styleSummary: z.string().min(8).max(600),
  moodTags: z.array(z.string().min(1).max(40)).max(8),
  contentWarnings: z.array(z.enum(CONTENT_WARNINGS)).max(CONTENT_WARNINGS.length),
  notes: z.array(z.string().max(300)).max(6),
});
export type StyleInterpretation = z.infer<typeof StyleInterpretationSchema>;

/**
 * Compact measured statistics sent alongside the image so the model can ground
 * its wording in numbers. Purely informational for the model.
 */
export const MeasuredSummarySchema = z.strictObject({
  meanLuminance: z.number().min(0).max(1),
  contrast: z.number().min(0).max(1),
  blackFloor: z.number().min(0).max(1),
  whiteCeiling: z.number().min(0).max(1),
  meanChroma: z.number().min(0).max(1),
  warmth: z.number().min(-1).max(1),
  dominantColors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(8),
});
export type MeasuredSummary = z.infer<typeof MeasuredSummarySchema>;

export const MAX_ANALYZE_IMAGE_BASE64_LENGTH = 4_000_000; // ~3 MB of JPEG

export const AnalyzeRequestSchema = z.strictObject({
  image: z.strictObject({
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z
      .string()
      .min(100)
      .max(MAX_ANALYZE_IMAGE_BASE64_LENGTH)
      .regex(/^[A-Za-z0-9+/=]+$/, 'image data must be base64'),
  }),
  measured: MeasuredSummarySchema,
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeResponseSchema = z.strictObject({
  interpretation: StyleInterpretationSchema,
  model: z.string(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const API_ERROR_CODES = [
  'not_configured',
  'invalid_request',
  'payload_too_large',
  'rate_limited',
  'upstream_auth',
  'upstream_rate_limited',
  'upstream_error',
  'upstream_timeout',
  'refused',
  'invalid_model_output',
  'cancelled',
  'internal',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    retryable: z.boolean(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthResponseSchema = z.strictObject({
  ok: z.literal(true),
  ai: z.strictObject({
    configured: z.boolean(),
    provider: z.enum(['anthropic', 'ollama']),
    model: z.string(),
    /** True when the model runs on this computer (the reference never leaves the device). */
    local: z.boolean(),
    /** Longest image side to send; smaller for slow local models. */
    maxImageSide: z.number().int().min(256).max(2048),
    /** How long the browser should wait for an answer. */
    timeoutMs: z.number().int().positive(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** JSON schema for structured outputs, with the `$schema` key removed. */
export function interpretationJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(StyleInterpretationModelSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
