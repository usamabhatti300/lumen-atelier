/**
 * Preset model and versioned JSON interchange format.
 *
 *   { "schema": "lumen-atelier/presets", "version": 1, "presets": [ Preset, ... ] }
 *
 * Imports are size-limited, parsed as data only (never evaluated), validated
 * with Zod, and clamped to supported ranges. Keys this version does not
 * understand are reported back to the user instead of being silently dropped.
 */
import { z } from 'zod';
import { PartialAdjustmentsSchema, type PartialAdjustments } from './adjustments';
import { MatchFeaturesSchema } from './matchFeatures';

export const PRESET_SCHEMA_ID = 'lumen-atelier/presets';
export const PRESET_FORMAT_VERSION = 1;
export const MAX_PRESET_FILE_BYTES = 2 * 1024 * 1024;

export const PRESET_CATEGORY_IDS = [
  'signature',
  'cinematic',
  'pale-blue',
  'film',
  'matte',
  'portrait',
  'wedding',
  'luxury',
  'golden-hour',
  'travel',
  'earthy',
  'street',
  'bw',
  'social',
  'custom',
  'reference',
] as const;
export type PresetCategoryId = (typeof PRESET_CATEGORY_IDS)[number];

export const ReferenceInfoSchema = z.object({
  styleSummary: z.string().max(600),
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(10),
  confidence: z.enum(['low', 'medium', 'high']),
  notes: z.array(z.string().max(300)).max(12),
  aiInterpretation: z.boolean(),
  model: z.string().max(80).optional(),
  /** Small JPEG data URL of the (cropped) reference, for the preset card. */
  thumbnail: z
    .string()
    .max(200_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  /**
   * Compact colour/tone statistics of the reference (additive, optional), so the look can later be
   * matched to another photo ("Match to this photo"). Older presets simply lack it.
   */
  features: MatchFeaturesSchema.optional(),
});
export type ReferenceInfo = z.infer<typeof ReferenceInfoSchema>;

export const PresetSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  category: z.enum(PRESET_CATEGORY_IDS),
  description: z.string().max(400).default(''),
  tags: z.array(z.string().max(30)).max(12).default([]),
  origin: z.enum(['builtin', 'user', 'reference']),
  adjustments: PartialAdjustmentsSchema,
  reference: ReferenceInfoSchema.optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Preset = z.infer<typeof PresetSchema> & { adjustments: PartialAdjustments };

export const PresetFileSchema = z.object({
  schema: z.literal(PRESET_SCHEMA_ID),
  version: z.number().int().min(1),
  presets: z.array(z.unknown()).max(500),
});

export interface PresetImportResult {
  presets: Preset[];
  warnings: string[];
  rejected: number;
}

/** Parses an exported preset file. Never executes content; returns validated presets and warnings. */
export function parsePresetFile(text: string, newId: () => string): PresetImportResult {
  if (text.length > MAX_PRESET_FILE_BYTES) {
    throw new Error('Preset file is larger than 2 MB.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const file = PresetFileSchema.safeParse(raw);
  if (!file.success) {
    throw new Error('This is not a Lumen Atelier preset file (missing schema header).');
  }
  const warnings: string[] = [];
  if (file.data.version > PRESET_FORMAT_VERSION) {
    warnings.push(
      `The file uses format version ${file.data.version}; this app reads version ${PRESET_FORMAT_VERSION}. Newer settings may be ignored.`,
    );
  }
  const presets: Preset[] = [];
  let rejected = 0;
  const now = Date.now();
  for (const [i, entry] of file.data.presets.entries()) {
    const candidate = {
      ...(typeof entry === 'object' && entry ? entry : {}),
      id: newId(),
      origin: 'user',
      createdAt: now,
      updatedAt: now,
    } as Record<string, unknown>;
    if (candidate.category === undefined) candidate.category = 'custom';
    const parsed = PresetSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected++;
      warnings.push(`Preset #${i + 1} was skipped: ${parsed.error.issues[0]?.message ?? 'invalid data'}.`);
      continue;
    }
    const unknown = unknownKeys((entry as Record<string, unknown>).adjustments, parsed.data.adjustments);
    if (unknown.length) {
      warnings.push(`"${parsed.data.name}": unsupported settings not imported: ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? '…' : ''}.`);
    }
    const clamped = changedValues((entry as Record<string, unknown>).adjustments, parsed.data.adjustments);
    if (clamped.length) {
      warnings.push(`"${parsed.data.name}": out-of-range values were clamped: ${clamped.slice(0, 6).join(', ')}.`);
    }
    presets.push(parsed.data as Preset);
  }
  return { presets, warnings, rejected };
}

export function serializePresets(presets: Preset[]): string {
  return JSON.stringify(
    {
      schema: PRESET_SCHEMA_ID,
      version: PRESET_FORMAT_VERSION,
      presets: presets.map((p) => ({
        name: p.name,
        category: p.category === 'reference' ? 'reference' : p.category,
        description: p.description,
        tags: p.tags,
        adjustments: p.adjustments,
        reference: p.reference,
      })),
    },
    null,
    2,
  );
}

/** Dotted paths present in `raw` but absent from `parsed` (unknown/unsupported keys). */
export function unknownKeys(raw: unknown, parsed: unknown, prefix = ''): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const p = (parsed as Record<string, unknown> | undefined)?.[k];
    if (p === undefined) out.push(path);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...unknownKeys(v, p, path));
  }
  return out;
}

function changedValues(raw: unknown, parsed: unknown, prefix = ''): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const p = (parsed as Record<string, unknown> | undefined)?.[k];
    if (typeof v === 'number' && typeof p === 'number' && Math.abs(v - p) > 1e-9) out.push(path);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...changedValues(v, p, path));
  }
  return out;
}
