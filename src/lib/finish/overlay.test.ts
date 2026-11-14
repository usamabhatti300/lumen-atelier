import { describe, expect, it } from 'vitest';
import { FINISH_COLORS, OVERLAY_COLORS } from './palette';
import {
  drawFinishMarks,
  drawOverlay,
  exifTime,
  exposureReadout,
  overlayDateText,
  overlayLayout,
  overlayOptionsFor,
  type OverlayOptions,
} from './overlay';

/** A 2D context that records what is drawn and the style in force for each call. */
function recordingCtx() {
  const texts: { text: string; x: number; y: number; fill: string; font: string }[] = [];
  const arcs: { x: number; y: number; r: number; fill: string }[] = [];
  const rects: { x: number; y: number; w: number; h: number; fill: string; stroked: boolean }[] = [];
  /** Each stroked path as its list of points. */
  const strokes: { points: [number, number][]; stroke: string; lineWidth: number }[] = [];
  let path: [number, number][] = [];
  let pendingArc: { x: number; y: number; r: number } | null = null;
  const stack: Record<string, unknown>[] = [];
  const KEYS = ['font', 'fillStyle', 'strokeStyle', 'textAlign', 'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'lineWidth'] as const;
  const ctx = {
    font: '10px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    save() {
      stack.push(Object.fromEntries(KEYS.map((k) => [k, this[k]])));
    },
    restore() {
      Object.assign(this, stack.pop());
    },
    beginPath() {
      path = [];
      pendingArc = null;
    },
    moveTo(x: number, y: number) {
      path.push([x, y]);
    },
    lineTo(x: number, y: number) {
      path.push([x, y]);
    },
    arc(x: number, y: number, r: number) {
      pendingArc = { x, y, r };
    },
    fill() {
      if (pendingArc) arcs.push({ ...pendingArc, fill: String(this.fillStyle) });
    },
    stroke() {
      strokes.push({ points: [...path], stroke: String(this.strokeStyle), lineWidth: this.lineWidth });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, fill: String(this.fillStyle), font: this.font });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: String(this.fillStyle), stroked: false });
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: String(this.strokeStyle), stroked: true });
    },
  };
  const drawn = () => texts.length + arcs.length + rects.length + strokes.length;
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, arcs, rects, strokes, drawn };
}

const W = 4000;
const H = 3000;
const cam = (over: Partial<OverlayOptions> = {}): OverlayOptions => ({ kind: 'camcorder', date: '2024-05-01', time: '13:22', exposure: [], ...over });
const fontPx = (font: string) => Number(/(\d+)px/.exec(font)?.[1]);

describe('overlay data', () => {
  it('formats the date with a month name, so day and month cannot be confused', () => {
    expect(overlayDateText('2026-11-08')).toBe('NOV 08 2026');
    expect(overlayDateText('2024-01-31')).toBe('JAN 31 2024');
    expect(overlayDateText('nonsense')).toBe('');
  });

  it('reads the capture time from EXIF, or nothing', () => {
    expect(exifTime('2024:05:01 13:22:10')).toBe('13:22');
    expect(exifTime('2024:05:01')).toBeNull();
    expect(exifTime('2024:05:01 25:99:00')).toBeNull();
    expect(exifTime('0000:00:00 00:00:00')).toBeNull();
    expect(exifTime(undefined)).toBeNull();
  });

  it('shows only the exposure values EXIF has', () => {
    expect(exposureReadout({ exposureTime: '1/250s', fNumber: 'f/2.8', iso: 400 })).toEqual(['1/250', 'F2.8', 'ISO 400']);
    expect(exposureReadout({ exposureTime: '2.0s' })).toEqual(['2.0"']);
    expect(exposureReadout({ iso: 0 })).toEqual([]);
    expect(exposureReadout(undefined)).toEqual([]);
  });

  it('uses the capture date and time, else today with no time', () => {
    const today = new Date(2026, 10, 14, 9, 30);
    const exif = { dateTime: '2019:07:14 09:05:00', iso: 200 };
    expect(overlayOptionsFor({ kind: 'none', date: null }, exif, today)).toBeNull();
    expect(overlayOptionsFor({ kind: 'camcorder', date: null }, exif, today)).toEqual({ kind: 'camcorder', date: '2019-07-14', time: '09:05', exposure: ['ISO 200'] });
    // No capture date: today, and no invented time or settings.
    expect(overlayOptionsFor({ kind: 'viewfinder', date: null }, undefined, today)).toEqual({ kind: 'viewfinder', date: '2026-11-14', time: null, exposure: [] });
    // A date the user picked is not the capture day, so the capture time is dropped.
    expect(overlayOptionsFor({ kind: 'camcorder', date: '2020-01-01' }, exif, today)).toMatchObject({ date: '2020-01-01', time: null });
    expect(overlayOptionsFor({ kind: 'camcorder', date: '2019-07-14' }, exif, today)).toMatchObject({ time: '09:05' });
  });
});

describe('overlay drawing', () => {
  it('scales with the short side', () => {
    const big = overlayLayout(4000, 3000);
    const small = overlayLayout(400, 300);
    expect(big).toMatchObject({ fontPx: 126, margin: 150, line: 15 });
    expect(small).toMatchObject({ fontPx: 13, margin: 15, line: 2 });
    // Portrait and landscape of the same short side match.
    expect(overlayLayout(3000, 4000)).toEqual(big);
    expect(big.bracket.inset / 3000).toBeCloseTo(small.bracket.inset / 300, 2);
    // Never unreadably small.
    expect(overlayLayout(60, 40).fontPx).toBe(8);
  });

  it('none draws nothing', () => {
    const r = recordingCtx();
    drawOverlay(r.ctx, W, H, { kind: 'none', date: '2024-05-01', time: '13:22' });
    drawFinishMarks(r.ctx, W, H, { overlay: { kind: 'none', date: '2024-05-01' }, stamp: null });
    drawFinishMarks(r.ctx, W, H, {});
    expect(r.drawn()).toBe(0);
  });

  it('camcorder: a red dot and REC top left, a battery top right, time and date bottom left', () => {
    const r = recordingCtx();
    r.ctx.fillStyle = '#123456';
    drawOverlay(r.ctx, W, H, cam());
    // The recording dot is the only red thing.
    expect(r.arcs).toHaveLength(1);
    expect(r.arcs[0].fill).toBe(OVERLAY_COLORS.rec);
    expect(r.arcs[0].x).toBeLessThan(W * 0.1);
    expect(r.arcs[0].y).toBeLessThan(H * 0.1);
    const rec = r.texts.find((t) => t.text === 'REC')!;
    expect(rec.x).toBeGreaterThan(r.arcs[0].x + r.arcs[0].r);
    expect(rec.x).toBeLessThan(W * 0.15);
    expect(rec.font).toContain('Martian Mono');
    // Battery: an outline in the top-right corner, a nub, and three of four cells.
    const body = r.rects.find((b) => b.stroked)!;
    expect(body.x).toBeGreaterThan(W * 0.85);
    expect(body.x + body.w).toBeLessThanOrEqual(W - overlayLayout(W, H).margin);
    expect(body.y).toBeLessThan(H * 0.1);
    const cells = r.rects.filter((b) => !b.stroked && b.x >= body.x && b.x + b.w <= body.x + body.w);
    expect(cells).toHaveLength(3);
    expect(cells[2].x + cells[2].w).toBeLessThan(body.x + body.w * 0.8);
    // Timestamp, bottom left: the time on the line above the date.
    const date = r.texts.find((t) => t.text === 'MAY 01 2024')!;
    const time = r.texts.find((t) => t.text === '13:22')!;
    expect(date.x).toBeLessThan(W * 0.1);
    expect(date.y).toBeGreaterThan(H * 0.9);
    expect(time.x).toBe(date.x);
    expect(time.y).toBeLessThan(date.y);
    expect(time.y).toBeGreaterThan(H * 0.85);
    // White everywhere but the dot; never orange; the context is left as it was.
    expect(r.texts.every((t) => t.fill === OVERLAY_COLORS.ink)).toBe(true);
    expect(r.rects.every((b) => b.fill === OVERLAY_COLORS.ink)).toBe(true);
    expect(r.ctx.fillStyle).toBe('#123456');
    expect(r.ctx.shadowBlur).toBe(0);
  });

  it('camcorder: no time is drawn when the photo has no capture time', () => {
    const r = recordingCtx();
    drawOverlay(r.ctx, W, H, cam({ time: null }));
    expect(r.texts.map((t) => t.text)).toEqual(['REC', 'MAY 01 2024']);
  });

  it('camcorder: looks the same at preview size', () => {
    const big = recordingCtx();
    const small = recordingCtx();
    drawOverlay(big.ctx, W, H, cam());
    drawOverlay(small.ctx, W / 10, H / 10, cam());
    expect(small.texts.map((t) => t.text)).toEqual(big.texts.map((t) => t.text));
    big.texts.forEach((t, i) => {
      expect(small.texts[i].x / (W / 10)).toBeCloseTo(t.x / W, 2);
      expect(small.texts[i].y / (H / 10)).toBeCloseTo(t.y / H, 2);
      expect(fontPx(small.texts[i].font) / (H / 10)).toBeCloseTo(fontPx(t.font) / H, 2);
    });
    expect(small.arcs[0].r / (H / 10)).toBeCloseTo(big.arcs[0].r / H, 2);
  });

  it('viewfinder: four corner brackets, a centre cross and the date; no made-up settings', () => {
    const r = recordingCtx();
    drawOverlay(r.ctx, W, H, { kind: 'viewfinder', date: '2024-05-01', time: '13:22', exposure: [] });
    const { inset } = overlayLayout(W, H).bracket;
    const brackets = r.strokes.filter((s) => s.points.length === 3);
    // Each bracket turns at its corner point.
    expect(brackets.map((b) => b.points[1])).toEqual([
      [inset, inset],
      [W - inset, inset],
      [W - inset, H - inset],
      [inset, H - inset],
    ]);
    for (const b of brackets) {
      expect(b.stroke).toBe(OVERLAY_COLORS.ink);
      // Arms point into the picture.
      for (const [x, y] of b.points) {
        expect(x).toBeGreaterThanOrEqual(inset);
        expect(x).toBeLessThanOrEqual(W - inset);
        expect(y).toBeGreaterThanOrEqual(inset);
        expect(y).toBeLessThanOrEqual(H - inset);
      }
    }
    const cross = r.strokes.find((s) => s.points.length === 4)!;
    expect(cross.points.every(([x, y]) => Math.abs(x - W / 2) < W * 0.03 && Math.abs(y - H / 2) < H * 0.03)).toBe(true);
    // Only the date: no time, no ISO / shutter / aperture, no red.
    expect(r.texts.map((t) => t.text)).toEqual(['MAY 01 2024']);
    expect(r.texts[0].x).toBeGreaterThan(inset);
    expect(r.texts[0].y).toBeLessThan(H - inset);
    expect(r.arcs).toHaveLength(0);
  });

  it('viewfinder: shows real exposure values above the date', () => {
    const r = recordingCtx();
    drawOverlay(r.ctx, W, H, { kind: 'viewfinder', date: '2024-05-01', exposure: ['1/250', 'F2.8', 'ISO 400'] });
    const exposure = r.texts.find((t) => t.text === '1/250  F2.8  ISO 400')!;
    const date = r.texts.find((t) => t.text === 'MAY 01 2024')!;
    expect(exposure.y).toBeLessThan(date.y);
    expect(exposure.x).toBe(date.x);
  });
});

describe('overlay with the date stamp', () => {
  const stamp = { placement: 'bottom-right' as const, date: '2024-05-01' };

  it('camcorder + stamp draws one date: the camcorder shows it, the orange stamp is left out', () => {
    const r = recordingCtx();
    drawFinishMarks(r.ctx, W, H, { stamp, overlay: cam() });
    expect(r.texts.filter((t) => t.fill === FINISH_COLORS.stamp)).toHaveLength(0);
    expect(r.texts.filter((t) => /2024|'24/.test(t.text)).map((t) => t.text)).toEqual(['MAY 01 2024']);
  });

  it('viewfinder + stamp draws one date: the orange stamp, clear of the brackets', () => {
    const r = recordingCtx();
    drawFinishMarks(r.ctx, W, H, { stamp, overlay: { kind: 'viewfinder', date: '2024-05-01', exposure: ['ISO 400'] } });
    const dates = r.texts.filter((t) => /2024|'24/.test(t.text));
    expect(dates).toEqual([expect.objectContaining({ text: "'24 05 01", fill: FINISH_COLORS.stamp })]);
    expect(r.texts.map((t) => t.text)).toContain('ISO 400');
    expect(r.strokes.filter((s) => s.points.length === 3)).toHaveLength(4);
    // The stamp sits in the margin outside the brackets.
    const l = overlayLayout(W, H);
    expect(dates[0].y).toBeGreaterThan(H - l.bracket.inset);
    expect(dates[0].y - fontPx(dates[0].font)).toBeGreaterThan(H - l.bracket.inset);
  });

  it('the stamp alone is unchanged', () => {
    const r = recordingCtx();
    drawFinishMarks(r.ctx, W, H, { stamp, overlay: null });
    expect(r.texts).toEqual([expect.objectContaining({ text: "'24 05 01", fill: FINISH_COLORS.stamp })]);
    expect(r.drawn()).toBe(1);
  });
});
