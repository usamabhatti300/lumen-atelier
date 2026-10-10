import { describe, expect, it } from 'vitest';
import {
  MAX_UPSCALE_PIXELS,
  axisWeights,
  resizeChannelCubic,
  tileGrid,
  tileSpans,
  upscaleImage,
  upscaleSizeProblem,
  upscaleTileCount,
  type RgbaImage,
} from './upscale';

/** Stand-in for the model: nearest-neighbour 4×, planar in and out. */
async function nearest4x(input: Float32Array, w: number, h: number): Promise<Float32Array> {
  const out = new Float32Array(3 * 16 * w * h);
  const W = w * 4;
  const plane = W * h * 4;
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < h * 4; y++) for (let x = 0; x < W; x++) out[c * plane + y * W + x] = input[c * w * h + (y >> 2) * w + (x >> 2)];
  return out;
}

function noiseImage(w: number, h: number, seed = 7, alpha = false): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  for (let i = 0; i < data.length; i++) {
    s = (s * 16807) % 2147483647;
    data[i] = i % 4 === 3 && !alpha ? 255 : s & 255;
  }
  return { width: w, height: h, data };
}

describe('tile grid', () => {
  it('covers the axis with equal tiles that overlap by at least the minimum', () => {
    for (const length of [1, 100, 256, 257, 300, 480, 481, 497, 1000, 4033]) {
      const spans = tileSpans(length, 256, 32);
      expect(spans[0].start).toBe(0);
      const last = spans[spans.length - 1];
      expect(last.start + last.size).toBe(length);
      for (const s of spans) expect(s.size).toBe(Math.min(256, length));
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].start).toBeGreaterThan(spans[i - 1].start);
        expect(spans[i - 1].start + spans[i - 1].size - spans[i].start).toBeGreaterThanOrEqual(32);
      }
    }
  });

  it('uses as few tiles as the overlap allows', () => {
    expect(tileSpans(256, 256, 32)).toHaveLength(1);
    expect(tileSpans(480, 256, 32)).toHaveLength(2);
    expect(tileSpans(481, 256, 32)).toHaveLength(3);
    expect(tileGrid(600, 300, 256, 32)).toHaveLength(3 * 2);
    expect(upscaleTileCount({ width: 600, height: 300 }, 256, 32)).toBe(6);
  });

  it('rejects impossible layouts', () => {
    expect(() => tileSpans(100, 64, 64)).toThrow();
    expect(() => tileSpans(0, 64, 8)).toThrow();
  });
});

describe('blend weights', () => {
  it('sum to exactly 1 at every output pixel, including triple overlaps', () => {
    for (const [length, tile, overlap] of [
      [497, 256, 16],
      [1000, 256, 32],
      [200, 64, 32],
      [90, 64, 4],
    ]) {
      const spans = tileSpans(length, tile, overlap);
      for (const scale of [2, 4]) {
        const w = axisWeights(spans, scale, 10);
        const sum = new Float64Array(length * scale);
        spans.forEach((s, i) => w[i].forEach((v, p) => (sum[s.start * scale + p] += v)));
        for (const v of sum) expect(v).toBeCloseTo(1, 5);
      }
    }
  });

  it('give tile edges inside an overlap almost no weight and ramp monotonically', () => {
    const spans = tileSpans(480, 256, 32); // two tiles overlapping by 32 px
    const [a, b] = axisWeights(spans, 4, 10);
    const ovStart = spans[1].start * 4;
    expect(b[0]).toBeLessThan(1e-3); // first output pixels of the right tile
    expect(a[a.length - 1]).toBeLessThan(1e-3); // last of the left tile
    for (let p = 1; p < 32 * 4; p++) expect(b[p]).toBeGreaterThanOrEqual(b[p - 1]);
    // Outside the overlap each tile has full weight.
    expect(a[ovStart - 1]).toBe(1);
    expect(b[32 * 4]).toBe(1);
  });

  it('a single tile has weight 1 everywhere', () => {
    const [w] = axisWeights(tileSpans(100), 4);
    expect(w.every((v) => v === 1)).toBe(true);
  });
});

describe('size limits', () => {
  it('allows typical small photos and refuses outputs that are too large', () => {
    expect(upscaleSizeProblem({ width: 1200, height: 800 }, 4)).toBeNull();
    expect(upscaleSizeProblem({ width: 4000, height: 3000 }, 2)).toBeNull();
    const p4 = upscaleSizeProblem({ width: 4000, height: 3000 }, 4);
    expect(p4).toMatch(/16000 × 12000/);
    expect(p4).toMatch(/Choose 2×/);
    expect(upscaleSizeProblem({ width: 8193, height: 10 }, 2)).toMatch(/per side/);
    const side = Math.floor(Math.sqrt(MAX_UPSCALE_PIXELS / 4)) + 1;
    expect(upscaleSizeProblem({ width: side, height: side }, 2)).not.toBeNull();
  });
});

describe('upscaleImage', () => {
  it('4× with a consistent model reproduces the single-pass result exactly (no seams)', async () => {
    const src = noiseImage(150, 110);
    const tiled = await upscaleImage(src, { factor: 4, runTile: nearest4x, tile: 48, overlap: 16, margin: 4 });
    const whole = await upscaleImage(src, { factor: 4, runTile: nearest4x, tile: 4096 });
    expect([tiled.width, tiled.height]).toEqual([600, 440]);
    let maxDiff = 0;
    for (let i = 0; i < whole.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs(whole.data[i] - tiled.data[i]));
    expect(maxDiff).toBeLessThanOrEqual(1);
    // Nearest-neighbour model: every output pixel equals its source pixel.
    const x = 333;
    const y = 217;
    const o = (y * 600 + x) * 4;
    const s = ((y >> 2) * 150 + (x >> 2)) * 4;
    expect(Math.abs(tiled.data[o] - src.data[s])).toBeLessThanOrEqual(1);
    expect(tiled.data[o + 3]).toBe(255);
  });

  it('2× is twice the size and averages in linear light', async () => {
    const src = noiseImage(70, 50);
    const out = await upscaleImage(src, { factor: 2, runTile: nearest4x, tile: 32, overlap: 8, margin: 2 });
    expect([out.width, out.height]).toEqual([140, 100]);
    // Each 2× pixel averages a 2×2 block of identical values, so it keeps the source value.
    for (const [x, y] of [
      [0, 0],
      [139, 99],
      [77, 41],
    ]) {
      const o = (y * 140 + x) * 4;
      const s = ((y >> 1) * 70 + (x >> 1)) * 4;
      for (let c = 0; c < 3; c++) expect(Math.abs(out.data[o + c] - src.data[s + c])).toBeLessThanOrEqual(1);
    }
    // A black/white checkerboard averages to linear 50 % grey (sRGB ~188), not 128.
    const checker = async (input: Float32Array, w: number, h: number) => {
      const r = await nearest4x(input, w, h);
      for (let i = 0; i < r.length; i++) {
        const p = i % (16 * w * h);
        const W = 4 * w;
        r[i] = ((p % W) + Math.floor(p / W)) % 2;
      }
      return r;
    };
    const grey = await upscaleImage(noiseImage(8, 8), { factor: 2, runTile: checker });
    expect(grey.data[0]).toBeGreaterThanOrEqual(186);
    expect(grey.data[0]).toBeLessThanOrEqual(189);
  });

  it('clamps model output outside 0–1', async () => {
    const over = async (_: Float32Array, w: number, h: number) => new Float32Array(48 * w * h).fill(1.3);
    const out = await upscaleImage(noiseImage(10, 10), { factor: 4, runTile: over });
    expect(out.data[0]).toBe(255);
  });

  it('keeps and enlarges transparency', async () => {
    const src = noiseImage(40, 40, 3);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) src.data[(y * 40 + x) * 4 + 3] = x < 20 ? 0 : 255;
    const out = await upscaleImage(src, { factor: 2, runTile: nearest4x });
    const a = (x: number, y: number) => out.data[(y * 80 + x) * 4 + 3];
    expect(a(5, 40)).toBe(0);
    expect(a(75, 40)).toBe(255);
    expect(a(38, 40)).toBeLessThan(a(42, 40));
  });

  it('reports every tile and stops when cancelled', async () => {
    const ticks: [number, number][] = [];
    await upscaleImage(noiseImage(100, 60), { factor: 4, runTile: nearest4x, tile: 48, overlap: 16, onTile: (d, t) => ticks.push([d, t]) });
    expect(ticks.length).toBe(ticks[0][1]);
    expect(ticks.at(-1)).toEqual([ticks[0][1], ticks[0][1]]);

    const ac = new AbortController();
    let runs = 0;
    const run = async (i: Float32Array, w: number, h: number) => {
      if (++runs === 2) ac.abort(new DOMException('Cancelled', 'AbortError'));
      return nearest4x(i, w, h);
    };
    await expect(upscaleImage(noiseImage(100, 60), { factor: 4, runTile: run, tile: 48, overlap: 16, signal: ac.signal })).rejects.toThrow(
      /Cancelled/,
    );
    expect(runs).toBe(2);
  });

  it('rejects a model result of the wrong size', async () => {
    const bad = async () => new Float32Array(5);
    await expect(upscaleImage(noiseImage(10, 10), { factor: 4, runTile: bad })).rejects.toThrow(/expected/);
  });
});

describe('resizeChannelCubic', () => {
  it('keeps flat areas flat and interpolates edges', () => {
    const src = new Uint8Array(16).fill(200);
    expect(resizeChannelCubic(src, 4, 4, 8, 8).every((v) => v === 200)).toBe(true);
    const step = Uint8Array.from([0, 0, 255, 255]);
    const out = resizeChannelCubic(step, 4, 1, 16, 1);
    expect(out[0]).toBe(0);
    expect(out[15]).toBe(255);
    expect(out[8]).toBeGreaterThan(out[6]);
  });
});
