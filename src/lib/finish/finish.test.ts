import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FINISH_COLORS, FINISH_TOKENS } from './palette';
import { defaultStampDate, drawStamp, exifDateToIso, isIsoDate, isoDate, stampLayout, stampText } from './stamp';
import {
  contactSheetLayout,
  drawContactSheet,
  fitContain,
  frameDate,
  MAX_SHEET_FRAMES,
  sheetColumns,
  sheetFrameLongSide,
  sheetSize,
  sheetTitle,
} from './contactSheet';

/** A 2D context that records fillText calls and the style in force for each. */
function recordingCtx() {
  const texts: { text: string; x: number; y: number; fill: string; font: string; align: string }[] = [];
  const images: { x: number; y: number; w: number; h: number }[] = [];
  const rects: { fill: string; w: number; h: number }[] = [];
  const stack: Record<string, unknown>[] = [];
  const ctx = {
    font: '10px sans-serif',
    fillStyle: '#000',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    save() {
      stack.push({ font: this.font, fillStyle: this.fillStyle, textAlign: this.textAlign, textBaseline: this.textBaseline, shadowBlur: this.shadowBlur });
    },
    restore() {
      Object.assign(this, stack.pop());
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, fill: String(this.fillStyle), font: this.font, align: String(this.textAlign) });
    },
    fillRect(_x: number, _y: number, w: number, h: number) {
      rects.push({ fill: String(this.fillStyle), w, h });
    },
    drawImage(_img: unknown, x: number, y: number, w: number, h: number) {
      images.push({ x, y, w, h });
    },
    measureText(text: string) {
      const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
      return { width: text.length * px * 0.6 };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, images, rects };
}

describe('palette', () => {
  it('mirrors the role tokens in index.css', () => {
    const css = readFileSync('src/styles/index.css', 'utf8');
    for (const [key, token] of Object.entries(FINISH_TOKENS)) {
      const m = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);
      expect(m?.[1].toLowerCase(), token).toBe(FINISH_COLORS[key as keyof typeof FINISH_COLORS]);
    }
  });
});

describe('date stamp', () => {
  it('formats dates as a digicam stamp', () => {
    expect(stampText('2026-11-08')).toBe("'26 11 08");
    expect(stampText('1999-01-31')).toBe("'99 01 31");
    expect(stampText('nonsense')).toBe('');
  });

  it('validates ISO dates', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
  });

  it('reads the EXIF capture date, ignoring missing or zeroed dates', () => {
    expect(exifDateToIso('2024:05:01 13:22:10')).toBe('2024-05-01');
    expect(exifDateToIso('0000:00:00 00:00:00')).toBeNull();
    expect(exifDateToIso('2024:02:30 10:00:00')).toBeNull();
    expect(exifDateToIso(undefined)).toBeNull();
  });

  it('defaults to the capture date, else today', () => {
    const today = new Date(2026, 10, 8, 23, 59);
    expect(defaultStampDate('2019:07:14 09:00:00', today)).toBe('2019-07-14');
    expect(defaultStampDate(undefined, today)).toBe('2026-11-08');
    expect(isoDate(today)).toBe('2026-11-08');
  });

  it('places the stamp in the chosen corner, sized from the short side', () => {
    const box = { x: 0, y: 0, w: 4000, h: 3000 };
    const br = stampLayout(box, 'bottom-right');
    expect(br.fontPx).toBe(126);
    expect(br).toMatchObject({ align: 'right', baseline: 'alphabetic', x: 4000 - 135, y: 3000 - 135 });
    expect(stampLayout(box, 'top-left')).toMatchObject({ align: 'left', baseline: 'top', x: 135, y: 135 });
    // Same proportions at preview size.
    const small = stampLayout({ x: 10, y: 20, w: 400, h: 300 }, 'bottom-left');
    expect(small.fontPx).toBe(13);
    expect(small).toMatchObject({ x: 10 + 14, y: 20 + 300 - 14 });
    // Never unreadably small.
    expect(stampLayout({ x: 0, y: 0, w: 60, h: 40 }, 'top-right').fontPx).toBe(8);
  });

  it('draws the stamp in orange and leaves the context as it was', () => {
    const { ctx, texts } = recordingCtx();
    ctx.fillStyle = '#123456';
    drawStamp(ctx, { x: 0, y: 0, w: 1000, h: 800 }, '2026-11-08', 'bottom-right');
    expect(texts).toEqual([expect.objectContaining({ text: "'26 11 08", fill: FINISH_COLORS.stamp, align: 'right' })]);
    expect(texts[0].font).toContain('Martian Mono');
    expect(ctx.fillStyle).toBe('#123456');
  });

  it('draws nothing for an invalid date', () => {
    const { ctx, texts } = recordingCtx();
    drawStamp(ctx, { x: 0, y: 0, w: 100, h: 100 }, '', 'top-left');
    expect(texts).toHaveLength(0);
  });
});

describe('contact sheet', () => {
  it('has post and story sizes', () => {
    expect(sheetSize('4:5')).toEqual({ width: 2160, height: 2700 });
    expect(sheetSize('9:16')).toEqual({ width: 2160, height: 3840 });
  });

  it('picks columns from the frame count', () => {
    expect([1, 2, 4, 5, 12].map((n) => sheetColumns(n, '4:5'))).toEqual([1, 2, 2, 3, 3]);
    expect(sheetColumns(6, '9:16')).toBe(2);
    expect(sheetColumns(7, '9:16')).toBe(3);
  });

  it('lays out non-overlapping cells inside the margins, capped at 12 frames', () => {
    for (const ratio of ['4:5', '9:16'] as const) {
      for (const n of [1, 2, 3, 5, 9, 12, 20]) {
        const l = contactSheetLayout(n, ratio);
        expect(l.cells).toHaveLength(Math.min(n, MAX_SHEET_FRAMES));
        for (const c of l.cells) {
          expect(c.image.x).toBeGreaterThanOrEqual(l.pad - 0.001);
          expect(c.image.x + c.image.w).toBeLessThanOrEqual(l.width - l.pad + 0.001);
          expect(c.image.y).toBeGreaterThan(l.header.y + l.header.h);
          expect(c.caption.y + c.caption.h).toBeLessThanOrEqual(l.height - l.pad + 0.001);
          expect(c.caption.y).toBeCloseTo(c.image.y + c.image.h);
        }
        for (let i = 1; i < l.cells.length; i++) {
          const a = l.cells[i - 1];
          const b = l.cells[i];
          const sameRow = Math.abs(a.image.y - b.image.y) < 0.001;
          if (sameRow) expect(b.image.x).toBeGreaterThan(a.image.x + a.image.w);
          else expect(b.image.y).toBeGreaterThan(a.caption.y + a.caption.h);
        }
      }
    }
  });

  it('shrinks rows to their frames and centres the grid when frame shapes are known', () => {
    const loose = contactSheetLayout(3, '4:5', 2160);
    const tight = contactSheetLayout(3, '4:5', 2160, [1.5, 2 / 3, 1]);
    // Row 1 holds a landscape and a portrait frame: the portrait sets its height.
    expect(tight.cells[0].image.h).toBeCloseTo(Math.min(loose.cells[0].image.h, tight.cells[1].image.w * 1.5));
    expect(tight.cells[2].image.h).toBeCloseTo(tight.cells[2].image.w);
    const top = tight.cells[0].image.y - (tight.header.y + tight.header.h);
    const bottom = tight.height - tight.pad - (tight.cells[2].caption.y + tight.cells[2].caption.h);
    expect(top).toBeGreaterThan(0);
    expect(Math.abs(top - bottom)).toBeLessThan(Math.round(2160 * 0.024) + 1);
    // A wide row is shorter than the uniform cell.
    const wide = contactSheetLayout(2, '4:5', 2160, [3, 3]);
    expect(wide.cells[0].image.h).toBeLessThan(contactSheetLayout(2, '4:5', 2160).cells[0].image.h);
  });

    it('fits frames without cropping or stretching', () => {
    const box = { x: 10, y: 10, w: 200, h: 100 };
    const r = fitContain(400, 400, box);
    expect(r).toEqual({ x: 60, y: 10, w: 100, h: 100 });
    const wide = fitContain(1600, 400, box);
    expect(wide.w).toBe(200);
    expect(wide.h).toBe(50);
  });

  it('asks for frames no larger than their cell', () => {
    expect(sheetFrameLongSide(1, '4:5')).toBeLessThanOrEqual(2700);
    expect(sheetFrameLongSide(1, '4:5')).toBeGreaterThan(2000);
    expect(sheetFrameLongSide(12, '4:5')).toBeLessThan(sheetFrameLongSide(4, '4:5'));
  });

  it('draws numbered, dated frames with the wordmark and optional stamps', () => {
    const { ctx, texts, images, rects } = recordingCtx();
    const layout = contactSheetLayout(3, '4:5', 1080);
    const frames = [
      { image: {} as CanvasImageSource, width: 400, height: 300, look: 'Velvet Slide', date: '2026-11-08' },
      { image: {} as CanvasImageSource, width: 300, height: 400, date: '2025-07-01' },
      { image: {} as CanvasImageSource, width: 500, height: 500, look: 'A very long look name that cannot possibly fit', date: '2026-01-02' },
    ];
    drawContactSheet(ctx, layout, frames, { stamp: 'bottom-right', today: '2026-11-08' });
    expect(rects[0]).toEqual({ fill: FINISH_COLORS.ground, w: 1080, h: 1350 });
    expect(images).toHaveLength(3);
    const words = texts.map((t) => t.text);
    expect(words).toContain('lumen');
    expect(words).toContain(sheetTitle(3, '2026-11-08'));
    expect(words).toEqual(expect.arrayContaining(['01', '02', '03', '11·08', '07·01', '01·02', 'Velvet Slide']));
    // The long name is shortened to fit its frame.
    expect(words.find((w) => w.startsWith('A very'))).toMatch(/…$/);
    // One orange stamp per frame, each inside its frame.
    const stamps = texts.filter((t) => t.fill === FINISH_COLORS.stamp);
    expect(stamps.map((s) => s.text)).toEqual(["'26 11 08", "'25 07 01", "'26 01 02"]);
    stamps.forEach((s, i) => {
      expect(s.x).toBeLessThanOrEqual(images[i].x + images[i].w);
      expect(s.y).toBeLessThanOrEqual(images[i].y + images[i].h);
    });
    // Orange is only ever used for the stamps.
    expect(texts.filter((t) => t.fill === FINISH_COLORS.stamp)).toHaveLength(3);
  });

  it('draws no stamps when the stamp is off', () => {
    const { ctx, texts } = recordingCtx();
    drawContactSheet(ctx, contactSheetLayout(1, '9:16', 540), [{ image: {} as CanvasImageSource, width: 10, height: 10, date: '2026-11-08' }], {
      stamp: null,
      today: '2026-11-08',
    });
    expect(texts.some((t) => t.fill === FINISH_COLORS.stamp)).toBe(false);
  });

  it('formats frame dates as month·day', () => {
    expect(frameDate('2026-11-08')).toBe('11·08');
    expect(frameDate('bad')).toBe('');
  });
});
