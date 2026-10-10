/**
 * OKLab / OKLCh (Björn Ottosson, 2020): a perceptual colour space used for
 * hue-band (HSL) adjustments, vibrance/saturation and colour grading, so that
 * equal slider steps produce roughly equal perceived changes across hues.
 * Input/output is LINEAR sRGB.
 */
export type Vec3 = [number, number, number];

export function linearSrgbToOklab(r: number, g: number, b: number): Vec3 {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

export function oklabToLinearSrgb(L: number, a: number, b: number): Vec3 {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Returns [L, C, h in degrees]. */
export function oklabToOklch(L: number, a: number, b: number): Vec3 {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

export function oklchToOklab(L: number, C: number, h: number): Vec3 {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

/** Signed smallest difference a-b in degrees, in (-180, 180]. */
export function hueDelta(a: number, b: number): number {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/** Display colour (sRGB hex) for an OKLCh hue at a pleasant L/C, used by UI swatches. */
export function oklchHueSwatch(h: number, L = 0.72, C = 0.12): [number, number, number] {
  const [, a, b] = oklchToOklab(L, C, h);
  return oklabToLinearSrgb(L, a, b);
}
