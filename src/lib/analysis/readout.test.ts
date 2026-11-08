import { describe, expect, it } from 'vitest';
import { computeStats } from './stats';
import { cameraReadout } from './readout';
import { linearToSrgb } from '../color/srgb';

function synth(w: number, h: number, f: (u: number, v: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x / (w - 1), y / (h - 1));
      const i = (y * w + x) * 4;
      data[i] = Math.round(linearToSrgb(Math.min(1, Math.max(0, r))) * 255);
      data[i + 1] = Math.round(linearToSrgb(Math.min(1, Math.max(0, g))) * 255);
      data[i + 2] = Math.round(linearToSrgb(Math.min(1, Math.max(0, b))) * 255);
      data[i + 3] = 255;
    }
  return { width: w, height: h, data };
}

const value = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value;

describe('cameraReadout', () => {
  it('reads a grey ramp as neutral, and a black-and-white image as black & white', () => {
    const grey = computeStats(synth(96, 64, (u) => {
      const y = Math.pow(u, 2.2);
      return [y, y, y];
    }));
    const rows = cameraReadout(grey);
    expect(rows[0].label).toBe('exposure');
    expect(value(rows, 'colour')).toBe('black & white');
    expect(rows.some((r) => r.label === 'white balance')).toBe(false);
  });

  it('reads a warm scene as warm and a cool scene as cool', () => {
    const scene = (k: number) => (u: number, v: number): [number, number, number] => {
      const y = 0.03 + Math.pow(u, 2.2) * 0.85;
      // Coloured patches keep the image from being monochrome; the ramp carries the cast.
      if (v > 0.85) return u < 0.5 ? [0.3, 0.06, 0.05] : [0.05, 0.25, 0.08];
      return [y * (1 + k), y, y * (1 - k)];
    };
    expect(value(cameraReadout(computeStats(synth(96, 64, scene(0.18)))), 'white balance')).toMatch(/^warm/);
    expect(value(cameraReadout(computeStats(synth(96, 64, scene(-0.18)))), 'white balance')).toMatch(/^cool/);
  });

  it('notes lifted blacks', () => {
    const faded = computeStats(synth(96, 64, (u) => {
      const y = 0.06 + Math.pow(u, 2.2) * 0.8;
      return [y, y, y];
    }));
    expect(value(cameraReadout(faded), 'contrast')).toContain('lifted blacks');
  });
});
