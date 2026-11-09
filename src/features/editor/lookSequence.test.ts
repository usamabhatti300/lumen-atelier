import { describe, expect, it, vi } from 'vitest';

// Only the pure helpers are tested here; keep the store and engine imports light.
vi.mock('@/engine/lookAdapt', () => ({ adaptationForLook: () => null }));

const { neighbourLook, swipeDirection, publishLookSequence, useLookSequence } = await import('./lookSequence');

describe('swipe between looks', () => {
  const ids = ['a', 'b', 'c'];

  it('steps to the next and previous look, wrapping around', () => {
    expect(neighbourLook(ids, 'a', 1)).toBe('b');
    expect(neighbourLook(ids, 'c', 1)).toBe('a');
    expect(neighbourLook(ids, 'a', -1)).toBe('c');
    expect(neighbourLook(ids, 'b', -1)).toBe('a');
  });

  it('starts at the first (next) or last (previous) look when none from the list is applied', () => {
    expect(neighbourLook(ids, null, 1)).toBe('a');
    expect(neighbourLook(ids, 'zz', -1)).toBe('c');
    expect(neighbourLook([], 'a', 1)).toBeNull();
  });

  it('counts only mostly sideways, long enough swipes', () => {
    expect(swipeDirection(-80, 10, 200)).toBe(1); // left = next
    expect(swipeDirection(90, -20, 300)).toBe(-1); // right = previous
    expect(swipeDirection(-30, 0, 100)).toBe(0); // too short (a tap or a wobble)
    expect(swipeDirection(-80, 70, 200)).toBe(0); // diagonal: probably a scroll or a drag
    expect(swipeDirection(-120, 0, 1400)).toBe(1); // a slow device still counts
    expect(swipeDirection(-120, 0, 3000)).toBe(0); // a finger that rested and drifted
  });

  it('publishes the browser’s list only when it changes', () => {
    publishLookSequence(['x', 'y']);
    const first = useLookSequence.getState();
    publishLookSequence(['x', 'y']);
    expect(useLookSequence.getState()).toBe(first);
    publishLookSequence(['y', 'x']);
    expect(useLookSequence.getState().ids).toEqual(['y', 'x']);
  });
});
