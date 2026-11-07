/**
 * Catalogue identity for preset categories: a three-letter code per category and a number per
 * look inside it (e.g. "CIN 07"), plus one tint per category from the prism, used only as a
 * small identity mark (a dot, a hairline, a faint wash behind a category tile).
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

const TINTS: Record<PresetCategoryId, string> = {
  signature: '#d4ff3f',
  cinematic: '#3fe0ff',
  'pale-blue': '#9cc8ff',
  film: '#ffb547',
  matte: '#c9b8a3',
  portrait: '#ff9d8a',
  wedding: '#f4dcc6',
  luxury: '#d98cff',
  'golden-hour': '#ff9a3d',
  travel: '#4fe0a0',
  earthy: '#b9a35c',
  street: '#ff5c7a',
  bw: '#e8e8e8',
  social: '#8f7dff',
  custom: '#f5f5f2',
  reference: '#d4ff3f',
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
