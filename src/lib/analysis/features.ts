/**
 * Match features: the compact colour/tone description that reference
 * matching compares (src/lib/analysis/match.ts). The same function measures
 * the reference, the target and every trial render of the target, so the
 * comparison is like-for-like.
 */
import { SRGB8_TO_LINEAR, linearToSrgb, srgbToLinear } from '../color/srgb';
import { linearSrgbToOklab } from '../color/oklab';
import { HUE_BINS, LUM_QUANTILES, type HueBin, type MatchFeatures } from '../schema/matchFeatures';
import type { PixelImage } from './stats';

export { HUE_BINS, LUM_QUANTILES, type MatchFeatures };

/** Chroma above which a pixel counts as "coloured" (hue statistics). */
export const CHROMATIC_MIN = 0.03;
/** Chroma below which a pixel counts as near-neutral (zone tints). */
export const NEUTRAL_MAX = 0.06;
/** Chroma below which a pixel counts as colourless (global cast). */
export const CAST_MAX = 0.035;
/** OKLab lightness limits of the shadow / midtone / highlight zones. */
export const ZONE_SPLITS = [0.42, 0.72] as const;

/** Per-pixel OKLab measurements of a sample (structure of arrays). */
export interface LabSample {
  n: number;
  /** Perceptual (sRGB-encoded) luminance. */
  p: Float32Array;
  L: Float32Array;
  a: Float32Array;
  b: Float32Array;
  C: Float32Array;
  /** Hue in degrees 0..360. */
  h: Float32Array;
}

export function allocSample(n: number): LabSample {
  return {
    n,
    p: new Float32Array(n),
    L: new Float32Array(n),
    a: new Float32Array(n),
    b: new Float32Array(n),
    C: new Float32Array(n),
    h: new Float32Array(n),
  };
}

/** Writes one linear-RGB pixel into a sample slot. */
export function setSamplePixel(s: LabSample, i: number, r: number, g: number, b: number) {
  const [L, A, B] = linearSrgbToOklab(Math.max(0, r), Math.max(0, g), Math.max(0, b));
  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  s.p[i] = linearToSrgb(Math.min(1, Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b)));
  s.L[i] = L;
  s.a[i] = A;
  s.b[i] = B;
  s.C[i] = C;
  s.h[i] = h;
}

/** Linear-RGB pixels (3 floats each) of an image, subsampled to at most `maxPixels`. */
export function linearPixels(img: PixelImage, maxPixels = 40_000): Float32Array {
  const total = img.width * img.height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / maxPixels)));
  const out: number[] = [];
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < 128) continue;
      out.push(
        SRGB8_TO_LINEAR[img.data[i]],
        SRGB8_TO_LINEAR[img.data[i + 1]],
        SRGB8_TO_LINEAR[img.data[i + 2]],
      );
    }
  return Float32Array.from(out);
}

export function sampleFromLinear(lin: Float32Array): LabSample {
  const n = lin.length / 3;
  const s = allocSample(n);
  for (let i = 0; i < n; i++) setSamplePixel(s, i, lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]);
  return s;
}

/** Sample from display-encoded float RGB (0..1, 3 per pixel), e.g. a trial render. */
export function sampleFromDisplay(disp: Float32Array, into?: LabSample): LabSample {
  const n = disp.length / 3;
  const s = into ?? allocSample(n);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    setSamplePixel(
      s,
      i,
      srgbToLinear(Math.min(1, Math.max(0, disp[o]))),
      srgbToLinear(Math.min(1, Math.max(0, disp[o + 1]))),
      srgbToLinear(Math.min(1, Math.max(0, disp[o + 2]))),
    );
  }
  return s;
}

export function sampleFromImage(img: PixelImage, maxPixels = 40_000): LabSample {
  return sampleFromLinear(linearPixels(img, maxPixels));
}

export const hueDiff = (a: number, b: number) => {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
};

export function quantilesOf(
  values: Float32Array,
  qs: readonly number[],
  mask?: Uint8Array,
): number[] {
  let arr: Float32Array;
  if (mask) {
    const tmp: number[] = [];
    for (let i = 0; i < values.length; i++) if (mask[i]) tmp.push(values[i]);
    arr = Float32Array.from(tmp);
  } else arr = values.slice();
  arr.sort();
  if (!arr.length) return qs.map(() => 0);
  return qs.map(
    (q) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(q * (arr.length - 1))))],
  );
}

export interface ZoneTint {
  a: number;
  b: number;
  s: number;
}

/** Near-neutral zone tints; `exclude` marks pixels to leave out (e.g. protected colours). */
export function zoneTints(s: LabSample, exclude?: Uint8Array): [ZoneTint, ZoneTint, ZoneTint] {
  const acc = [0, 0, 0].map(() => ({ a: 0, b: 0, c: 0 }));
  for (let i = 0; i < s.n; i++) {
    if (s.C[i] >= NEUTRAL_MAX || exclude?.[i]) continue;
    const z = s.L[i] < ZONE_SPLITS[0] ? 0 : s.L[i] < ZONE_SPLITS[1] ? 1 : 2;
    acc[z].a += s.a[i];
    acc[z].b += s.b[i];
    acc[z].c++;
  }
  const n = Math.max(1, s.n);
  return acc.map((z) =>
    z.c ? { a: z.a / z.c, b: z.b / z.c, s: z.c / n } : { a: 0, b: 0, s: 0 },
  ) as [ZoneTint, ZoneTint, ZoneTint];
}

export function hueBins(s: LabSample): HueBin[] {
  const acc = Array.from({ length: HUE_BINS }, () => ({ n: 0, C: 0, L: 0, a: 0, b: 0 }));
  let chromatic = 0;
  const width = 360 / HUE_BINS;
  for (let i = 0; i < s.n; i++) {
    if (s.C[i] < CHROMATIC_MIN) continue;
    chromatic++;
    const k = Math.min(HUE_BINS - 1, Math.floor(s.h[i] / width));
    const q = acc[k];
    q.n++;
    q.C += s.C[i];
    q.L += s.L[i];
    q.a += s.a[i] / s.C[i];
    q.b += s.b[i] / s.C[i];
  }
  return acc.map((q, k) => {
    if (!q.n) return { w: 0, C: 0, L: 0, h: (k + 0.5) * width };
    let h = (Math.atan2(q.b, q.a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return {
      w: q.n / Math.max(1, chromatic),
      C: Math.min(0.5, q.C / q.n),
      L: Math.min(1, Math.max(0, q.L / q.n)),
      h: Math.min(360, h),
    };
  });
}

export function computeMatchFeatures(s: LabSample): MatchFeatures {
  const lum = quantilesOf(s.p, LUM_QUANTILES).map((v) => Math.min(1, Math.max(0, v)));
  const cq = quantilesOf(s.C, [0.5, 0.9]);
  let sumC = 0;
  let sumL = 0;
  let chromatic = 0;
  let ca = 0;
  let cb = 0;
  let cn = 0;
  for (let i = 0; i < s.n; i++) {
    sumC += s.C[i];
    sumL += s.L[i];
    if (s.C[i] >= CHROMATIC_MIN) chromatic++;
    if (s.C[i] < CAST_MAX) {
      ca += s.a[i];
      cb += s.b[i];
      cn++;
    }
  }
  const n = Math.max(1, s.n);
  const cl = (v: number) => Math.min(0.5, Math.max(0, v));
  const zones = zoneTints(s);
  return {
    v: 1,
    lum,
    Lmean: Math.min(1, Math.max(0, sumL / n)),
    chroma: { p50: cl(cq[0]), mean: cl(sumC / n), p90: cl(cq[1]) },
    chromatic: chromatic / n,
    cast: cn ? { a: ca / cn, b: cb / cn, s: cn / n } : { a: 0, b: 0, s: 0 },
    zones,
    hues: hueBins(s),
    mono: cq[1] < 0.02,
  };
}

export function featuresFromImage(img: PixelImage): MatchFeatures {
  return computeMatchFeatures(sampleFromImage(img));
}
