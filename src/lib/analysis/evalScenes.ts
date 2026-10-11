/**
 * Procedural test scenes and known looks for the reference-matching
 * evaluation (match.test.ts, match.eval.test.ts). Deterministic: value noise
 * from a fixed hash, no Math.random.
 */
import { linearToSrgb, srgbToLinear } from '../color/srgb';
import type { PartialAdjustments } from '../schema/adjustments';
import type { PixelImage } from './stats';

type RGB = [number, number, number];

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth value noise in 0..1. */
export function noise(u: number, v: number, scale: number, seed: number): number {
  const x = u * scale;
  const y = v * scale;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * s(fx);
  const bot = c + (d - c) * s(fx);
  return top + (bot - top) * s(fy);
}

const fbm = (u: number, v: number, scale: number, seed: number) =>
  noise(u, v, scale, seed) * 0.55 +
  noise(u, v, scale * 2.1, seed + 1) * 0.3 +
  noise(u, v, scale * 4.3, seed + 2) * 0.15;

/** sRGB 0..255 hex-ish triple to linear. */
const lin = (r: number, g: number, b: number): RGB => [
  srgbToLinear(r / 255),
  srgbToLinear(g / 255),
  srgbToLinear(b / 255),
];
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

export function synth(w: number, h: number, f: (u: number, v: number) => RGB): PixelImage {
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

/** Vivid jungle foliage: saturated yellow-greens with brown dead leaves (the owner's reported target). */
export const jungleScene = (u: number, v: number): RGB => {
  const leaf = fbm(u, v, 9, 11);
  const shade = 0.25 + 0.95 * fbm(u, v, 5, 21);
  const dead = fbm(u, v, 6, 31);
  const yellowGreen = lin(150, 190, 30);
  const deepGreen = lin(40, 120, 20);
  let c = mixRgb(deepGreen, yellowGreen, leaf);
  if (dead > 0.6) c = mixRgb(lin(125, 82, 45), lin(160, 110, 60), noise(u, v, 30, 41)); // brown dead leaves
  const gap = fbm(u, v, 14, 51);
  if (gap < 0.3) c = scale(c, 0.25);
  return scale(c, shade);
};

/** Misty forest: green canopy, dark trunks, bright hazy gaps. */
export const forestScene = (u: number, v: number): RGB => {
  const canopy = fbm(u, v, 7, 61);
  let c = mixRgb(lin(30, 85, 35), lin(110, 160, 70), canopy);
  const trunk = Math.abs(Math.sin(u * 23 + noise(u, v, 3, 71) * 2)) < 0.12;
  if (trunk && v > 0.25) c = lin(55, 45, 35);
  const sky = (1 - v) * fbm(u, v, 4, 81);
  if (sky > 0.45) c = mixRgb(c, lin(225, 230, 225), Math.min(1, (sky - 0.45) * 4));
  return scale(c, 0.55 + 0.6 * fbm(u, v, 3, 91));
};

/** Portrait-like: skin oval, dark hair, blue top, green background with bokeh. */
export const portraitScene = (u: number, v: number): RGB => {
  const dx = (u - 0.5) / 0.17;
  const dy = (v - 0.42) / 0.25;
  const bg = mixRgb(lin(60, 110, 60), lin(150, 175, 110), fbm(u, v, 4, 101));
  let c = bg;
  if (v > 0.72 && Math.abs(u - 0.5) < 0.32)
    c = mixRgb(lin(40, 70, 140), lin(70, 110, 180), fbm(u, v, 6, 111));
  if (Math.hypot(dx, (v - 0.33) / 0.27) < 1.08 && v < 0.5) c = lin(45, 32, 25); // hair
  if (Math.hypot(dx, dy) < 1) {
    const shade = 0.8 + 0.3 * (1 - Math.hypot(dx * 0.8, dy));
    c = scale(mixRgb(lin(222, 172, 140), lin(196, 136, 104), fbm(u, v, 8, 121)), shade);
  }
  return c;
};

/** Street: blue sky, beige and grey buildings, a red sign, dark asphalt. */
export const streetScene = (u: number, v: number): RGB => {
  if (v < 0.35) return mixRgb(lin(110, 160, 225), lin(185, 210, 240), v / 0.35);
  if (v > 0.82) return scale(lin(70, 70, 75), 0.7 + 0.5 * fbm(u, v, 20, 131));
  const b = Math.floor(u * 6);
  const base =
    b % 3 === 0 ? lin(205, 185, 150) : b % 3 === 1 ? lin(150, 150, 155) : lin(180, 120, 90);
  let c = scale(base, 0.75 + 0.35 * fbm(u, v, 10, 141 + b));
  if (Math.abs(u - 0.62) < 0.05 && Math.abs(v - 0.5) < 0.04) c = lin(200, 30, 35);
  if ((Math.floor(v * 30) + Math.floor(u * 40)) % 7 === 0) c = scale(c, 0.45); // windows
  return c;
};

/** Known looks used to create references (applied with the CPU reference renderer). */
export const EVAL_LOOKS: Record<string, PartialAdjustments> = {
  'muted teal forest': {
    basic: { saturation: -50, temperature: -15 },
    curves: {
      master: [
        [0, 0.13],
        [0.25, 0.3],
        [0.5, 0.49],
        [0.75, 0.66],
        [1, 0.86],
      ],
    },
    hsl: {
      green: { hue: 70, saturation: -30 },
      yellow: { hue: 80, saturation: -50 },
      orange: { saturation: -40 },
    },
    grading: {
      shadows: { hue: 200, saturation: 25 },
      highlights: { hue: 205, saturation: 12 },
      blending: 50,
    },
  },
  'warm golden hour': {
    basic: { temperature: 38, tint: 6, saturation: 12 },
    curves: {
      master: [
        [0, 0.02],
        [0.3, 0.3],
        [0.7, 0.76],
        [1, 0.98],
      ],
    },
    hsl: { orange: { saturation: 20 }, yellow: { hue: -15, saturation: 10 } },
    grading: {
      highlights: { hue: 70, saturation: 30 },
      shadows: { hue: 35, saturation: 14 },
      blending: 50,
    },
  },
  'faded matte film': {
    basic: { saturation: -22 },
    curves: {
      master: [
        [0, 0.15],
        [0.5, 0.52],
        [1, 0.9],
      ],
    },
    hsl: { green: { hue: -25, saturation: -15 }, blue: { saturation: -30 } },
    grading: {
      shadows: { hue: 165, saturation: 14 },
      highlights: { hue: 75, saturation: 14 },
      blending: 50,
    },
  },
  'high-contrast cool': {
    basic: { temperature: -32, saturation: 8 },
    curves: {
      master: [
        [0, 0],
        [0.25, 0.14],
        [0.5, 0.5],
        [0.75, 0.87],
        [1, 1],
      ],
    },
    hsl: { blue: { saturation: 25 } },
  },
  'desaturated pastel': {
    basic: { saturation: -40 },
    curves: {
      master: [
        [0, 0.22],
        [0.5, 0.64],
        [1, 0.97],
      ],
    },
    grading: {
      highlights: { hue: 340, saturation: 14 },
      shadows: { hue: 255, saturation: 12 },
      blending: 50,
    },
  },
  'black and white': {
    basic: { monochrome: 100 },
    curves: {
      master: [
        [0, 0.02],
        [0.3, 0.24],
        [0.7, 0.78],
        [1, 1],
      ],
    },
  },
  'orange-teal': {
    basic: { saturation: 6 },
    curves: {
      master: [
        [0, 0.03],
        [0.3, 0.27],
        [0.7, 0.74],
        [1, 0.98],
      ],
    },
    hsl: {
      orange: { saturation: 20 },
      blue: { hue: -45, saturation: 10 },
      green: { hue: 40, saturation: -35 },
      aqua: { saturation: 10 },
    },
    grading: {
      shadows: { hue: 200, saturation: 40 },
      highlights: { hue: 60, saturation: 32 },
      blending: 50,
    },
  },
};
