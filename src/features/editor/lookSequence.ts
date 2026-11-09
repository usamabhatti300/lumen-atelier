/**
 * Swipe between looks (roadmap 2.1): the Looks browser publishes the looks it is showing (the open
 * roll, Kept, Last roll or Yours, after any search), and a horizontal swipe on the photo steps to the
 * next or previous one, wrapping around. Applying works exactly like tapping a tile: the look is
 * fitted to the photo (adaptive looks), with a haptic tick; the afterimage and the readout follow.
 */
import { create } from 'zustand';
import { useEditor } from '@/state/editorStore';
import { usePresets } from '@/state/presetStore';
import { tick } from '@/lib/haptics';
import { adaptationForLook } from '@/engine/lookAdapt';
import type { Preset } from '@/lib/schema/preset';

/** The ids of the looks currently shown in the editor's Looks browser, in order. */
export const useLookSequence = create<{ ids: string[] }>(() => ({ ids: [] }));

export function publishLookSequence(ids: string[]): void {
  const cur = useLookSequence.getState().ids;
  if (cur.length === ids.length && cur.every((id, i) => id === ids[i])) return;
  useLookSequence.setState({ ids });
}

/**
 * The look one step from `current` in `ids` (`dir` 1 = next, -1 = previous), wrapping around.
 * With no look applied (or one outside the list), next is the first and previous the last.
 */
export function neighbourLook(ids: string[], current: string | null | undefined, dir: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(i + dir + ids.length) % ids.length];
}

/** Applies a library look as a tap on its tile does (adapted to the photo, with a tick). */
export function applyLibraryLook(p: Preset, amount = 100): void {
  tick(12);
  useEditor.getState().applyPreset(p, amount, adaptationForLook(p.adjustments));
}

/** Steps to the next or previous look, keeping the current amount. Returns false when there is none. */
export function stepLook(dir: 1 | -1): boolean {
  const { edit } = useEditor.getState();
  const id = neighbourLook(useLookSequence.getState().ids, edit.appliedPreset?.id, dir);
  if (!id || id === edit.appliedPreset?.id) return false;
  const preset = usePresets.getState().all().find((p) => p.id === id);
  if (!preset) return false;
  applyLibraryLook(preset, edit.appliedPreset?.amount ?? 100);
  return true;
}

/**
 * Whether a one-finger gesture was a swipe between looks: mostly sideways and long enough.
 * Returns 1 (next, swiped left), -1 (previous, swiped right) or 0.
 *
 * At fit size a sideways drag has no other meaning on the photo, and a press that turned into
 * hold-to-compare is excluded by the caller, so the time cap only drops a finger that rested and
 * drifted. (Real swipes take ~150–300 ms; slow devices report more.)
 */
export const SWIPE = { minDx: 48, ratio: 1.6, maxMs: 2500 };
export function swipeDirection(dx: number, dy: number, ms: number): 1 | -1 | 0 {
  if (ms > SWIPE.maxMs || Math.abs(dx) < SWIPE.minDx || Math.abs(dx) < SWIPE.ratio * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
