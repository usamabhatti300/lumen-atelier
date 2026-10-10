import { describe, expect, it } from 'vitest';
import { defaultAdjustments, mergeAdjustments, type PartialAdjustments } from '../schema/adjustments';
import { deriveDevelopParams } from './params';
import { developPixel, toneShape, applyContrast, bandInterp } from './pixel';
import { linearToSrgb, srgbToLinear } from '../color/srgb';
import { linearSrgbToOklab, oklabToLinearSrgb, oklabToOklch } from '../color/oklab';
import { whiteBalanceMultipliers } from '../color/whiteBalance';

const params = (p: PartialAdjustments = {}) => deriveDevelopParams(mergeAdjustments(defaultAdjustments(), p));
const chroma = (rgb: number[]) => {
  const [L, a, b] = linearSrgbToOklab(srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2]));
  return oklabToOklch(L, a, b)[1];
};
const lumaOf = (rgb: number[]) =>
  0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);

const SAMPLES: [number, number, number][] = [
  [0, 0, 0],
  [1, 1, 1],
  [0.5, 0.5, 0.5],
  [0.9, 0.2, 0.1],
  [0.2, 0.7, 0.3],
  [0.1, 0.3, 0.85],
  [0.85, 0.65, 0.5],
  [0.05, 0.04, 0.03],
];

describe('colour transfer functions', () => {
  it('sRGB encode/decode round-trips', () => {
    for (let v = 0; v <= 1; v += 0.05) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
  });
  it('OKLab round-trips linear sRGB', () => {
    for (const [r, g, b] of SAMPLES) {
      const lab = linearSrgbToOklab(r, g, b);
      const back = oklabToLinearSrgb(...lab);
      expect(back[0]).toBeCloseTo(r, 4);
      expect(back[1]).toBeCloseTo(g, 4);
      expect(back[2]).toBeCloseTo(b, 4);
    }
  });
  it('white balance keeps neutral luminance', () => {
    for (const [t, g] of [[50, 0], [-80, 30], [100, -100]]) {
      const [r, gg, b] = whiteBalanceMultipliers(t, g);
      expect(0.2126 * r + 0.7152 * gg + 0.0722 * b).toBeCloseTo(1, 6);
    }
  });
});

describe('develop pipeline', () => {
  it('is an identity at default settings', () => {
    const P = params();
    for (const s of SAMPLES) {
      const out = developPixel(s, P);
      for (let i = 0; i < 3; i++) expect(Math.abs(out[i] - s[i])).toBeLessThan(1 / 255);
    }
  });

  it('exposure +1 EV doubles linear luminance of a mid grey', () => {
    const grey = linearToSrgb(0.18);
    const out = developPixel([grey, grey, grey], params({ basic: { exposure: 1 } }));
    expect(srgbToLinear(out[1])).toBeCloseTo(0.36, 2);
  });

  it('exposure -1 EV halves linear luminance', () => {
    const grey = linearToSrgb(0.4);
    const out = developPixel([grey, grey, grey], params({ basic: { exposure: -1 } }));
    expect(srgbToLinear(out[0])).toBeCloseTo(0.2, 2);
  });

  it('warming temperature increases red relative to blue on grey', () => {
    const out = developPixel([0.5, 0.5, 0.5], params({ basic: { temperature: 60 } }));
    expect(out[0]).toBeGreaterThan(out[2] + 0.05);
  });

  it('saturation -100 produces neutral greys', () => {
    const P = params({ basic: { saturation: -100 } });
    for (const s of SAMPLES) expect(chroma(developPixel(s, P))).toBeLessThan(0.004);
  });

  it('monochrome 100 removes chroma', () => {
    expect(chroma(developPixel([0.9, 0.2, 0.1], params({ basic: { monochrome: 100 } })))).toBeLessThan(0.004);
  });

  it('positive contrast spreads tones around the pivot', () => {
    const P = params({ basic: { contrast: 60 } });
    const dark = developPixel([0.2, 0.2, 0.2], P)[0];
    const light = developPixel([0.8, 0.8, 0.8], P)[0];
    expect(dark).toBeLessThan(0.2);
    expect(light).toBeGreaterThan(0.8);
  });

  it('contrast curve is monotonic and fixes the end points', () => {
    for (const c of [-1, -0.5, 0.5, 1]) {
      expect(applyContrast(0, c)).toBeCloseTo(0, 6);
      expect(applyContrast(1, c)).toBeCloseTo(1, 6);
      let prev = -1;
      for (let p = 0; p <= 1.0001; p += 0.01) {
        const q = applyContrast(p, c);
        expect(q).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = q;
      }
    }
  });

  it('shadows lift dark tones more than highlights', () => {
    const tone = { blacks: 0, whites: 0, shadows: 1, highlights: 0, contrast: 0, brightness: 0 };
    expect(toneShape(0.2, tone) - 0.2).toBeGreaterThan(toneShape(0.85, tone) - 0.85);
  });

  it('positive blacks lift the black point (matte)', () => {
    const out = developPixel([0, 0, 0], params({ basic: { blacks: 100 } }));
    expect(out[0]).toBeGreaterThan(0.05);
  });

  it('HSL green saturation -100 desaturates greens but not reds', () => {
    const P = params({ hsl: { green: { saturation: -100 } } });
    expect(chroma(developPixel([0.2, 0.7, 0.3], P))).toBeLessThan(0.03);
    expect(chroma(developPixel([0.9, 0.2, 0.1], P))).toBeGreaterThan(0.15);
  });

  it('HSL band interpolation hits band values at centres', () => {
    const hues = [25, 55, 100, 140, 195, 255, 300, 345];
    const vals = [1, 2, 3, 4, 5, 6, 7, 8];
    hues.forEach((h, i) => expect(bandInterp(hues, vals, h)).toBeCloseTo(vals[i], 6));
    // Wraps between magenta (345) and red (25).
    const mid = bandInterp(hues, vals, 5);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(8);
  });

  it('shadow grading tints shadows more than highlights', () => {
    const P = params({ grading: { shadows: { hue: 200, saturation: 60, luminance: 0 } } });
    expect(chroma(developPixel([0.08, 0.08, 0.08], P))).toBeGreaterThan(chroma(developPixel([0.9, 0.9, 0.9], P)) + 0.01);
  });

  it('master curve maps values through the curve', () => {
    const P = params({ curves: { master: [[0, 0.2], [1, 1]] } });
    expect(developPixel([0, 0, 0], P)[0]).toBeCloseTo(0.2, 2);
  });

  it('levels remap input black/white', () => {
    const P = params({ levels: { inBlack: 50, inWhite: 200 } });
    const out = developPixel([200 / 255, 200 / 255, 200 / 255], P);
    expect(out[0]).toBeCloseTo(1, 2);
  });

  it('channel mixer swaps channels', () => {
    const P = params({ mixer: { red: { r: 0, g: 0, b: 100 }, blue: { r: 100, g: 0, b: 0 } } });
    const out = developPixel([0.9, 0.1, 0.1], P);
    expect(out[2]).toBeGreaterThan(out[0]);
  });

  it('never produces out-of-range or NaN values at extreme settings', () => {
    const P = params({
      basic: { exposure: 5, contrast: 100, highlights: -100, shadows: 100, whites: 100, blacks: -100, saturation: 100, vibrance: 100, temperature: 100, tint: -100 },
      grading: { shadows: { hue: 10, saturation: 100, luminance: 100 }, highlights: { hue: 200, saturation: 100, luminance: -100 } },
      hsl: { red: { hue: 100, saturation: 100, luminance: 100 } },
    });
    for (const s of SAMPLES) {
      for (const v of developPixel(s, P)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('lowering exposure keeps relative luminance order', () => {
    const P = params({ basic: { exposure: -0.7 } });
    expect(lumaOf(developPixel([0.3, 0.3, 0.3], P))).toBeLessThan(lumaOf(developPixel([0.6, 0.6, 0.6], P)));
  });
});
