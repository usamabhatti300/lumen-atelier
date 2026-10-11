/**
 * On-screen stand-in for Shift / Alt on touch screens (see TouchModeChip). The
 * canvas overlays read modifiers through `touchMods`, so keyboards work as before.
 */
import { create } from 'zustand';

export type TouchMode = 'none' | 'add' | 'subtract';

export const useTouchMode = create<{ mode: TouchMode }>(() => ({ mode: 'none' }));

/** Keyboard modifiers merged with the on-screen touch mode. */
export function touchMods(e: { shiftKey: boolean; altKey: boolean }) {
  const { mode } = useTouchMode.getState();
  return { shiftKey: e.shiftKey || mode === 'add', altKey: e.altKey || mode === 'subtract' };
}
