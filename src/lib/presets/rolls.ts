/**
 * Rolls: the editorial face of the preset categories ("Afterimage"). Each category is presented
 * as a numbered roll with a name and a two-word mood, the way a contact sheet is labelled. This is
 * a display layer only: presets keep their category ids, catalogue numbers and adjustments.
 * The mood words also feed search, so "black and white" or "warm" still finds the right roll.
 */
import type { PresetCategoryId } from '@/lib/schema/preset';

export interface Roll {
  /** Two-digit roll number, fixed so it never changes as the library grows. */
  no: string;
  name: string;
  mood: string;
}

export const ROLLS: Record<PresetCategoryId, Roll> = {
  signature: { no: '01', name: "Editor's Picks", mood: 'our best, all-round' },
  cinematic: { no: '02', name: 'Late Showing', mood: 'moody, filmic' },
  'pale-blue': { no: '03', name: 'Blue Hour Tapes', mood: 'cool, soft, pale' },
  film: { no: '04', name: 'Basement Summer', mood: 'warm, faded film' },
  matte: { no: '05', name: 'Soft Static', mood: 'matte, muted' },
  portrait: { no: '06', name: 'Close Up', mood: 'portraits, skin first' },
  wedding: { no: '07', name: 'Something Borrowed', mood: 'romantic, airy' },
  luxury: { no: '08', name: 'Front Row', mood: 'fashion, polished' },
  'golden-hour': { no: '09', name: 'Golden Minutes', mood: 'warm sun, golden hour' },
  travel: { no: '10', name: 'Postcards', mood: 'travel, landscape' },
  earthy: { no: '11', name: 'Moss & Clay', mood: 'earthy, forest' },
  street: { no: '12', name: 'Flash at Midnight', mood: 'street, flash, contrast' },
  bw: { no: '13', name: 'Monochrome Diary', mood: 'black & white' },
  social: { no: '14', name: 'Feed Ready', mood: 'bold, experimental' },
  custom: { no: '—', name: 'Yours', mood: 'looks you saved' },
  reference: { no: '—', name: 'Matched', mood: 'made from your references' },
};

export function rollOf(category: string): Roll {
  return ROLLS[category as PresetCategoryId] ?? ROLLS.custom;
}

/** "roll 04 · Basement Summer", or just the name for your own rolls. */
export function rollTitle(category: string): string {
  const r = rollOf(category);
  return r.no === '—' ? r.name : `roll ${r.no} · ${r.name}`;
}
