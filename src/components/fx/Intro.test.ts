import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/haptics', () => ({ motionReduced: () => false }));
const { introMode, INTRO_TIMING } = await import('./Intro');

describe('opening animation', () => {
  const base = { search: '', seen: false, reduced: false, automated: false };

  it('plays in full on the first open and short afterwards', () => {
    expect(introMode(base)).toBe('full');
    expect(introMode({ ...base, seen: true })).toBe('short');
  });

  it('does not play with reduced motion or under automation', () => {
    expect(introMode({ ...base, reduced: true })).toBeNull();
    expect(introMode({ ...base, automated: true })).toBeNull();
  });

  it('can be asked for by URL (tests), and ignores other values', () => {
    expect(introMode({ ...base, automated: true, search: '?intro=full' })).toBe('full');
    expect(introMode({ ...base, reduced: true, search: '?intro=short' })).toBe('short');
    expect(introMode({ ...base, automated: true, search: '?intro=yes' })).toBeNull();
  });

  it('stays brief: about two seconds the first time, about one after', () => {
    expect(INTRO_TIMING.full.leave + INTRO_TIMING.full.out).toBeLessThanOrEqual(2200);
    expect(INTRO_TIMING.short.leave + INTRO_TIMING.short.out).toBeLessThanOrEqual(1000);
  });
});
