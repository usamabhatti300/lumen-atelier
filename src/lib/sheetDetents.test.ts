import { describe, expect, it } from 'vitest';
import { dragHeight, pickDetent } from './sheetDetents';

const stops = [
  { key: 'closed', height: 0 },
  { key: 'compact', height: 220 },
  { key: 'tall', height: 540 },
] as const;
const pick = (h: number, v = 0) => pickDetent(h, v, [...stops]);

describe('sheet detents', () => {
  it('settles on the nearest stop when released slowly', () => {
    expect(pick(250)).toBe('compact');
    expect(pick(420)).toBe('tall');
    expect(pick(90)).toBe('closed');
    expect(pick(380)).toBe('compact'); // just under halfway (380) between 220 and 540
  });

  it('sends a flick to the next stop in its direction, however short the swipe', () => {
    expect(pick(260, -1.5)).toBe('tall');
    expect(pick(200, 1.2)).toBe('closed');
    // From a tall compact sheet (a short flick that projects nowhere near zero) it still closes.
    expect(pickDetent(341, 0.73, [{ key: 'closed', height: 0 }, { key: 'compact', height: 401 }, { key: 'tall', height: 540 }])).toBe('closed');
    // A flick down from tall lands on compact, not closed; a flick past the ends stays at the end.
    expect(pick(500, 1.5)).toBe('compact');
    expect(pick(560, -2)).toBe('tall');
  });

  it('carries a slow release a little along its motion', () => {
    expect(pick(360, 0.3)).toBe('compact'); // 360 - 48 = 312 → compact
    expect(pick(370, -0.3)).toBe('tall'); // 370 + 48 = 418, past halfway (380) → tall
  });

  it('follows the finger, with resistance past the tallest stop', () => {
    expect(dragHeight(220, -100, 540)).toBe(320);
    expect(dragHeight(220, 300, 540)).toBe(0);
    expect(dragHeight(500, -140, 540)).toBe(565); // 40 px over the top shows as 10
  });
});
