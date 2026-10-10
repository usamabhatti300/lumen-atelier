/**
 * Tone curves: monotone cubic (Fritsch-Carlson) interpolation through control
 * points, so curves never overshoot or invert between points. Curves are
 * evaluated in display-referred (sRGB-encoded) space, as users expect from
 * Lightroom/Photoshop curves, and baked into 256-entry lookup tables.
 */
import type { CurvePoint } from '../schema/adjustments';

export function createCurveEvaluator(points: CurvePoint[]): (x: number) => number {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  if (n === 0) return (x) => x;
  if (n === 1) return () => pts[0][1];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    d.push(dx > 0 ? (ys[i + 1] - ys[i]) / dx : 0);
  }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const y =
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1];
    return Math.min(1, Math.max(0, y));
  };
}

export const CURVE_LUT_SIZE = 256;

export function bakeCurve(points: CurvePoint[], size = CURVE_LUT_SIZE): Float32Array {
  const f = createCurveEvaluator(points);
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = f(i / (size - 1));
  return out;
}

/** Linear-interpolated LUT lookup for v in 0..1. */
export function sampleLut(lut: Float32Array, v: number): number {
  const x = Math.min(1, Math.max(0, v)) * (lut.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return i >= lut.length - 1 ? lut[lut.length - 1] : lut[i] * (1 - f) + lut[i + 1] * f;
}

/**
 * Blend two curves by evaluating both at the union of their x positions and
 * interpolating y. Used for preset intensity.
 */
export function blendCurves(a: CurvePoint[], b: CurvePoint[], t: number): CurvePoint[] {
  if (t <= 0) return a.map((p) => [...p] as CurvePoint);
  if (t >= 1) return b.map((p) => [...p] as CurvePoint);
  const fa = createCurveEvaluator(a);
  const fb = createCurveEvaluator(b);
  const xs = new Set<number>([0, 1, ...a.map((p) => p[0]), ...b.map((p) => p[0])]);
  const sorted = [...xs].sort((p, q) => p - q);
  const picked = sorted.length > 16 ? downsample(sorted, 16) : sorted;
  return picked.map((x) => [x, fa(x) * (1 - t) + fb(x) * t] as CurvePoint);
}

function downsample(xs: number[], count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(xs[Math.round((i * (xs.length - 1)) / (count - 1))]);
  return [...new Set(out)];
}
