/**
 * Sheet detents for the phone's docked panel (roadmap 1.7): while you drag the handle the sheet
 * follows your finger. On release, a flick goes to the next stop in its direction (as iOS and Android
 * sheets do, however short the swipe); a slow release settles on the nearest stop.
 */
export interface Detent<K extends string = string> {
  key: K;
  /** Height in px. */
  height: number;
}

/** Release speed (px/ms) from which a release counts as a flick. */
export const FLICK_SPEED = 0.5;
/** How far a slower release still carries (ms of travel at release speed). */
export const FLICK_MS = 160;

/**
 * @param height    the sheet's height when released (px)
 * @param velocity  finger speed at release in px/ms, positive = moving down (the sheet shrinks)
 */
export function pickDetent<K extends string>(height: number, velocity: number, detents: Detent<K>[]): K {
  if (Math.abs(velocity) >= FLICK_SPEED) {
    const sorted = [...detents].sort((a, b) => a.height - b.height);
    // Down (positive) shrinks the sheet: the tallest stop below; up: the shortest stop above.
    const next = velocity > 0 ? [...sorted].reverse().find((d) => d.height < height - 1) : sorted.find((d) => d.height > height + 1);
    return (next ?? (velocity > 0 ? sorted[0] : sorted[sorted.length - 1])).key;
  }
  const projected = height - velocity * FLICK_MS;
  let best = detents[0];
  for (const d of detents) if (Math.abs(d.height - projected) < Math.abs(best.height - projected)) best = d;
  return best.key;
}

/** Height while dragging: follows the finger, with resistance past the tallest stop. */
export function dragHeight(start: number, dy: number, max: number): number {
  const h = start - dy;
  if (h <= max) return Math.max(0, h);
  return max + (h - max) * 0.25;
}
