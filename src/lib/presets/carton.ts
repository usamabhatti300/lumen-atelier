/**
 * Film-carton identity for preset categories: every category prints its looks on one carton
 * colour with a three-letter stock code, and each look gets a catalogue number inside it
 * (e.g. "CIN 07"). Codes and colours are our own; they imitate no real film brand.
 * Every pair keeps its text at WCAG AA (4.5:1) or better.
 */
import type { PresetCategoryId } from '@/lib/schema/preset';

export interface Carton {
  /** Carton face colour. */
  bg: string;
  /** Text printed on it. */
  fg: string;
  /** Three-letter stock code. */
  code: string;
}

export const CARTONS: Record<PresetCategoryId, Carton> = {
  signature: { bg: '#121212', fg: '#e4a11b', code: 'SIG' },
  cinematic: { bg: '#2f6db5', fg: '#f4f1ea', code: 'CIN' },
  'pale-blue': { bg: '#a9cbe3', fg: '#121212', code: 'PBL' },
  film: { bg: '#e4a11b', fg: '#121212', code: 'FLM' },
  matte: { bg: '#bdb3a2', fg: '#121212', code: 'MAT' },
  portrait: { bg: '#e8aa9c', fg: '#121212', code: 'POR' },
  wedding: { bg: '#efe2d2', fg: '#121212', code: 'WED' },
  luxury: { bg: '#5b2333', fg: '#f4f1ea', code: 'LUX' },
  'golden-hour': { bg: '#e07a2e', fg: '#121212', code: 'GLD' },
  travel: { bg: '#2b7352', fg: '#f4f1ea', code: 'TRV' },
  earthy: { bg: '#5f522b', fg: '#f4f1ea', code: 'ERT' },
  street: { bg: '#c8322b', fg: '#f4f1ea', code: 'STR' },
  bw: { bg: '#3a3a3a', fg: '#f4f1ea', code: 'B/W' },
  social: { bg: '#7d4fc2', fg: '#f4f1ea', code: 'SOC' },
  custom: { bg: '#f4f1ea', fg: '#121212', code: 'OWN' },
  reference: { bg: '#121212', fg: '#f4f1ea', code: 'REF' },
};

export function cartonFor(category: string): Carton {
  return CARTONS[category as PresetCategoryId] ?? CARTONS.custom;
}

/** Carton inks in shelf order; a category's looks cycle through them from the category's own ink. */
const INKS: Carton[] = Object.entries(CARTONS)
  .filter(([id]) => id !== 'custom' && id !== 'reference')
  .map(([, c]) => c);

/** Each look prints on its own carton ink (keeping its category's stock code), so a shelf is never one colour. */
export function cartonForLook(category: string, indexInCategory: number): Carton {
  const own = cartonFor(category);
  const start = INKS.indexOf(own);
  if (start < 0) return own;
  const ink = INKS[(start + indexInCategory) % INKS.length];
  return { ...ink, code: own.code };
}

/** "CIN 07": the stock code and the look's 1-based number within its category. */
export function catalogueNumber(category: string, indexInCategory: number): string {
  return `${cartonFor(category).code} ${String(indexInCategory + 1).padStart(2, '0')}`;
}
