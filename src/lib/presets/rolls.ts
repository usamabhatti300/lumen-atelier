/**
 * Rolls: the editorial face of the look categories ("Afterimage"). Each built-in category is
 * presented as a numbered roll with a name and a short mood, the way a contact sheet is labelled.
 * This is a display layer only: looks keep their category ids and adjustments.
 * The mood words also feed search, so "black and white" or "warm" still finds the right roll.
 *
 * The library was cut from 14 rolls to 8 on 2026-11-14, and four trend rolls (09-12) were added. The six retired category ids stay valid
 * in the schema (a look you saved under one of them still loads) and show under Yours.
 */
import type { PresetCategoryId } from '@/lib/schema/preset';
import { PRESET_CATEGORIES } from './library';

export interface Roll {
  /** Two-digit roll number, or '—' for your own looks. */
  no: string;
  name: string;
  mood: string;
  /** The look that fronts the roll on home (its boldest all-rounder); the first look when absent. */
  cover?: string;
}

const YOURS: Roll = { no: '—', name: 'Yours', mood: 'looks you saved' };

export const ROLLS: Record<PresetCategoryId, Roll> = {
  signature: { no: '01', name: "Editor's Picks", mood: 'clean, true colour, all-round', cover: 'Vivid Postcard' },
  film: { no: '02', name: 'Basement Summer', mood: 'colour film, warm, grain' },
  cinematic: { no: '03', name: 'Late Showing', mood: 'cinema, moody, night' },
  'pale-blue': { no: '04', name: 'Blue Hour Tapes', mood: 'cool, soft, pastel', cover: 'Blue Hour' },
  matte: { no: '05', name: 'Soft Static', mood: 'matte, muted, earthy', cover: 'Cocoa' },
  'golden-hour': { no: '06', name: 'Golden Minutes', mood: 'warm sun, golden hour' },
  street: { no: '07', name: 'Flash at Midnight', mood: 'flash, street, neon', cover: 'Night Neon' },
  bw: { no: '08', name: 'Monochrome Diary', mood: 'black & white' },
  // Trend rolls.
  digicam: { no: '09', name: 'Pocket Digicam', mood: '2000s, ccd, flash', cover: 'CCD Daylight' },
  y2016: { no: '10', name: '2016', mood: 'warm, saturated, matte', cover: 'Golden Feed' },
  camcorder: { no: '11', name: 'Camcorder', mood: 'home video, tape, soft', cover: 'Tape Sunset' },
  lofi: { no: '12', name: 'Lofi Dusk', mood: 'purple dusk, neon, glow', cover: 'Lofi Dusk' },
  // Retired with the 186-look library; only looks you saved can still carry these.
  portrait: YOURS,
  wedding: YOURS,
  luxury: YOURS,
  travel: YOURS,
  earthy: YOURS,
  social: YOURS,
  custom: YOURS,
  reference: { no: '—', name: 'Matched', mood: 'made from your references' },
};

/** The built-in rolls, in shelf order. */
export const ROLL_IDS: readonly PresetCategoryId[] = PRESET_CATEGORIES;

export function rollOf(category: string): Roll {
  return ROLLS[category as PresetCategoryId] ?? YOURS;
}
