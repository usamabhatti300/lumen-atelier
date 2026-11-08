/**
 * The contact-sheet share image: several edits from one project as numbered, dated frames on a
 * night-black sheet, with the wordmark at the top (Finish step, DESIGN.md). Generic on purpose: no
 * sprocket holes, film-edge text or any brand's trade dress.
 *
 * Layout is pure (tested); `drawContactSheet` draws both the Finish preview (from thumbnails) and the
 * exported image (from full renders), so the preview matches the file.
 */
import { FINISH_COLORS } from './palette';
import { drawStamp, stampText, STAMP_FONT_FAMILY, type Rect, type StampPlacement } from './stamp';

export const MAX_SHEET_FRAMES = 12;
export type SheetRatio = '4:5' | '9:16';
export const SHEET_RATIOS: { value: SheetRatio; label: string; title: string }[] = [
  { value: '4:5', label: '4:5', title: 'Portrait post' },
  { value: '9:16', label: '9:16', title: 'Story' },
];

/** Exported sheet width: 2× the common 1080 px post width, so it stays crisp on high-density screens. */
export const SHEET_WIDTH = 2160;

export function sheetSize(ratio: SheetRatio, width = SHEET_WIDTH) {
  return { width, height: Math.round(ratio === '4:5' ? (width * 5) / 4 : (width * 16) / 9) };
}

/** One column for a single frame, two for up to four (six on a tall story sheet), else three. */
export function sheetColumns(count: number, ratio: SheetRatio): number {
  if (count <= 1) return 1;
  if (count <= (ratio === '9:16' ? 6 : 4)) return 2;
  return 3;
}

export interface SheetCell {
  /** Where the frame's photo is fitted. */
  image: Rect;
  /** The caption row under it: frame number, look name, date. */
  caption: Rect;
}

export interface SheetLayout {
  width: number;
  height: number;
  pad: number;
  header: Rect;
  cols: number;
  rows: number;
  cells: SheetCell[];
}

/**
 * `aspects` (width / height per frame), when given, shrinks each row to its tallest frame and centres
 * the grid, so frames sit together like a real contact sheet instead of floating in empty cells.
 */
export function contactSheetLayout(count: number, ratio: SheetRatio, width = SHEET_WIDTH, aspects?: number[]): SheetLayout {
  const n = Math.max(0, Math.min(MAX_SHEET_FRAMES, Math.floor(count)));
  const { height } = sheetSize(ratio, width);
  const pad = Math.round(width * 0.05);
  const headerH = Math.round(width * 0.075);
  const gap = Math.round(width * 0.024);
  const captionH = Math.round(width * 0.036);
  const cols = sheetColumns(n, ratio);
  const rows = Math.max(1, Math.ceil(n / cols));
  const grid = { x: pad, y: pad + headerH + gap, w: width - pad * 2, h: height - pad * 2 - headerH - gap };
  const cellW = (grid.w - gap * (cols - 1)) / cols;
  const cellH = (grid.h - gap * (rows - 1)) / rows;
  const maxImgH = cellH - captionH;
  const rowImgH: number[] = [];
  for (let r = 0; r < rows; r++) {
    let h = aspects ? 0 : maxImgH;
    if (aspects)
      for (let i = r * cols; i < Math.min(n, (r + 1) * cols); i++) {
        const a = aspects[i] > 0 ? aspects[i] : 1;
        h = Math.max(h, Math.min(maxImgH, cellW / a));
      }
    rowImgH.push(h);
  }
  const total = rowImgH.reduce((t, h) => t + h + captionH, 0) + gap * (rows - 1);
  let y = grid.y + Math.max(0, (grid.h - total) / 2);
  const cells: SheetCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = r * cols; i < Math.min(n, (r + 1) * cols); i++) {
      const x = grid.x + (i % cols) * (cellW + gap);
      cells.push({
        image: { x, y, w: cellW, h: rowImgH[r] },
        caption: { x, y: y + rowImgH[r], w: cellW, h: captionH },
      });
    }
    y += rowImgH[r] + captionH + gap;
  }
  return { width, height, pad, header: { x: pad, y: pad, w: width - pad * 2, h: headerH }, cols, rows, cells };
}

/** The largest rectangle with the source's aspect ratio that fits in `box`, centred. */
export function fitContain(srcW: number, srcH: number, box: Rect): Rect {
  if (srcW <= 0 || srcH <= 0) return { ...box, w: 0, h: 0 };
  const s = Math.min(box.w / srcW, box.h / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** A frame's photo is held as long as the longest side of its cell needs, at most. */
export function sheetFrameLongSide(count: number, ratio: SheetRatio, width = SHEET_WIDTH): number {
  const l = contactSheetLayout(Math.max(1, count), ratio, width);
  const c = l.cells[0];
  return Math.ceil(Math.max(c.image.w, c.image.h));
}

export interface SheetFrame {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** The look on this photo, if any. */
  look?: string;
  /** `YYYY-MM-DD`: the frame's date (capture date, else today). */
  date: string;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const SANS = '"Geist Variable", ui-sans-serif, system-ui, sans-serif';

/** "11·08": a frame's month and day, as on home's contact sheet. */
export function frameDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}·${m[2]}` : '';
}

export function frameNumber(i: number): string {
  return String(i + 1).padStart(2, '0');
}

export function sheetTitle(count: number, todayIso: string): string {
  return `${count} frame${count === 1 ? '' : 's'} · ${stampText(todayIso)}`;
}

function fitText(ctx: Ctx2D, text: string, maxW: number): string {
  if (maxW <= 0) return '';
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

export function drawContactSheet(
  ctx: Ctx2D,
  layout: SheetLayout,
  frames: SheetFrame[],
  opts: { stamp: StampPlacement | null; today: string },
): void {
  const { width, height, header } = layout;
  ctx.save();
  ctx.fillStyle = FINISH_COLORS.ground;
  ctx.fillRect(0, 0, width, height);

  // Header: the wordmark ("lumen" with its hard lilac offset, "atelier" small) and the count · date.
  const markPx = Math.round(header.h * 0.62);
  const baseY = header.y + header.h * 0.78;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `400 ${markPx}px ${STAMP_FONT_FAMILY}`;
  ctx.fillStyle = FINISH_COLORS.accent;
  ctx.fillText('lumen', header.x + markPx * 0.07, baseY + markPx * 0.05);
  ctx.fillStyle = FINISH_COLORS.fg;
  ctx.fillText('lumen', header.x, baseY);
  const markW = ctx.measureText('lumen').width;
  const smallPx = Math.round(markPx * 0.36);
  ctx.font = `400 ${smallPx}px ${STAMP_FONT_FAMILY}`;
  ctx.fillStyle = FINISH_COLORS.fg3;
  ctx.fillText('atelier', header.x + markW + markPx * 0.3, baseY);
  ctx.textAlign = 'right';
  ctx.fillText(sheetTitle(frames.length, opts.today), header.x + header.w, baseY);

  layout.cells.forEach((cell, i) => {
    const f = frames[i];
    if (!f) return;
    const box = fitContain(f.width, f.height, cell.image);
    // Frames sit on the caption line, so the captions of a row line up.
    box.y = cell.image.y + cell.image.h - box.h;
    ctx.drawImage(f.image, box.x, box.y, box.w, box.h);
    if (opts.stamp) drawStamp(ctx, box, f.date, opts.stamp);

    const cap = cell.caption;
    const px = Math.round(cap.h * 0.46);
    const y = cap.y + cap.h * 0.72;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 ${px}px ${STAMP_FONT_FAMILY}`;
    ctx.fillStyle = FINISH_COLORS.fg3;
    ctx.textAlign = 'left';
    const num = frameNumber(i);
    ctx.fillText(num, box.x, y);
    const numW = ctx.measureText(num).width + px * 0.8;
    ctx.textAlign = 'right';
    const date = frameDate(f.date);
    ctx.fillText(date, box.x + box.w, y);
    const dateW = ctx.measureText(date).width + px * 0.8;
    if (f.look) {
      ctx.textAlign = 'left';
      ctx.font = `500 ${Math.round(px * 1.08)}px ${SANS}`;
      ctx.fillStyle = FINISH_COLORS.fg;
      ctx.fillText(fitText(ctx, f.look, box.w - numW - dateW), box.x + numW, y);
    }
  });
  ctx.restore();
}
