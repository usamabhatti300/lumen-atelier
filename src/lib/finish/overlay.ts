/**
 * Export overlays: a camcorder or viewfinder graphic burned into an exported photo (Finish step,
 * DESIGN.md). Opt-in, generic shapes only (no brand look-alikes), sized from the photo's short side.
 *
 * Nothing is invented: the time is drawn only when the photo has a capture time and the date shown
 * is its capture date; exposure values are drawn only when EXIF has them. `drawFinishMarks` draws
 * the overlay and the date stamp together for both the Finish preview and the exported file, and
 * never draws two dates.
 */
import { OVERLAY_COLORS } from './palette';
import { drawStamp, exifDateToIso, isIsoDate, isoDate, STAMP_FONT_FAMILY, type StampPlacement } from './stamp';

export type OverlayKind = 'none' | 'camcorder' | 'viewfinder';

export const OVERLAYS: { value: OverlayKind; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'A camera-style graphic burned into the photo.' },
  { value: 'camcorder', label: 'Camcorder', description: 'REC, a battery and the date, with the time if the photo has one.' },
  { value: 'viewfinder', label: 'Viewfinder', description: 'Corner brackets and the date, with the camera settings if the photo has them.' },
];

/** The user's choice in Finish: which overlay, and the chosen date (null: each photo's own date). */
export interface OverlayChoice {
  kind: OverlayKind;
  date: string | null;
}

/** What is drawn on one photo. */
export interface OverlayOptions {
  kind: OverlayKind;
  /** `YYYY-MM-DD`, or null to leave the date out. */
  date: string | null;
  /** `HH:MM` capture time, or null when the photo has none. */
  time?: string | null;
  /** Real EXIF exposure values, already formatted (`1/250`, `F2.8`, `ISO 400`); empty when unknown. */
  exposure?: string[];
}

/** The EXIF fields an overlay can show. */
export interface OverlayExif {
  dateTime?: string;
  exposureTime?: string;
  fNumber?: string;
  iso?: number;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The overlay form of a date: `NOV 08 2026`. */
export function overlayDateText(iso: string): string {
  if (!isIsoDate(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} ${d} ${y}`;
}

/** EXIF `DateTimeOriginal` ("2024:05:01 13:22:10") as `13:22`, or null when it has no valid time. */
export function exifTime(dateTime: string | undefined): string | null {
  if (!exifDateToIso(dateTime)) return null;
  const m = /^\d{4}:\d{2}:\d{2} (\d{2}):(\d{2})/.exec(dateTime!.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1]}:${m[2]}`;
}

/** Real exposure values only: shutter, aperture, ISO, each left out when EXIF does not have it. */
export function exposureReadout(exif: OverlayExif | undefined): string[] {
  const out: string[] = [];
  if (exif?.exposureTime) out.push(exif.exposureTime.replace(/s$/, exif.exposureTime.startsWith('1/') ? '' : '"'));
  if (exif?.fNumber) out.push(exif.fNumber.replace(/^f\//, 'F'));
  if (exif?.iso && exif.iso > 0) out.push(`ISO ${exif.iso}`);
  return out;
}

/**
 * What one photo's overlay shows: the chosen date, else its capture date, else today. The capture
 * time is kept only when the date shown is the capture date (a time from another day would be made up).
 */
export function overlayOptionsFor(choice: OverlayChoice, exif: OverlayExif | undefined, today = new Date()): OverlayOptions | null {
  if (choice.kind === 'none') return null;
  const captured = exifDateToIso(exif?.dateTime);
  const date = choice.date ?? captured ?? isoDate(today);
  return {
    kind: choice.kind,
    date,
    time: date === captured ? exifTime(exif?.dateTime) : null,
    exposure: exposureReadout(exif),
  };
}

/** Sizes and anchor points, all from the short side so the overlay reads the same at any resolution. */
export function overlayLayout(width: number, height: number) {
  const short = Math.min(width, height);
  const fontPx = Math.max(8, Math.round(short * 0.042));
  const margin = Math.round(short * 0.05);
  const line = Math.max(1, Math.round(short * 0.005));
  return {
    short,
    fontPx,
    margin,
    line,
    lineGap: Math.round(fontPx * 1.35),
    rec: { r: Math.max(2, Math.round(fontPx * 0.36)) },
    battery: { w: Math.round(fontPx * 1.9), h: Math.round(fontPx * 0.9) },
    /** Viewfinder brackets sit further in than the date stamp, so the two never touch. */
    bracket: { inset: Math.round(short * 0.12), arm: Math.round(short * 0.09) },
    cross: Math.round(short * 0.025),
    smallFontPx: Math.max(7, Math.round(short * 0.032)),
  };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** White with a soft dark edge, so it reads on bright and dark photos alike. */
function ink(ctx: Ctx2D, fontPx: number) {
  ctx.fillStyle = OVERLAY_COLORS.ink;
  ctx.strokeStyle = OVERLAY_COLORS.ink;
  ctx.shadowColor = OVERLAY_COLORS.edge;
  ctx.shadowBlur = Math.max(1, fontPx * 0.18);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(1, Math.round(fontPx * 0.04));
}

function drawCamcorder(ctx: Ctx2D, width: number, height: number, o: OverlayOptions) {
  const l = overlayLayout(width, height);
  ink(ctx, l.fontPx);
  ctx.font = `500 ${l.fontPx}px ${STAMP_FONT_FAMILY}`;

  // Top left: the recording dot and REC.
  const cy = l.margin + l.fontPx / 2;
  ctx.fillStyle = OVERLAY_COLORS.rec;
  ctx.beginPath();
  ctx.arc(l.margin + l.rec.r, cy, l.rec.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = OVERLAY_COLORS.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('REC', l.margin + l.rec.r * 2 + Math.round(l.fontPx * 0.4), cy);

  // Top right: a battery, three of four cells full.
  const b = l.battery;
  const nub = Math.max(1, Math.round(b.w * 0.07));
  const bx = width - l.margin - nub - b.w;
  const by = Math.round(cy - b.h / 2);
  ctx.lineWidth = l.line;
  ctx.strokeRect(bx, by, b.w, b.h);
  ctx.fillRect(bx + b.w, by + Math.round(b.h * 0.3), nub, Math.round(b.h * 0.4));
  const pad = l.line * 1.5;
  const cell = (b.w - pad * 5) / 4;
  for (let i = 0; i < 3; i++) ctx.fillRect(bx + pad + i * (cell + pad), by + pad, cell, b.h - pad * 2);

  // Bottom left: the time (only a real one) above the date.
  const date = o.date ? overlayDateText(o.date) : '';
  ctx.textBaseline = 'alphabetic';
  const y = height - l.margin;
  if (date) ctx.fillText(date, l.margin, y);
  if (o.time) ctx.fillText(o.time, l.margin, date ? y - l.lineGap : y);
}

function drawViewfinder(ctx: Ctx2D, width: number, height: number, o: OverlayOptions) {
  const l = overlayLayout(width, height);
  ink(ctx, l.fontPx);
  ctx.lineWidth = l.line;
  const { inset, arm } = l.bracket;
  const x0 = inset;
  const y0 = inset;
  const x1 = width - inset;
  const y1 = height - inset;

  // Four corner brackets.
  const corners: [number, number, number, number][] = [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x1, y1, -1, -1],
    [x0, y1, 1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * arm);
    ctx.stroke();
  }

  // A small focus cross in the centre.
  const cx = width / 2;
  const cy = height / 2;
  ctx.beginPath();
  ctx.moveTo(cx - l.cross, cy);
  ctx.lineTo(cx + l.cross, cy);
  ctx.moveTo(cx, cy - l.cross);
  ctx.lineTo(cx, cy + l.cross);
  ctx.stroke();

  // Inside the lower-left bracket: real camera settings (if any) above the date (if wanted).
  const lines = [o.exposure?.length ? o.exposure.join('  ') : '', o.date ? overlayDateText(o.date) : ''].filter(Boolean);
  ctx.font = `500 ${l.smallFontPx}px ${STAMP_FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const pad = Math.round(l.smallFontPx * 0.9);
  lines.reverse().forEach((text, i) => ctx.fillText(text, x0 + pad, y1 - pad - i * Math.round(l.smallFontPx * 1.4)));
}

/** Draws the chosen overlay over a `width` × `height` image; `none` draws nothing. */
export function drawOverlay(ctx: Ctx2D, width: number, height: number, options: OverlayOptions): void {
  if (options.kind === 'none') return;
  ctx.save();
  if (options.kind === 'camcorder') drawCamcorder(ctx, width, height, options);
  else drawViewfinder(ctx, width, height, options);
  ctx.restore();
}

/** Whether the orange date stamp is drawn with this overlay: the camcorder shows the date itself. */
export function stampAllowed(kind: OverlayKind | undefined): boolean {
  return kind !== 'camcorder';
}

/**
 * Everything Finish adds to one photo, for the preview and the export alike. One date at most:
 * the camcorder's own date replaces the orange stamp; the viewfinder leaves its date out when the
 * stamp is on.
 */
export function drawFinishMarks(
  ctx: Ctx2D,
  width: number,
  height: number,
  marks: { stamp?: { placement: StampPlacement; date: string } | null; overlay?: OverlayOptions | null },
): void {
  const overlay = marks.overlay && marks.overlay.kind !== 'none' ? marks.overlay : null;
  const stamp = marks.stamp && stampAllowed(overlay?.kind) ? marks.stamp : null;
  if (overlay) drawOverlay(ctx, width, height, stamp ? { ...overlay, date: null } : overlay);
  if (stamp) drawStamp(ctx, { x: 0, y: 0, w: width, h: height }, stamp.date, stamp.placement);
}
