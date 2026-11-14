import { describe, expect, it } from 'vitest';
import { defaultAdjustments, defaultEditState, defaultLensBlur, mergeAdjustments, type EditState, type LensBlur, type PartialAdjustments } from '../schema/adjustments';
import { STREAK, deriveDevelopParams, deriveLensParams, dragPasses, lensBlurPlan, lensTilePadding, motionPasses, streakDirection, streakReach } from './params';
import { outputToSourceMatrix } from './geometry';
import { applyDust, dragComposite, dragHighlight, dustValue, flashLin, frameRadius, fringeScale, glowStage, lensFlare, lightLeak, screenAdd, streakWeight } from './pixel';
import { EditStateSchema, PartialAdjustmentsSchema } from '../schema/adjustments';
import { developPixel, toneShape, applyContrast, bandInterp, bokehCompress, bokehExpand, cocSimilarity, lensBlendWeights, lensCoc, lensGatherWeight, type RGB } from './pixel';
import { cpuRender, lensBlurLinear, streakPass, type DepthRaster } from './cpu/cpuRender';
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

describe('photo effects (roadmap 2.5)', () => {
  const FX = (p: Partial<ReturnType<typeof params>['fx']> = {}) => ({ ...params().fx, ...p });
  const close = (a: RGB, b: RGB, eps = 1e-6) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], -Math.log10(eps)));

  it('are all off by default', () => {
    const P = params();
    expect(Object.values(P.fx).every((v) => v === 0)).toBe(true);
    expect(P.glowActive).toBe(false);
    expect(params({ effects: { bloom: 30 } }).glowActive).toBe(true);
    expect(params({ effects: { flare: 30 } }).glowActive).toBe(false); // positional effects need no glow pass
  });

  it('change nothing at 0', () => {
    for (const c of SAMPLES) {
      close(glowStage(c, [1, 1, 1], [1, 1, 1], FX()), c);
      close(flashLin(c, 0.2, 0), c);
      close(applyDust(c, 0), c);
    }
    expect(lightLeak(0.9, 0.3, 1.5, 0)).toEqual([0, 0, 0]);
    expect(lensFlare(0.8, 0.2, 1.5, 0)).toEqual([0, 0, 0]);
    expect(fringeScale(0)).toBe(0);
    for (let i = 0; i < 200; i++) expect(dustValue(i * 13.7, i * 7.3, 3000, 1, 0)).toBe(0);
    close(screenAdd([0.3, 0.5, 0.7], [0, 0, 0]), [0.3, 0.5, 0.7]);
  });

  it('leave a whole render unchanged at their defaults (cpu renderer)', () => {
    const W = 20;
    const H = 14;
    const src = new Uint8ClampedArray(W * H * 4);
    // Noisy mid-tones with a bright block, so the glows have highlights to work on.
    for (let i = 0; i < src.length; i++) src[i] = i % 4 === 3 || ((i >> 2) % W) < 6 ? 255 : (i * 53) % 256;
    const args = { source: { width: W, height: H, data: src }, fullSize: { width: W, height: H }, out: { width: W, height: H } };
    const plain = cpuRender({ ...args, edit: defaultEditState() });
    const zeroed = defaultEditState();
    zeroed.adjustments = mergeAdjustments(defaultAdjustments(), { effects: { lightLeak: 0, bloom: 0, dust: 0, fringe: 0 } });
    expect(Array.from(cpuRender({ ...args, edit: zeroed }).data)).toEqual(Array.from(plain.data));
    for (const k of ['lightLeak', 'halation', 'bloom', 'flare', 'dust', 'fringe', 'dreamy', 'flash'] as const) {
      const e = defaultEditState();
      e.adjustments = mergeAdjustments(defaultAdjustments(), { effects: { [k]: 100 } });
      // Every effect changes the render (dust needs a bigger frame to land a speck: tested below).
      if (k !== 'dust') expect(Array.from(cpuRender({ ...args, edit: e }).data), k).not.toEqual(Array.from(plain.data));
    }
  });

  it('bloom and dreamy glow from highlights; halation adds a red rim', () => {
    const dark: RGB = [0.2, 0.2, 0.2];
    const bright: RGB = [0.95, 0.95, 0.95];
    const bloom = glowStage(dark, dark, bright, FX({ bloom: 1 }));
    expect(bloom[0]).toBeGreaterThan(0.3);
    // No highlights nearby: bloom leaves a dark area alone.
    close(glowStage(dark, dark, dark, FX({ bloom: 1 })), dark, 1e-3);
    const halo = glowStage(dark, [0.7, 0.7, 0.7], dark, FX({ halation: 1 }));
    expect(halo[0] - dark[0]).toBeGreaterThan(0.2);
    expect(halo[0] - dark[0]).toBeGreaterThan(3 * (halo[2] - dark[2])); // red, not white
    // Inside a flat bright area there is no rim.
    close(glowStage(bright, bright, bright, FX({ halation: 1 })), bright, 1e-6);
    const dreamy = glowStage([0.1, 0.1, 0.1], [0.1, 0.1, 0.1], [0.6, 0.6, 0.6], FX({ dreamy: 1 }));
    expect(dreamy[0]).toBeGreaterThan(0.4); // softened and lifted towards the glow
  });

  it('flash brightens the centre and darkens the edges', () => {
    const grey: RGB = [0.18, 0.18, 0.18];
    expect(frameRadius(0.5, 0.5, 1.5)).toBe(0);
    expect(frameRadius(1, 1, 1.5)).toBeCloseTo(1);
    const centre = flashLin(grey, 0, 1);
    const edge = flashLin(grey, 1, 1);
    expect(centre[1]).toBeGreaterThan(grey[1] * 1.3);
    expect(edge[1]).toBeLessThan(grey[1] * 0.8);
    expect(centre[2]).toBeGreaterThan(centre[0]); // a little cool
  });

  it('light leak is warm and comes from the right edge', () => {
    const right = lightLeak(0.98, 0.3, 1.5, 1);
    expect(right[0]).toBeGreaterThan(0.5);
    expect(right[0]).toBeGreaterThan(right[1]);
    expect(right[1]).toBeGreaterThan(right[2]);
    expect(lightLeak(0.05, 0.8, 1.5, 1)[0]).toBeLessThan(0.02);
  });

  it('lens flare is brightest at the sun, with ghosts across the centre', () => {
    expect(lensFlare(0.8, 0.2, 1.5, 1)[0]).toBeGreaterThan(1);
    expect(lensFlare(0.05, 0.95, 1.5, 1)[0]).toBeLessThan(0.01);
    // The second ghost sits past the centre on the line from the sun: 0.8 + (0.5 - 0.8) * 1.75 = 0.275.
    const g = lensFlare(0.275, 0.2 + 0.3 * 1.75, 1, 1);
    expect(g[2]).toBeGreaterThan(0.1);
  });

  it('dust lands the same specks in the preview and the export, fading when smaller than a preview pixel', () => {
    // A 1500 x 1000 frame, sampled every 2 px (specks are 1.6-3.3 px across at this size).
    const long = 1500;
    let full = 0;
    let low = 0;
    let peakFull = 0;
    let peakSmall = 0;
    let maxAbs = 0;
    for (let y = 0; y < 1000; y += 2)
      for (let x = 0; x < 1500; x += 2) {
        const v = dustValue(x, y, long, 1, 1);
        maxAbs = Math.max(maxAbs, Math.abs(v));
        if (v !== 0) full++;
        if (dustValue(x, y, long, 1, 0.2) !== 0) low++;
        peakFull = Math.max(peakFull, v);
        // A preview at a fifth of the size sees the same features, fainter.
        peakSmall = Math.max(peakSmall, dustValue(x, y, long, 0.2, 1));
      }
    expect(maxAbs).toBeLessThanOrEqual(1);
    expect(full).toBeGreaterThan(50);
    expect(low).toBeLessThan(full); // fewer specks at a low amount
    expect(peakSmall).toBeGreaterThan(0);
    expect(peakSmall).toBeLessThan(peakFull);
    expect(applyDust([0.2, 0.2, 0.2], 1)[0]).toBeCloseTo(0.95);
    expect(applyDust([0.5, 0.5, 0.5], -1)[0]).toBeLessThan(0.1);
  }, 20_000); // ~1.5 M noise samples; slow when the whole suite runs in parallel

  it('fringe stays subtle: at most 0.6 % of the distance from the centre', () => {
    expect(fringeScale(1)).toBeCloseTo(0.006);
  });

  it('keeps edits saved before the effects existed (they load with every effect off)', () => {
    const e = JSON.parse(JSON.stringify(defaultEditState()));
    for (const k of ['lightLeak', 'halation', 'bloom', 'flare', 'dust', 'fringe', 'dreamy', 'flash']) delete e.adjustments.effects[k];
    e.adjustments.effects.grain = 40;
    const parsed = EditStateSchema.parse(e);
    expect(parsed.adjustments.effects.grain).toBe(40);
    expect(parsed.adjustments.effects.bloom).toBe(0);
    // A look that sets only some effects does not reset the others.
    const look = PartialAdjustmentsSchema.parse({ effects: { bloom: 30 } });
    expect(look.effects).toEqual({ bloom: 30 });
  });
});

describe('blur effects: motion blur, shutter drag, soft focus', () => {
  const FX = (p: Partial<ReturnType<typeof params>['fx']> = {}) => ({ ...params().fx, ...p });
  type Img = { width: number; height: number; data: Uint8ClampedArray };
  /** A grey image from a function of (x, y) returning 0..255. */
  const image = (w: number, h: number, f: (x: number, y: number) => number): Img => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = f(x, y);
        data[o + 3] = 255;
      }
    return { width: w, height: h, data };
  };
  const render = (src: Img, effects: PartialAdjustments['effects'], fullSize = { width: src.width, height: src.height }) => {
    const edit = defaultEditState();
    edit.adjustments = mergeAdjustments(defaultAdjustments(), { effects });
    return cpuRender({ source: src, fullSize, edit, out: { width: src.width, height: src.height } }) as Img;
  };
  const at = (img: Img, x: number, y: number) => img.data[(y * img.width + x) * 4];
  /** Mean absolute difference between neighbours, along x and along y (away from the borders). */
  const detail = (img: Img) => {
    let dx = 0;
    let dy = 0;
    let n = 0;
    for (let y = 8; y < img.height - 8; y++)
      for (let x = 8; x < img.width - 8; x++) {
        dx += Math.abs(at(img, x + 1, y) - at(img, x, y));
        dy += Math.abs(at(img, x, y + 1) - at(img, x, y));
        n++;
      }
    return { dx: dx / n, dy: dy / n };
  };
  const mean = (img: Img) => {
    let m = 0;
    for (let i = 0; i < img.data.length; i += 4) m += img.data[i];
    return m / (img.data.length / 4);
  };
  const noise = (x: number, y: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  it('are off by default and switch on only their own passes', () => {
    const P = params();
    expect(P.fx.motionBlur).toBe(0);
    expect(P.fx.shutterDrag).toBe(0);
    expect(P.fx.softFocus).toBe(0);
    expect(P.streakActive).toBe(false);
    expect(params({ effects: { motionBlur: 40 } }).streakActive).toBe(true);
    expect(params({ effects: { shutterDrag: 40 } }).streakActive).toBe(true);
    expect(params({ effects: { motionBlur: 40 } }).glowActive).toBe(false);
    expect(params({ effects: { softFocus: 40 } }).glowActive).toBe(true);
    expect(params({ effects: { softFocus: 40 } }).streakActive).toBe(false);
    expect(params({ effects: { bloom: 40 } }).streakActive).toBe(false);
  });

  it('change nothing at 0', () => {
    for (const c of SAMPLES) {
      expect(glowStage(c, [1, 1, 1], [1, 1, 1], FX({ softFocus: 0 }))).toEqual(glowStage(c, [0, 0, 0], [1, 1, 1], FX()));
      expect(dragComposite(c, [1, 1, 1], 0)).toEqual(c);
      expect(dragComposite(c, [0, 0, 0], 1)).toEqual(c); // no trail reaching the pixel
    }
    expect(streakReach(FX())).toBe(0);
    // A whole render with the three at 0 is the plain render, byte for byte.
    const src = image(24, 16, (x, y) => (x < 6 ? 255 : Math.floor(noise(x, y) * 256)));
    const plain = render(src, {});
    expect(Array.from(render(src, { motionBlur: 0, shutterDrag: 0, softFocus: 0 }).data)).toEqual(Array.from(plain.data));
    for (const k of ['motionBlur', 'shutterDrag', 'softFocus'] as const) {
      expect(Array.from(render(src, { [k]: 100 }).data), k).not.toEqual(Array.from(plain.data));
      expect(Array.from(render(src, { [k]: 5 }).data), `${k} at 5`).not.toEqual(Array.from(plain.data));
    }
  });

  it('samples each streak evenly: two passes of 16 taps are 256 samples a length/256 apart', () => {
    const n = STREAK.taps;
    const offsets = (passes: ReturnType<typeof motionPasses>) => {
      const o: number[] = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) o.push((passes[0].start + i) * passes[0].step + (passes[1].start + j) * passes[1].step);
      return o.sort((a, b) => a - b);
    };
    const m = offsets(motionPasses(1));
    expect(m).toHaveLength(256);
    expect(m[0]).toBeCloseTo(-0.5 + 0.5 / 256, 9); // centred on the pixel
    expect(m[255]).toBeCloseTo(0.5 - 0.5 / 256, 9);
    for (let i = 1; i < m.length; i++) expect(m[i] - m[i - 1]).toBeCloseTo(1 / 256, 9);
    const d = offsets(dragPasses(1));
    expect(d[0]).toBeCloseTo(0.5 / 256, 9); // one-sided: only behind the pixel
    expect(d[255]).toBeCloseTo(1 - 0.5 / 256, 9);
    for (let i = 1; i < d.length; i++) expect(d[i] - d[i - 1]).toBeCloseTo(1 / 256, 9);
    // Drag weights fade away from the light; motion weights are equal.
    expect(streakWeight(0, true)).toBe(1);
    expect(streakWeight(8, true)).toBeCloseTo(0.25);
    expect(streakWeight(15, true)).toBeGreaterThan(0);
    expect(streakWeight(15, false)).toBe(1);
    // Reach for export padding: half the motion streak plus the whole trail.
    expect(streakReach(FX({ motionBlur: 1, shutterDrag: 1 }))).toBeCloseTo(STREAK.motionLength / 2 + STREAK.dragLength);
  });

  it('keeps the streak direction fixed on screen when the photo is rotated or flipped', () => {
    const full = { width: 300, height: 200 };
    const a = (STREAK.angleDeg * Math.PI) / 180;
    const dir = (g: Partial<EditState['geometry']>) => {
      const geo = { ...defaultEditState().geometry, ...g };
      const frame = geo.rotate90 % 2 ? { width: full.height, height: full.width } : full;
      return streakDirection(outputToSourceMatrix(full, geo), { width: geo.crop.w * frame.width, height: geo.crop.h * frame.height }, full);
    };
    // Unrotated: to the right and slightly up (y points down).
    expect(dir({})[0]).toBeCloseTo(Math.cos(a));
    expect(dir({})[1]).toBeCloseTo(-Math.sin(a));
    // Mirrored photo: the same screen direction is the mirrored direction in the source.
    expect(dir({ flipH: true })[0]).toBeCloseTo(-Math.cos(a));
    expect(dir({ flipH: true })[1]).toBeCloseTo(-Math.sin(a));
    // A quarter turn: the source direction turns by 90 degrees and stays a unit vector.
    const r = dir({ rotate90: 1 });
    expect(Math.hypot(r[0], r[1])).toBeCloseTo(1);
    expect(Math.abs(r[1])).toBeCloseTo(Math.cos(a));
    // A crop does not change it.
    expect(dir({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 } })[0]).toBeCloseTo(Math.cos(a));
  });

  it('motion blur smears along the streak: horizontal detail goes, vertical detail mostly stays', () => {
    // 96 px wide: the streak is 5.8 px long at 100, 12 degrees from horizontal.
    const vertical = image(96, 96, (x) => (x % 4 < 2 ? 40 : 215)); // detail along x
    const horizontal = image(96, 96, (_, y) => (y % 4 < 2 ? 40 : 215)); // detail along y
    const v0 = detail(vertical).dx;
    const h0 = detail(horizontal).dy;
    const v1 = detail(render(vertical, { motionBlur: 100 })).dx;
    const h1 = detail(render(horizontal, { motionBlur: 100 })).dy;
    expect(v1).toBeLessThan(v0 * 0.25);
    expect(h1).toBeGreaterThan(h0 * 0.6);
    expect(v1 / v0).toBeLessThan((h1 / h0) / 3);
    // It is a blur, not a brightening: a flat area keeps its value.
    const flat = render(image(40, 40, () => 128), { motionBlur: 100 });
    expect(Math.abs(mean(flat) - 128)).toBeLessThan(0.6);
    // More strength, more blur.
    expect(detail(render(vertical, { motionBlur: 40 })).dx).toBeGreaterThan(v1);
  });

  it('shutter drag trails light one way from a bright spot and leaves the rest alone', () => {
    // 200 px wide: trails reach 20 px at 100. A 6 px light at (60, 50) on a dark, flat frame.
    const spot = image(200, 100, (x, y) => (Math.abs(x - 60) <= 3 && Math.abs(y - 50) <= 3 ? 255 : 20));
    const out = render(spot, { shutterDrag: 100 });
    expect(at(out, 60, 50)).toBeGreaterThanOrEqual(250); // the light itself stays
    // Trailing side (to the right, slightly up): light, fading with distance.
    const near = at(out, 68, 49);
    const far = at(out, 76, 47);
    expect(near).toBeGreaterThan(60);
    expect(far).toBeGreaterThan(22);
    expect(near).toBeGreaterThan(far);
    // Leading side and everywhere out of reach: exactly the original.
    expect(at(out, 52, 51)).toBe(20);
    expect(at(out, 60, 70)).toBe(20);
    for (let y = 0; y < 100; y++) for (let x = 100; x < 200; x++) expect(at(out, x, y)).toBe(20);
    // A frame with no highlights is untouched.
    const dark = image(60, 40, (x, y) => 20 + Math.floor(noise(x, y) * 60));
    expect(Array.from(render(dark, { shutterDrag: 100 }).data)).toEqual(Array.from(render(dark, {}).data));
    // Only highlights leave trails, and the blend has a shoulder: it never reaches past white.
    expect(dragHighlight([0.2, 0.2, 0.2])).toEqual([0, 0, 0]);
    expect(dragHighlight([0.9, 0.9, 0.9])).toEqual([0.9, 0.9, 0.9]);
    const lit = dragComposite([0.8, 0.8, 0.8], [1, 1, 1], 1);
    expect(lit[0]).toBeGreaterThan(0.8);
    expect(lit[0]).toBeLessThan(1);
    expect(dragComposite([0.2, 0.2, 0.2], [0.5, 0.5, 0.5], 1)[0]).toBeGreaterThan(dragComposite([0.2, 0.2, 0.2], [0.5, 0.5, 0.5], 0.3)[0]);
  });

  it('soft focus lowers fine detail and keeps the brightness and the structure', () => {
    // Fine texture on a left-dark, right-bright frame.
    const src = image(120, 80, (x, y) => (x < 60 ? 70 : 170) + Math.floor((noise(x, y) - 0.5) * 50));
    const plain = render(src, {});
    const soft = render(src, { softFocus: 100 });
    const d0 = detail(plain);
    const d1 = detail(soft);
    expect(d1.dx).toBeLessThan(d0.dx * 0.6);
    expect(d1.dy).toBeLessThan(d0.dy * 0.6);
    expect(d1.dx).toBeGreaterThan(d0.dx * 0.15); // softened, not wiped: the sharp picture is still under it
    expect(Math.abs(mean(soft) - mean(plain))).toBeLessThan(4);
    // The two halves stay apart (contrast is not flattened).
    const half = (img: Img, x0: number) => {
      let m = 0;
      for (let y = 20; y < 60; y++) for (let x = x0; x < x0 + 30; x++) m += at(img, x, y);
      return m / (40 * 30);
    };
    expect(half(soft, 80) - half(soft, 10)).toBeGreaterThan((half(plain, 80) - half(plain, 10)) * 0.95);
    // Unlike dreamy blur it is not a glow: a dark pixel next to light is lifted far less.
    const softPx = glowStage([0.1, 0.1, 0.1], [0.35, 0.35, 0.35], [0.6, 0.6, 0.6], FX({ softFocus: 1 }));
    const dreamyPx = glowStage([0.1, 0.1, 0.1], [0.35, 0.35, 0.35], [0.6, 0.6, 0.6], FX({ dreamy: 1 }));
    expect(softPx[0]).toBeLessThan(dreamyPx[0]);
    // A flat area stays (almost) as it was: only the slight contrast lift acts.
    const flat = glowStage([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], FX({ softFocus: 1 }));
    expect(Math.abs(flat[0] - 0.5)).toBeLessThan(0.02);
  });

  it('looks the same in a preview and at twice the size (lengths follow the long edge)', () => {
    // The same scene at 2x and, averaged 2 x 2, at 1x; both are views of the same full-size photo.
    // Soft focus is checked on a larger pair: under ~170 px its blur is held at the 2 px minimum.
    // Measured: 0.3-0.4 levels apart on average, against 0.2-0.25 from resampling alone.
    const cases: [PartialAdjustments['effects'], number][] = [
      [{ motionBlur: 80 }, 120],
      [{ shutterDrag: 80 }, 120],
      [{ softFocus: 80 }, 180],
      [{ motionBlur: 50, shutterDrag: 60, softFocus: 40 }, 180],
    ];
    for (const [effects, w] of cases) {
      const h = (w * 2) / 3;
      const k = 240 / (2 * w); // scene units per pixel of the big image
      const scene = (px: number, py: number) => {
        const x = px * k;
        const y = py * k;
        const light = Math.hypot(x - 70, y - 90) < 9 || (Math.abs(x - 170) < 5 && Math.abs(y - 50) < 14);
        return light ? 250 : 40 + 50 * (0.5 + 0.5 * Math.sin(x / 9)) + 40 * (0.5 + 0.5 * Math.cos(y / 7));
      };
      const big = image(2 * w, 2 * h, scene);
      const small = image(w, h, (x, y) => (scene(2 * x, 2 * y) + scene(2 * x + 1, 2 * y) + scene(2 * x, 2 * y + 1) + scene(2 * x + 1, 2 * y + 1)) / 4);
      const full = { width: 2 * w, height: 2 * h };
      const a = render(small, effects, full);
      const b = render(big, effects, full);
      const untouched = render(small, {}, full);
      const untouchedBig = render(big, {}, full);
      const down = (img: Img, x: number, y: number) => (at(img, 2 * x, 2 * y) + at(img, 2 * x + 1, 2 * y) + at(img, 2 * x, 2 * y + 1) + at(img, 2 * x + 1, 2 * y + 1)) / 4;
      let diff = 0;
      let base = 0;
      let change = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          diff += Math.abs(down(b, x, y) - at(a, x, y));
          base += Math.abs(down(untouchedBig, x, y) - at(untouched, x, y)); // what resampling alone costs
          change += Math.abs(at(a, x, y) - at(untouched, x, y));
        }
      const label = JSON.stringify(effects);
      // The two sizes agree to about a level on average: a small part of what the effect does.
      expect(diff / (w * h), label).toBeLessThan(1.5);
      expect(diff - base, label).toBeLessThan(change * 0.2);
    }
  }, 60_000);

  it('streak passes clamp at the edges and keep a flat image flat', () => {
    const w = 12;
    const h = 8;
    const flat = new Float32Array(w * h * 3).fill(0.4);
    for (const pass of [...motionPasses(1), ...dragPasses(1)]) {
      const out = streakPass(flat, w, h, 3.1 * pass.step * 16, -0.7 * pass.step * 16, { ...pass, extract: false });
      for (const v of out) expect(v).toBeCloseTo(0.4, 4);
    }
  });
});
