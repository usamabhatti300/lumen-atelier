/**
 * The export date stamp: the digicam date burned into an exported photo (Finish step, DESIGN.md).
 *
 * Opt-in, orange, one of four corners, with the date the user picks (by default the photo's capture
 * date from EXIF, else today). Dates are plain `YYYY-MM-DD` strings so time zones never shift a day.
 * The same `drawStamp` draws the Finish preview and the exported file, so what you see is what you get.
 */
import { FINISH_COLORS } from './palette';

export type StampPlacement = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export const STAMP_PLACEMENTS: { value: StampPlacement; label: string }[] = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
];

export interface StampOptions {
  placement: StampPlacement;
  /** `YYYY-MM-DD`, or null for each photo's own date (capture date, else today). */
  date: string | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** A local date as `YYYY-MM-DD`. */
export function isoDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** EXIF `DateTimeOriginal` ("2024:05:01 13:22:10") as `YYYY-MM-DD`, or null when missing or invalid. */
export function exifDateToIso(dateTime: string | undefined): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(dateTime?.trim() ?? '');
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return isIsoDate(iso) && m[1] !== '0000' ? iso : null;
}

/** The stamp's default date: when the photo was taken, else today. */
export function defaultStampDate(exifDateTime: string | undefined, today = new Date()): string {
  return exifDateToIso(exifDateTime) ?? isoDate(today);
}

/** The digicam form of a date: `'26 11 08`. */
export function stampText(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) return '';
  return `'${m[1].slice(2)} ${m[2]} ${m[3]}`;
}

/** Where the stamp goes inside `box`, sized from the box's short side so it reads the same at any resolution. */
export function stampLayout(box: Rect, placement: StampPlacement) {
  const short = Math.min(box.w, box.h);
  const fontPx = Math.max(8, Math.round(short * 0.042));
  const margin = Math.round(short * 0.045);
  const right = placement.endsWith('right');
  const bottom = placement.startsWith('bottom');
  return {
    fontPx,
    x: right ? box.x + box.w - margin : box.x + margin,
    y: bottom ? box.y + box.h - margin : box.y + margin,
    align: (right ? 'right' : 'left') as CanvasTextAlign,
    baseline: (bottom ? 'alphabetic' : 'top') as CanvasTextBaseline,
  };
}

export const STAMP_FONT_FAMILY = '"Martian Mono Variable", ui-monospace, monospace';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws the orange stamp, with the faint bleed of a real digicam stamp (as on the chosen look tile). */
export function drawStamp(ctx: Ctx2D, box: Rect, iso: string, placement: StampPlacement): void {
  const text = stampText(iso);
  if (!text) return;
  const l = stampLayout(box, placement);
  ctx.save();
  ctx.font = `500 ${l.fontPx}px ${STAMP_FONT_FAMILY}`;
  ctx.textAlign = l.align;
  ctx.textBaseline = l.baseline;
  ctx.fillStyle = FINISH_COLORS.stamp;
  ctx.shadowColor = 'rgba(242, 153, 74, 0.35)';
  ctx.shadowBlur = Math.max(1, l.fontPx * 0.3);
  ctx.fillText(text, l.x, l.y);
  ctx.restore();
}

/** Canvas text uses only fonts that have loaded; load the stamp (and sheet) faces first. */
export async function loadFinishFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('500 40px "Martian Mono Variable"'),
      document.fonts.load('400 40px "Martian Mono Variable"'),
      document.fonts.load('500 40px "Geist Variable"'),
    ]);
  } catch {
    // A missing font falls back to the system monospace; the stamp still draws.
  }
}
