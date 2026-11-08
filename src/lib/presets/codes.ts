/**
 * Catalogue identity for preset categories: a three-letter code per category and a number per
 * look inside it (e.g. "CIN 07"), plus a tint used only as a small identity mark (a dot, a
 * faint wash behind a category tile).
 */
import type { PresetCategoryId } from '@/lib/schema/preset';

export const CATEGORY_CODES: Record<PresetCategoryId, string> = {
  signature: 'SIG',
  cinematic: 'CIN',
  'pale-blue': 'PBL',
  film: 'FLM',
  matte: 'MAT',
  portrait: 'POR',
  wedding: 'WED',
  luxury: 'LUX',
  'golden-hour': 'GLD',
  travel: 'TRV',
  earthy: 'ERT',
  street: 'STR',
  bw: 'B/W',
  social: 'SOC',
  custom: 'OWN',
  reference: 'REF',
};

// Afterimage: no per-category rainbow. Looks are told apart by their real previews.
const LILAC = '#c8b8ff';
const TINTS: Record<PresetCategoryId, string> = {
  signature: LILAC,
  cinematic: LILAC,
  'pale-blue': LILAC,
  film: LILAC,
  matte: LILAC,
  portrait: LILAC,
  wedding: LILAC,
  luxury: LILAC,
  'golden-hour': LILAC,
  travel: LILAC,
  earthy: LILAC,
  street: LILAC,
  bw: '#f0ebe1',
  social: LILAC,
  custom: '#f0ebe1',
  reference: LILAC,
};

export function categoryCode(category: string): string {
  return CATEGORY_CODES[category as PresetCategoryId] ?? 'OWN';
}

export function categoryTint(category: string): string {
  return TINTS[category as PresetCategoryId] ?? TINTS.custom;
}

/** "CIN 07": the category code and the look's 1-based number within its category. */
export function catalogueNumber(category: string, indexInCategory: number): string {
  return `${categoryCode(category)} ${String(indexInCategory + 1).padStart(2, '0')}`;
}
