/**
 * Temperature/tint to linear-light channel multipliers.
 *
 * A smooth, deterministic approximation of camera white balance in linear
 * sRGB: temperature trades red against blue, tint trades green against
 * magenta. Multipliers are normalized so that a neutral grey keeps its
 * luminance, which keeps white balance independent from exposure.
 */
import { LUMA_B, LUMA_G, LUMA_R } from './srgb';

export function whiteBalanceMultipliers(
  temperature: number,
  tint: number,
): [number, number, number] {
  const t = temperature / 100;
  const g = tint / 100;
  const r = Math.pow(2, 0.42 * t + 0.12 * g);
  const gr = Math.pow(2, 0.04 * t - 0.3 * g);
  const b = Math.pow(2, -0.62 * t + 0.12 * g);
  const norm = LUMA_R * r + LUMA_G * gr + LUMA_B * b;
  return [r / norm, gr / norm, b / norm];
}
