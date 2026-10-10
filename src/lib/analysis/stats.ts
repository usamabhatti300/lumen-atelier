/**
 * Deterministic image statistics for reference analysis (pure functions, run
 * in a Web Worker). All colour measurements use OKLab on linear sRGB;
 * tonal measurements use sRGB-encoded luminance ("perceptual" p in 0..1).
 */
import { SRGB8_TO_LINEAR, rgbToHex } from '../color/srgb';
import { linearSrgbToOklab, oklabToLinearSrgb } from '../color/oklab';
import { linearToSrgb } from '../color/srgb';
import { HSL_BANDS, HSL_BAND_HUES, type HslBandName } from '../schema/adjustments';

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface ZoneTint {
  /** Mean OKLab a/b of near-neutral pixels in this tonal zone. */
  a: number;
  b: number;
  /** How many pixels contributed (fraction of the image). */
  support: number;
}

export interface BandStat {
  /** Share of chromatic pixels in this hue band. */
  share: number;
  meanChroma: number;
  meanL: number;
  /** Mean signed hue offset from the band centre (degrees). */
  hueOffset: number;
}

export interface PaletteColor {
  hex: string;
  weight: number;
  L: number;
  C: number;
  h: number;
}

export interface ImageStats {
  width: number;
  height: number;
  /** Perceptual luminance percentiles. */
  percentiles: { p1: number; p5: number; p25: number; p50: number; p75: number; p95: number; p99: number };
  meanP: number;
  /** Standard deviation of perceptual luminance. */
  contrast: number;
  blackFloor: number;
  whiteCeiling: number;
  clippedShadows: number;
  clippedHighlights: number;
  /** Fractions per Zone System zone (0..X). */
  zones: number[];
  /** Global cast of near-neutral pixels (OKLab a, b). */
  cast: { a: number; b: number; support: number };
  shadows: ZoneTint;
  midtones: ZoneTint;
  highlights: ZoneTint;
  chroma: { mean: number; p50: number; p90: number };
  bands: Record<HslBandName, BandStat>;
  palette: PaletteColor[];
  skin: { fraction: number; L: number; C: number; h: number };
  /** Residual noise level in flat areas (perceptual units); null when not measured. */
  grain: number | null;
  /** Corner-to-centre luminance ratio (1 = none). */
  vignette: { ratio: number; symmetry: number };
  monochrome: boolean;
  flags: {
    screenshotLikely: boolean;
    multiplePhotosLikely: boolean;
    illustrationLikely: boolean;
    lowResolution: boolean;
    nightLikely: boolean;
    underexposed: boolean;
    overexposed: boolean;
  };
  /** Suggested crop that trims uniform borders (UI bars, letterboxing), normalized. */
  suggestedCrop: { x: number; y: number; w: number; h: number } | null;
}

const encode = (y: number) => linearToSrgb(Math.max(0, Math.min(1, y)));

interface Px {
  p: number;
  L: number;
  a: number;
  b: number;
  C: number;
  h: number;
}

function analyzePixels(img: PixelImage, step: number): Px[] {
  const out: Px[] = [];
  const { width, height, data } = img;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const r = SRGB8_TO_LINEAR[data[i]];
      const g = SRGB8_TO_LINEAR[data[i + 1]];
      const bl = SRGB8_TO_LINEAR[data[i + 2]];
      const [L, a, b] = linearSrgbToOklab(r, g, bl);
      const C = Math.hypot(a, b);
      let h = (Math.atan2(b, a) * 180) / Math.PI;
      if (h < 0) h += 360;
      out.push({ p: encode(0.2126 * r + 0.7152 * g + 0.0722 * bl), L, a, b, C, h });
    }
  }
  return out;
}

function quantile(sorted: Float32Array | number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

function hueDelta(a: number, b: number) {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/** Nearest band and its centre, for hue h (degrees). */
export function bandOf(h: number): HslBandName {
  let best: HslBandName = 'red';
  let bestD = Infinity;
  for (const band of HSL_BANDS) {
    const d = Math.abs(hueDelta(h, HSL_BAND_HUES[band]));
    if (d < bestD) {
      bestD = d;
      best = band;
    }
  }
  return best;
}

export function computeStats(img: PixelImage, detail?: PixelImage): ImageStats {
  const total = img.width * img.height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 160_000)));
  const px = analyzePixels(img, step);
  const n = Math.max(1, px.length);

  const ps = Float32Array.from(px.map((q) => q.p)).sort();
  const percentiles = {
    p1: quantile(ps, 0.01),
    p5: quantile(ps, 0.05),
    p25: quantile(ps, 0.25),
    p50: quantile(ps, 0.5),
    p75: quantile(ps, 0.75),
    p95: quantile(ps, 0.95),
    p99: quantile(ps, 0.99),
  };
  let sum = 0;
  let sum2 = 0;
  let lo = 0;
  let hi = 0;
  const zones = new Array(11).fill(0);
  for (const q of px) {
    sum += q.p;
    sum2 += q.p * q.p;
    if (q.p <= 0.008) lo++;
    if (q.p >= 0.992) hi++;
    const y = q.p <= 0.04045 ? q.p / 12.92 : Math.pow((q.p + 0.055) / 1.055, 2.4);
    const z = y <= 0.18 / 32 / 1.414 ? 0 : Math.max(0, Math.min(10, Math.round(Math.log2(y / 0.18) + 5)));
    zones[z]++;
  }
  const meanP = sum / n;
  const contrast = Math.sqrt(Math.max(0, sum2 / n - meanP * meanP));

  // Near-neutral pixels carry the grade most visibly (toning/casts).
  const neutralLimit = 0.06;
  const tint = (filter: (q: Px) => boolean, limit = neutralLimit): ZoneTint => {
    let a = 0;
    let b = 0;
    let c = 0;
    for (const q of px) {
      if (q.C < limit && filter(q)) {
        a += q.a;
        b += q.b;
        c++;
      }
    }
    return c ? { a: a / c, b: b / c, support: c / n } : { a: 0, b: 0, support: 0 };
  };
  // The global cast uses only nearly colourless pixels so coloured scene content is not mistaken for a cast.
  const castT = tint(() => true, 0.035);
  const shadows = tint((q) => q.L < 0.42);
  const midtones = tint((q) => q.L >= 0.42 && q.L < 0.72);
  const highlights = tint((q) => q.L >= 0.72);

  const cs = Float32Array.from(px.map((q) => q.C)).sort();
  const chroma = { mean: px.reduce((s, q) => s + q.C, 0) / n, p50: quantile(cs, 0.5), p90: quantile(cs, 0.9) };

  const bandsAcc = Object.fromEntries(HSL_BANDS.map((b) => [b, { count: 0, C: 0, L: 0, off: 0 }])) as Record<HslBandName, { count: number; C: number; L: number; off: number }>;
  let chromatic = 0;
  for (const q of px) {
    if (q.C < 0.035) continue;
    chromatic++;
    const band = bandOf(q.h);
    const acc = bandsAcc[band];
    acc.count++;
    acc.C += q.C;
    acc.L += q.L;
    acc.off += hueDelta(q.h, HSL_BAND_HUES[band]);
  }
  const bands = Object.fromEntries(
    HSL_BANDS.map((b) => {
      const acc = bandsAcc[b];
      return [
        b,
        acc.count
          ? { share: acc.count / Math.max(1, chromatic), meanChroma: acc.C / acc.count, meanL: acc.L / acc.count, hueOffset: acc.off / acc.count }
          : { share: 0, meanChroma: 0, meanL: 0, hueOffset: 0 },
      ];
    }),
  ) as Record<HslBandName, BandStat>;

  // Skin-like colours (also matches sand, wood; used only as a hint).
  let skinN = 0;
  let skinL = 0;
  let skinC = 0;
  let skinH = 0;
  for (const q of px) {
    if (q.h >= 30 && q.h <= 85 && q.C >= 0.03 && q.C <= 0.16 && q.L >= 0.35 && q.L <= 0.88) {
      skinN++;
      skinL += q.L;
      skinC += q.C;
      skinH += q.h;
    }
  }

  const palette = kmeansPalette(px, 6);
  const vignette = measureVignette(img);
  const grain = detail ? measureGrain(detail) : null;
  const borders = detectBorders(img);
  const monochrome = chroma.p90 < 0.02;

  return {
    width: img.width,
    height: img.height,
    percentiles,
    meanP,
    contrast,
    blackFloor: percentiles.p1,
    whiteCeiling: percentiles.p99,
    clippedShadows: lo / n,
    clippedHighlights: hi / n,
    zones: zones.map((z) => z / n),
    cast: { a: castT.a, b: castT.b, support: castT.support },
    shadows,
    midtones,
    highlights,
    chroma,
    bands,
    palette,
    skin: skinN ? { fraction: skinN / n, L: skinL / skinN, C: skinC / skinN, h: skinH / skinN } : { fraction: 0, L: 0, C: 0, h: 0 },
    grain,
    vignette,
    monochrome,
    flags: {
      screenshotLikely: borders.uiLikely,
      multiplePhotosLikely: borders.internalSeparators,
      illustrationLikely: illustrationScore(img) > 0.55,
      lowResolution: Math.max(img.width, img.height) < 500,
      nightLikely: meanP < 0.22 && chroma.p90 > 0.12,
      underexposed: percentiles.p50 < 0.12,
      overexposed: hi / n > 0.2 || percentiles.p50 > 0.88,
    },
    suggestedCrop: borders.crop,
  };
}

/** k-means++ in OKLab on a subsample. Deterministic seeding (no Math.random). */
export function kmeansPalette(px: Px[], k: number): PaletteColor[] {
  const stride = Math.max(1, Math.floor(px.length / 12_000));
  const pts: [number, number, number][] = [];
  for (let i = 0; i < px.length; i += stride) pts.push([px[i].L, px[i].a, px[i].b]);
  if (pts.length === 0) return [];
  const centres: [number, number, number][] = [pts[Math.floor(pts.length / 2)]];
  const d2 = (p: number[], c: number[]) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
  while (centres.length < Math.min(k, pts.length)) {
    // Farthest-point seeding (deterministic variant of k-means++).
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.min(...centres.map((c) => d2(pts[i], c)));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    centres.push([...pts[best]]);
  }
  const assign = new Int32Array(pts.length);
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < pts.length; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const d = d2(pts[i], centres[c]);
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      assign[i] = bi;
    }
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const a = acc[assign[i]];
      a[0] += pts[i][0];
      a[1] += pts[i][1];
      a[2] += pts[i][2];
      a[3]++;
    }
    centres.forEach((c, j) => {
      if (acc[j][3]) {
        c[0] = acc[j][0] / acc[j][3];
        c[1] = acc[j][1] / acc[j][3];
        c[2] = acc[j][2] / acc[j][3];
      }
    });
  }
  const counts = centres.map(() => 0);
  for (let i = 0; i < pts.length; i++) counts[assign[i]]++;
  return centres
    .map((c, j) => {
      const rgb = oklabToLinearSrgb(c[0], c[1], c[2]).map((v) => linearToSrgb(Math.min(1, Math.max(0, v))));
      let h = (Math.atan2(c[2], c[1]) * 180) / Math.PI;
      if (h < 0) h += 360;
      return { hex: rgbToHex(rgb[0], rgb[1], rgb[2]), weight: counts[j] / pts.length, L: c[0], C: Math.hypot(c[1], c[2]), h };
    })
    .filter((c) => c.weight > 0.005)
    .sort((a, b) => b.weight - a.weight);
}

function lumAt(img: PixelImage, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  return encode(0.2126 * SRGB8_TO_LINEAR[d[i]] + 0.7152 * SRGB8_TO_LINEAR[d[i + 1]] + 0.0722 * SRGB8_TO_LINEAR[d[i + 2]]);
}

/** Mean luminance of the four corner regions relative to the centre. */
export function measureVignette(img: PixelImage): { ratio: number; symmetry: number } {
  const { width: W, height: H } = img;
  const region = (x0: number, y0: number, x1: number, y1: number) => {
    let s = 0;
    let c = 0;
    const st = Math.max(1, Math.floor((x1 - x0) / 24));
    for (let y = Math.floor(y0); y < y1; y += st)
      for (let x = Math.floor(x0); x < x1; x += st) {
        s += lumAt(img, x, y);
        c++;
      }
    return c ? s / c : 0;
  };
  const f = 0.12;
  const corners = [
    region(0, 0, W * f, H * f),
    region(W * (1 - f), 0, W, H * f),
    region(0, H * (1 - f), W * f, H),
    region(W * (1 - f), H * (1 - f), W, H),
  ];
  const centre = region(W * 0.35, H * 0.35, W * 0.65, H * 0.65);
  const mean = corners.reduce((s, v) => s + v, 0) / 4;
  const spread = Math.max(...corners) - Math.min(...corners);
  return {
    ratio: centre > 0.02 ? mean / centre : 1,
    symmetry: mean > 0.01 ? 1 - Math.min(1, spread / mean) : 0,
  };
}

/**
 * Grain: median absolute residual from a 3x3 mean in low-gradient regions of
 * a full-resolution crop. JPEG noise and sensor noise also contribute, so the
 * mapping applies a threshold and asks the vision model for confirmation.
 */
export function measureGrain(img: PixelImage): number {
  const { width: W, height: H } = img;
  const res: number[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / 60_000)));
  for (let y = 2; y < H - 2; y += step) {
    for (let x = 2; x < W - 2; x += step) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m += lumAt(img, x + dx, y + dy);
      m /= 9;
      const gx = lumAt(img, x + 2, y) - lumAt(img, x - 2, y);
      const gy = lumAt(img, x, y + 2) - lumAt(img, x, y - 2);
      if (Math.hypot(gx, gy) > 0.04) continue;
      res.push(Math.abs(lumAt(img, x, y) - m));
    }
  }
  if (res.length < 200) return 0;
  res.sort((a, b) => a - b);
  return res[Math.floor(res.length / 2)];
}

/** Detects uniform borders (UI chrome, letterboxing) and internal separators. */
export function detectBorders(img: PixelImage): {
  crop: { x: number; y: number; w: number; h: number } | null;
  uiLikely: boolean;
  internalSeparators: boolean;
} {
  const { width: W, height: H } = img;
  const rowStat = (y: number) => {
    let s = 0;
    let s2 = 0;
    const st = Math.max(1, Math.floor(W / 200));
    let c = 0;
    for (let x = 0; x < W; x += st) {
      const v = lumAt(img, x, y);
      s += v;
      s2 += v * v;
      c++;
    }
    const m = s / c;
    return Math.sqrt(Math.max(0, s2 / c - m * m));
  };
  const colStat = (x: number) => {
    let s = 0;
    let s2 = 0;
    const st = Math.max(1, Math.floor(H / 200));
    let c = 0;
    for (let y = 0; y < H; y += st) {
      const v = lumAt(img, x, y);
      s += v;
      s2 += v * v;
      c++;
    }
    const m = s / c;
    return Math.sqrt(Math.max(0, s2 / c - m * m));
  };
  const flat = 0.012;
  let top = 0;
  while (top < H * 0.4 && rowStat(top) < flat) top++;
  let bottom = H - 1;
  while (bottom > H * 0.6 && rowStat(bottom) < flat) bottom--;
  let left = 0;
  while (left < W * 0.4 && colStat(left) < flat) left++;
  let right = W - 1;
  while (right > W * 0.6 && colStat(right) < flat) right--;

  let separators = 0;
  for (let y = Math.floor(H * 0.2); y < H * 0.8; y += Math.max(1, Math.floor(H / 120))) if (rowStat(y) < flat * 0.6) separators++;
  for (let x = Math.floor(W * 0.2); x < W * 0.8; x += Math.max(1, Math.floor(W / 120))) if (colStat(x) < flat * 0.6) separators++;

  const trimmed = top + (H - 1 - bottom) + left + (W - 1 - right);
  const significant = (top + (H - 1 - bottom)) / H > 0.04 || (left + (W - 1 - right)) / W > 0.04;
  const crop = significant
    ? { x: left / W, y: top / H, w: (right - left + 1) / W, h: (bottom - top + 1) / H }
    : null;
  // Phone screenshots: tall aspect with flat bars at top and bottom.
  const uiLikely = significant && H / W > 1.6 && top > H * 0.03 && H - 1 - bottom > H * 0.03;
  return { crop: trimmed > 0 && crop && crop.w > 0.2 && crop.h > 0.2 ? crop : null, uiLikely, internalSeparators: separators >= 2 };
}

/** Share of the image in large perfectly flat regions (renders, flat illustrations). */
function illustrationScore(img: PixelImage): number {
  const { width: W, height: H, data } = img;
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / 40_000)));
  let flat = 0;
  let c = 0;
  for (let y = 0; y < H - step; y += step) {
    for (let x = 0; x < W - step; x += step) {
      const i = (y * W + x) * 4;
      const j = (y * W + x + 1) * 4;
      const k = ((y + 1) * W + x) * 4;
      const same =
        data[i] === data[j] && data[i + 1] === data[j + 1] && data[i + 2] === data[j + 2] &&
        data[i] === data[k] && data[i + 1] === data[k + 1] && data[i + 2] === data[k + 2];
      if (same) flat++;
      c++;
    }
  }
  return c ? flat / c : 0;
}

/** Hex summaries for the AI request. */
export function measuredSummary(s: ImageStats) {
  return {
    meanLuminance: Math.min(1, Math.max(0, s.meanP)),
    contrast: Math.min(1, Math.max(0, s.contrast)),
    blackFloor: Math.min(1, Math.max(0, s.blackFloor)),
    whiteCeiling: Math.min(1, Math.max(0, s.whiteCeiling)),
    meanChroma: Math.min(1, Math.max(0, s.chroma.mean)),
    warmth: Math.max(-1, Math.min(1, s.cast.b * 10)),
    dominantColors: s.palette.slice(0, 8).map((p) => p.hex),
  };
}
