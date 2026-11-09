import { describe, expect, it } from 'vitest';
import type { ImageStats } from './stats';
import { cameraReadout } from './readout';
import { suggestLookName } from './lookName';
import { CANONICAL } from './mapping';
import { ROLLS } from '../presets/rolls';

/** A balanced, neutral, colourful-enough reference; tests change only what they need. */
function stats(over: Partial<ImageStats> & { p50?: number; spread?: number } = {}): ImageStats {
  const p50 = over.p50 ?? 0.45;
  const spread = over.spread ?? 0.75;
  const base = {
    percentiles: { p1: 0.02, p5: p50 - spread / 2, p25: p50 - 0.15, p50, p75: p50 + 0.15, p95: p50 + spread / 2, p99: 0.98 },
    blackFloor: 0.02,
    whiteCeiling: 0.97,
    cast: { a: 0, b: 0, support: 0.3 },
    chroma: { mean: CANONICAL.chromaP50, p50: CANONICAL.chromaP50, p90: CANONICAL.chromaP50 * 2 },
    palette: [{ hex: '#557744', weight: 0.4, L: 0.5, C: 0.08, h: 140 }],
    grain: 0.01,
    vignette: { ratio: 1, symmetry: 1 },
    monochrome: false,
    flags: { screenshotLikely: false, multiplePhotosLikely: false, illustrationLikely: false, lowResolution: false, nightLikely: false, underexposed: false, overexposed: false },
  };
  return { ...base, ...over } as unknown as ImageStats;
}

describe('matched look names', () => {
  it('names the look after its dominant colour and its light, roll style', () => {
    const r = suggestLookName(stats({ cast: { a: 0, b: 0.02, support: 0.3 }, blackFloor: 0.08, spread: 0.55 }));
    expect(r).toEqual({ name: 'Moss Postcard', mood: 'soft, green, faded' });
    expect(suggestLookName(stats({ cast: { a: 0, b: 0.02, support: 0.3 } })).name).toBe('Moss Hour');
    expect(suggestLookName(stats({ palette: [{ hex: '#335577', weight: 0.5, L: 0.4, C: 0.09, h: 250 }], cast: { a: 0, b: -0.02, support: 0.3 } })).name).toBe('Harbour Tide');
  });

  it('covers dark, bright, grainy, black-and-white and colourless references', () => {
    expect(suggestLookName(stats({ p50: 0.2 })).name).toBe('Moss Night');
    expect(suggestLookName(stats({ p50: 0.7 })).name).toBe('Moss Morning');
    expect(suggestLookName(stats({ grain: 0.03 })).mood).toContain('grainy');
    const bw = suggestLookName(stats({ monochrome: true }));
    expect(bw).toEqual({ name: 'Silver Diary', mood: 'even, black & white, clean' });
    const grey = suggestLookName(stats({ palette: [{ hex: '#777', weight: 1, L: 0.5, C: 0.01, h: 0 }], chroma: { mean: 0.01, p50: 0.01, p90: 0.02 } }));
    expect(grey.name).toBe('Ash Frame');
    expect(grey.mood).toContain('muted');
  });

  it('uses the dominant colour by weight and ignores greys', () => {
    const s = stats({
      palette: [
        { hex: '#888', weight: 0.6, L: 0.5, C: 0.01, h: 90 },
        { hex: '#a63', weight: 0.25, L: 0.5, C: 0.12, h: 55 },
        { hex: '#36a', weight: 0.15, L: 0.4, C: 0.12, h: 260 },
      ],
    });
    expect(suggestLookName(s).name.startsWith('Amber')).toBe(true);
  });

  it('agrees with the info readout', () => {
    const cases = [stats({ p50: 0.2 }), stats({ p50: 0.7 }), stats({ monochrome: true }), stats({ blackFloor: 0.08 })];
    for (const s of cases) {
      const { mood } = suggestLookName(s);
      const rows = Object.fromEntries(cameraReadout(s).map((r) => [r.label, r.value]));
      if (rows.exposure === 'dark, low-key') expect(mood).toMatch(/^dark/);
      if (rows.exposure === 'bright, airy') expect(mood).toMatch(/^bright/);
      if (rows.colour === 'black & white') expect(mood).toContain('black & white');
      if (rows.contrast.includes('lifted blacks')) expect(mood).toContain('faded');
    }
  });

  it('never reuses a roll name or one of your own looks’ names', () => {
    expect(suggestLookName(stats(), ['Moss Frame']).name).toBe('Moss Frame II');
    expect(suggestLookName(stats(), ['moss frame', 'Moss Frame II']).name).toBe('Moss Frame III');
    const rolls = Object.values(ROLLS).map((r) => r.name.toLowerCase());
    for (const p50 of [0.2, 0.45, 0.7]) expect(rolls).not.toContain(suggestLookName(stats({ p50 })).name.toLowerCase());
  });

  it('is deterministic', () => {
    const s = stats({ cast: { a: 0.01, b: 0.02, support: 0.3 } });
    expect(suggestLookName(s)).toEqual(suggestLookName(s));
  });
});
