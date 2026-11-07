/** Colour swatches and slider tracks for the HSL bands (shared by the Colour panel and the phone one-slider view). */
import { HSL_BAND_HUES, HSL_BANDS } from '@/lib/schema/adjustments';
import { oklchHueSwatch } from '@/lib/color/oklab';
import { linearToSrgb } from '@/lib/color/srgb';

const css = (rgb: number[]) => `rgb(${rgb.map((v) => Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255)).join(',')})`;
export const bandColor = (h: number, L = 0.7, C = 0.13) => css(oklchHueSwatch(h, L, C));

export const BAND_LABEL: Record<string, string> = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', aqua: 'Aqua', blue: 'Blue', purple: 'Purple', magenta: 'Magenta',
};

export function hslTrack(band: (typeof HSL_BANDS)[number], mode: 'hue' | 'saturation' | 'luminance') {
  const h = HSL_BAND_HUES[band];
  if (mode === 'hue') return `linear-gradient(90deg, ${bandColor(h - 30)}, ${bandColor(h)}, ${bandColor(h + 30)})`;
  if (mode === 'saturation') return `linear-gradient(90deg, ${bandColor(h, 0.7, 0)}, ${bandColor(h, 0.7, 0.16)})`;
  return `linear-gradient(90deg, ${bandColor(h, 0.35, 0.08)}, ${bandColor(h, 0.92, 0.06)})`;
}
