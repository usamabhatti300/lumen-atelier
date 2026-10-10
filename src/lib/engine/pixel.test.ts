import { describe, expect, it } from 'vitest';
import { defaultAdjustments, defaultEditState, defaultLensBlur, mergeAdjustments, type EditState, type LensBlur, type PartialAdjustments } from '../schema/adjustments';
import { deriveDevelopParams, deriveLensParams, lensBlurPlan, lensTilePadding } from './params';
import { developPixel, toneShape, applyContrast, bandInterp, bokehCompress, bokehExpand, cocSimilarity, lensBlendWeights, lensCoc, lensGatherWeight, type RGB } from './pixel';
import { cpuRender, lensBlurLinear, type DepthRaster } from './cpu/cpuRender';
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

describe('lens blur', { timeout: 60_000 }, () => {
  const lensEdit = (lens: Partial<LensBlur> = {}): EditState => ({ ...defaultEditState(), lensBlur: { ...defaultLensBlur(), ...lens } });
  const L = (lens: Partial<LensBlur> = {}) => deriveLensParams({ ...defaultLensBlur(), ...lens });

  /** Linear RGB test image: fine checkerboard texture (so blur is measurable). */
  function texture(W: number, H: number, fn?: (x: number, y: number) => number): Float32Array {
    const out = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = fn ? fn(x, y) : (x + y) % 2 ? 0.6 : 0.1;
        out.set([v, v * 0.9, v * 0.8], (y * W + x) * 3);
      }
    return out;
  }
  /** Depth raster: left half near (255), right half far (0). */
  function splitDepth(W: number, H: number): DepthRaster {
    const data = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = x < W / 2 ? 255 : 0;
    return { width: W, height: H, data };
  }
  const variance = (img: Float32Array, W: number, x0: number, x1: number, y0: number, y1: number) => {
    let s = 0;
    let s2 = 0;
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const v = img[(y * W + x) * 3];
        s += v;
        s2 += v * v;
        n++;
      }
    return s2 / n - (s / n) ** 2;
  };
  const full = { x: 0, y: 0, w: 1, h: 1 };

  it('is off by default and an exact identity at amount 0', () => {
    expect(deriveLensParams(undefined).active).toBe(false);
    expect(deriveLensParams(defaultLensBlur()).active).toBe(false);
    const W = 24;
    const H = 16;
    const src = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < src.length; i++) src[i] = (i * 37) % 256;
    const source = { width: W, height: H, data: src };
    const depth = splitDepth(W, H);
    const args = { source, fullSize: { width: W, height: H }, out: { width: W, height: H }, depth };
    const plain = cpuRender({ ...args, edit: defaultEditState() });
    const zero = cpuRender({ ...args, edit: lensEdit({ amount: 0, focus: 70, falloff: 10 }) });
    expect(Array.from(zero.data)).toEqual(Array.from(plain.data));
    // With no depth map available, a non-zero amount changes nothing either.
    const noDepth = cpuRender({ ...args, depth: null, edit: lensEdit({ amount: 80 }) });
    expect(Array.from(noDepth.data)).toEqual(Array.from(plain.data));
    // ...while with a depth map it does.
    const on = cpuRender({ ...args, edit: lensEdit({ amount: 80 }) });
    expect(Array.from(on.data)).not.toEqual(Array.from(plain.data));
  });

  it('maps depth to a signed blur size with an in-focus band', () => {
    const P = L({ focus: 50, falloff: 50 });
    expect(lensCoc(0.5, P)).toBe(0);
    expect(lensCoc(0.5 + P.band * 0.9, P)).toBe(0);
    expect(lensCoc(0.2, P)).toBeGreaterThan(0); // farther than the focal plane
    expect(lensCoc(0.8, P)).toBeLessThan(0); // nearer
    let prev = 0;
    for (let n = 0.5; n >= 0; n -= 0.02) {
      const c = lensCoc(n, P);
      expect(c).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(c).toBeLessThanOrEqual(1);
      prev = c;
    }
    // Lower falloff = faster transition to full blur.
    expect(lensCoc(0.35, L({ focus: 50, falloff: 0 }))).toBeGreaterThan(lensCoc(0.35, L({ focus: 50, falloff: 100 })));
  });

  it('expands highlights invertibly and leaves darker tones alone', () => {
    for (const boost of [0, 6, 12, 24]) {
      for (const c of [[0.1, 0.2, 0.3], [0.9, 0.8, 0.7], [1, 1, 1], [1, 0.6, 0.2]] as RGB[]) {
        const back = bokehCompress(bokehExpand(c, boost), boost);
        for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(c[i], 9);
      }
    }
    expect(bokehExpand([0.2, 0.2, 0.2], 12)).toEqual([0.2, 0.2, 0.2]);
    expect(bokehExpand([1, 1, 1], 12)[0]).toBeGreaterThan(3);
    const warm = bokehExpand([1, 0.6, 0.2], 12);
    expect(warm[1] / warm[0]).toBeCloseTo(0.6, 9); // hue preserved
  });

  it('plans a power-of-two working scale with a bounded gather radius', () => {
    for (const r of [0.6, 3, 8, 9, 40, 82, 300, 655]) {
      const p = lensBlurPlan(r);
      expect(Math.log2(p.factor) % 1).toBe(0);
      expect(p.radius * p.factor).toBeCloseTo(r, 9);
      if (p.factor < 32) expect(p.radius).toBeLessThanOrEqual(8);
      expect(p.samples).toBeGreaterThanOrEqual(16);
      expect(p.samples).toBeLessThanOrEqual(128);
    }
    expect(lensBlurPlan(4).factor).toBe(1);
  });

  it('never lets a blurred background spill over a sharp centre', () => {
    expect(lensGatherWeight(6, 0, 3)[0]).toBe(0); // background sample, in-focus centre
    expect(lensGatherWeight(6, 6, 3)[0]).toBe(1); // same depth: full coverage
    expect(lensGatherWeight(6, 6, 7)[0]).toBe(0); // beyond the sample's disc
    const [w, fg] = lensGatherWeight(-6, 0, 3); // blurred foreground over a sharp centre
    expect(w).toBe(1);
    expect(fg).toBe(1);
    expect(cocSimilarity(4, 4)).toBe(1);
    expect(cocSimilarity(0, 6)).toBe(0);
  });

  it('keeps the focused half exactly sharp and blurs the other half', () => {
    const W = 64;
    const H = 32;
    const img = texture(W, H);
    const depth = splitDepth(W, H);
    const out = lensBlurLinear(img, W, H, depth, full, L({ amount: 60, focus: 0 }), 6);
    // Near half (in focus), right up to the depth edge: untouched.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W / 2; x++) for (let c = 0; c < 3; c++) expect(out[(y * W + x) * 3 + c]).toBe(img[(y * W + x) * 3 + c]);
    // Far half: texture strongly smoothed.
    expect(variance(out, W, W / 2 + 8, W, 4, H - 4)).toBeLessThan(variance(img, W, W / 2 + 8, W, 4, H - 4) * 0.1);
    // Focusing far instead blurs the near half and keeps the far half.
    const out2 = lensBlurLinear(img, W, H, depth, full, L({ amount: 60, focus: 100 }), 6);
    expect(variance(out2, W, 4, W / 2 - 8, 4, H - 4)).toBeLessThan(variance(img, W, 4, W / 2 - 8, 4, H - 4) * 0.1);
    for (let x = W / 2 + 8; x < W; x++) expect(out2[(10 * W + x) * 3]).toBe(img[(10 * W + x) * 3]);
  });

  it('does not leak a sharp bright subject into the blurred background (no halo)', () => {
    const W = 96;
    const H = 32;
    const img = texture(W, H, (x) => (x < W / 2 ? 1 : 0.02));
    const out = lensBlurLinear(img, W, H, splitDepth(W, H), full, L({ amount: 100, focus: 0, highlights: 100 }), 20);
    for (const x of [W / 2 + 1, W / 2 + 3, W / 2 + 8]) expect(out[(16 * W + x) * 3]).toBeLessThan(0.03);
  });

  it('renders a point light as a bright, flat disc (not a Gaussian smudge)', () => {
    const W = 81;
    const H = 81;
    const c = 40;
    const img = texture(W, H, (x, y) => (x === c && y === c ? 1 : 0.02));
    const depth: DepthRaster = { width: W, height: H, data: new Uint8Array(W * H) }; // everything far
    const R = 7;
    const lum = (o: Float32Array, x: number, y: number) => o[(y * W + x) * 3];
    const boosted = lensBlurLinear(img, W, H, depth, full, L({ amount: 100, focus: 0, falloff: 0, highlights: 100 }), R);
    const plain = lensBlurLinear(img, W, H, depth, full, L({ amount: 100, focus: 0, falloff: 0, highlights: 0 }), R);
    const inner = lum(boosted, c + 1, c);
    const mid = lum(boosted, c + 4, c);
    expect(mid).toBeGreaterThan(0.02 + (inner - 0.02) * 0.5); // flat top: the disc keeps its level towards the rim
    expect(lum(boosted, c + 10, c)).toBeCloseTo(0.02, 3); // nothing outside the disc
    expect(lum(boosted, c + 2, c)).toBeGreaterThan(lum(plain, c + 2, c) * 1.5); // highlights keep their energy
  });

  it('gives the same result in export tiles as on the whole image', () => {
    const W = 240;
    const H = 40;
    const img = texture(W, H, (x, y) => 0.1 + 0.8 * (((x * 7 + y * 13) % 17) / 17));
    const data = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = Math.round((x / (W - 1)) * 255);
    const depth: DepthRaster = { width: W, height: H, data };
    const P = L({ amount: 80, focus: 30 });
    for (const rmax of [9, 40]) {
      // 40 px uses a coarse (8x) and a fine (2x) level.
      const whole = lensBlurLinear(img, W, H, depth, full, P, rmax);
      const { factor } = lensBlurPlan(rmax);
      const pad = lensTilePadding(rmax);
      const tx0 = 120;
      const sx0 = Math.floor((tx0 - pad) / factor) * factor;
      const sw = W - sx0;
      const crop = new Float32Array(sw * H * 3);
      for (let y = 0; y < H; y++) crop.set(img.subarray((y * W + sx0) * 3, (y * W + W) * 3), y * sw * 3);
      const tile = lensBlurLinear(crop, sw, H, depth, { x: sx0 / W, y: 0, w: sw / W, h: 1 }, P, rmax);
      let maxDiff = 0;
      for (let y = 0; y < H; y++)
        for (let x = tx0; x < W; x++)
          for (let k = 0; k < 3; k++) maxDiff = Math.max(maxDiff, Math.abs(tile[(y * sw + x - sx0) * 3 + k] - whole[(y * W + x) * 3 + k]));
      expect(maxDiff, `rmax ${rmax}`).toBeLessThan(1e-5);
    }
  });

  it('grows blur progressively through a fine level when the coarse level is heavily downscaled', () => {
    const plan = lensBlurPlan(40);
    expect(plan.factor).toBe(8);
    expect(plan.fine).toMatchObject({ factor: 2 });
    let prevT = 0;
    let prevU = 0;
    for (let c = 0; c <= 40; c += 0.5) {
      const [t, u] = lensBlendWeights(c, plan);
      expect(t).toBeGreaterThanOrEqual(prevT);
      expect(u).toBeGreaterThanOrEqual(prevU);
      prevT = t;
      prevU = u;
    }
    expect(lensBlendWeights(0.4, plan)).toEqual([0, 0]); // in focus: sharp
    expect(lensBlendWeights(3, plan)[0]).toBe(1); // already fully blurred (fine level)...
    expect(lensBlendWeights(3, plan)[1]).toBe(0); // ...without the coarse level yet
    expect(lensBlendWeights(20, plan)).toEqual([1, 1]);
    expect(lensBlurPlan(12).fine).toBeNull();
  });
});
