import { describe, expect, it } from 'vitest';
import { srgbToLinear } from '../color/srgb';
import { describeTraits, photoTraits, recommendLooks, type Suited } from './recommend';

/** `n` linear pixels of one display colour (0..1 sRGB), brightness spread by ±`spread`. */
function flatField(rgb: [number, number, number], spread = 0.3, n = 600): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = 1 + spread * ((i / (n - 1)) * 2 - 1);
    for (const c of rgb) out.push(srgbToLinear(Math.min(1, Math.max(0, c * k))));
  }
  return Float32Array.from(out);
}
const join = (...parts: Float32Array[]) => Float32Array.from(parts.flatMap((p) => Array.from(p)));

describe('photo traits', () => {
  it('reads brightness', () => {
    expect(photoTraits(flatField([0.12, 0.12, 0.12]))).toContain('dark');
    expect(photoTraits(flatField([0.75, 0.75, 0.75]))).toContain('bright');
    const mid = photoTraits(flatField([0.45, 0.45, 0.45]));
    expect(mid).not.toContain('dark');
    expect(mid).not.toContain('bright');
  });

  it('reads a sunlit scene with deep shade as hard light, not as a dark photo', () => {
    const street = join(flatField([0.1, 0.1, 0.11], 0.3, 700), flatField([0.9, 0.86, 0.7], 0.08, 300));
    const traits = photoTraits(street);
    expect(traits).not.toContain('dark');
    expect(traits).toContain('contrasty');
  });

  it('reads flat and hard light', () => {
    expect(photoTraits(flatField([0.5, 0.5, 0.5], 0.1))).toContain('flat');
    expect(photoTraits(join(flatField([0.04, 0.04, 0.04], 0.2), flatField([0.95, 0.95, 0.95], 0.03)))).toContain('contrasty');
  });

  it('reads a warm and a cool cast, and muted against vivid colour', () => {
    expect(photoTraits(flatField([0.56, 0.5, 0.4]))).toContain('warm');
    expect(photoTraits(flatField([0.42, 0.5, 0.6]))).toContain('cool');
    expect(photoTraits(flatField([0.5, 0.5, 0.5]))).toContain('muted');
    expect(photoTraits(flatField([0.9, 0.2, 0.15]))).toContain('vivid');
  });

  it('finds greens and blues when they fill enough of the photo', () => {
    const forest = join(flatField([0.2, 0.55, 0.2]), flatField([0.5, 0.5, 0.5]));
    expect(photoTraits(forest)).toContain('greens');
    const sky = join(flatField([0.25, 0.45, 0.85]), flatField([0.5, 0.5, 0.5]));
    expect(photoTraits(sky)).toContain('blues');
    expect(photoTraits(flatField([0.5, 0.5, 0.5]))).not.toContain('greens');
  });

  it('adds a face when one was detected, and survives an empty sample', () => {
    expect(photoTraits(flatField([0.5, 0.5, 0.5]), true)).toContain('face');
    expect(photoTraits(new Float32Array(0))).toEqual([]);
    expect(describeTraits(['dark', 'warm', 'face'])).toBe('dark · warm · a face');
  });
});

describe('look recommendations', () => {
  const looks: Suited[] = [
    { id: 'all-round', category: 'a', suits: ['any'] },
    { id: 'night-1', category: 'night', suits: ['dark', 'cool'] },
    { id: 'night-2', category: 'night', suits: ['dark', 'warm'] },
    { id: 'night-3', category: 'night', suits: ['dark'] },
    { id: 'portrait', category: 'b', suits: ['face', 'bright'] },
    { id: 'forest', category: 'c', suits: ['greens'] },
    { id: 'untagged', category: 'c' },
  ];

  it('puts the best matches first and keeps library order on ties', () => {
    expect(recommendLooks(['dark', 'cool'], looks, 3)).toEqual(['night-1', 'all-round', 'night-2']);
  });

  it('weighs a detected face above an all-rounder, and an all-rounder above a single scene trait', () => {
    expect(recommendLooks(['greens', 'face'], looks, 3)).toEqual(['portrait', 'all-round', 'forest']);
  });

  it('never fills more than two places from one roll, and skips looks with no match', () => {
    const picks = recommendLooks(['dark'], looks, 6);
    expect(picks.filter((id) => id.startsWith('night'))).toHaveLength(2);
    expect(picks).not.toContain('untagged');
    expect(picks).not.toContain('forest');
  });

  it('still offers the all-round looks when nothing was measured', () => {
    expect(recommendLooks([], looks)).toEqual(['all-round']);
  });
});
