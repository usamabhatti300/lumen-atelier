/** IEC 61966-2-1 sRGB transfer functions (exact piecewise form). */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  if (v <= 0) return 0;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** Rec. 709 / sRGB luminance coefficients for linear RGB. */
export const LUMA_R = 0.2126;
export const LUMA_G = 0.7152;
export const LUMA_B = 0.0722;

export function luminance(r: number, g: number, b: number): number {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b;
}

/** 256-entry lookup for decoding 8-bit sRGB to linear. */
export const SRGB8_TO_LINEAR = new Float32Array(256).map((_, i) => srgbToLinear(i / 255));

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
