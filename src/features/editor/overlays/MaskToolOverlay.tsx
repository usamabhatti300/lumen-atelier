/**
 * Pointer tools on the canvas: brush / linear gradient / radial gradient for
 * the active mask layer, and the healing tool. Screen positions are mapped to
 * source-image coordinates through the geometry matrix, so strokes stay
 * attached to the photo across crops and rotations.
 */
import { useMemo, useRef, useState } from 'react';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { engine } from '@/engine/controller';
import { apply, outputSize, outputToSourceMatrix, sourceToOutputMatrix } from '@/lib/engine/geometry';
import { bitmapToImageData } from '@/lib/image/decode';
import { findHealOffset, type PixelSource } from '@/lib/retouch/heal';
import { newId } from '@/lib/storage/db';
import type { BrushComponent, MaskComponent } from '@/lib/schema/adjustments';
import type { ViewBox } from '../Viewport';
import { ObjectToolChip } from '@/features/masks/selectObject';
import { objectClick } from '@/features/masks/selectObjectActions';
import { touchMods } from './touchMode';

let healCache: { photoId: string; img: PixelSource } | null = null;
function healPixels(): PixelSource | null {
  const id = engine.getActivePhotoId();
  const bmp = engine.getPreviewBitmap();
  if (!id || !bmp) return null;
  if (healCache?.photoId !== id) healCache = { photoId: id, img: bitmapToImageData(bmp, 1400) };
  return healCache.img;
}

export function MaskToolOverlay({ box }: { box: ViewBox }) {
  const tool = useEditor((s) => s.tool);
  const geometry = useEditor((s) => s.edit.geometry);
  const brush = useEditor((s) => s.brush);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const layer = useEditor((s) => s.edit.layers.find((l) => l.id === s.activeLayerId));
  const spots = useEditor((s) => s.edit.retouch.spots);
  const setLiveStroke = useEditor((s) => s.setLiveStroke);
  const addComponent = useEditor((s) => s.addMaskComponent);
  const addSpot = useEditor((s) => s.addSpot);
  const removeSpot = useEditor((s) => s.removeSpot);
  const full = useEngine((s) => s.fullSize);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<MaskComponent | null>(null);
  const drawing = useRef<{ comp: MaskComponent; startUv: [number, number] } | null>(null);

  const m = useMemo(() => (full ? outputToSourceMatrix(full, geometry) : null), [full, geometry]);
  const inv = useMemo(() => (full ? sourceToOutputMatrix(full, geometry) : null), [full, geometry]);
  if (!full || !m || !inv) return null;
  const longEdge = Math.max(full.width, full.height);
  const outFull = outputSize(full, geometry);
  const cssPerFullPx = box.width / outFull.width;
  const brushCss = brush.size * longEdge * cssPerFullPx;

  const toUv = (e: React.PointerEvent): [number, number] => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [(e.clientX - rect.left - box.left) / box.width, (e.clientY - rect.top - box.top) / box.height];
  };
  const toSrc = (uv: [number, number]) => apply(m, uv[0], uv[1]);
  const toScreen = (s: [number, number]) => {
    const [u, v] = apply(inv, s[0], s[1]);
    return { x: box.left + u * box.width, y: box.top + v * box.height };
  };
  const srcDist = (a: [number, number], b: [number, number]) =>
    Math.hypot((a[0] - b[0]) * full.width, (a[1] - b[1]) * full.height) / longEdge;

  const needsLayer = tool === 'brush' || tool === 'linear' || tool === 'radial' || tool === 'object';
  const disabled = needsLayer && !activeLayerId;

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || disabled) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const uv = toUv(e);
    const s = toSrc(uv);
    if (tool === 'object') {
      if (s[0] >= 0 && s[0] <= 1 && s[1] >= 0 && s[1] <= 1) objectClick(s[0], s[1], touchMods(e));
      return;
    }
    if (tool === 'heal') {
      if (touchMods(e).altKey) {
        // Touch "Delete spot" mode: remove the spot under the finger (rings are hard to hit exactly).
        const at = toScreen(s);
        const hit = spots.find((sp) => {
          const t = toScreen([sp.x, sp.y]);
          return Math.hypot(t.x - at.x, t.y - at.y) <= Math.max(22, sp.r * longEdge * cssPerFullPx);
        });
        if (hit) removeSpot(hit.id);
        return;
      }
      const img = healPixels();
      if (!img) return;
      const r = brush.size / 2;
      const off = findHealOffset(img, { x: s[0], y: s[1], r });
      addSpot({ x: s[0], y: s[1], r, dx: off.dx, dy: off.dy });
      return;
    }
    let comp: MaskComponent;
    if (tool === 'brush') {
      comp = { type: 'brush', id: newId('c_'), mode: brush.mode, size: brush.size, softness: brush.softness, opacity: brush.opacity, points: [s] };
    } else if (tool === 'linear') {
      comp = { type: 'linear', id: newId('c_'), mode: 'add', x0: s[0], y0: s[1], x1: s[0], y1: s[1] + 0.001 };
    } else {
      comp = { type: 'radial', id: newId('c_'), mode: 'add', cx: s[0], cy: s[1], rx: 0.01, ry: 0.01, rotation: 0, feather: 0.5, invert: false };
    }
    drawing.current = { comp, startUv: uv };
    setLive(comp);
    setLiveStroke(comp);
  };

  const onMove = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const d = drawing.current;
    if (!d) return;
    const s = toSrc(toUv(e));
    let next: MaskComponent = d.comp;
    if (d.comp.type === 'brush') {
      const pts = d.comp.points;
      const last = pts[pts.length - 1];
      if (srcDist(last, s) < d.comp.size * 0.08) return;
      next = { ...d.comp, points: [...pts, s] } as BrushComponent;
    } else if (d.comp.type === 'linear') {
      next = { ...d.comp, x1: s[0], y1: s[1] };
    } else if (d.comp.type === 'radial') {
      const r = Math.max(0.005, srcDist([d.comp.cx, d.comp.cy], s));
      next = { ...d.comp, rx: r, ry: r };
    }
    d.comp = next;
    setLive(next);
    setLiveStroke(next);
  };

  const onUp = () => {
    const d = drawing.current;
    drawing.current = null;
    setLive(null);
    setLiveStroke(null);
    if (d && activeLayerId) addComponent(activeLayerId, d.comp);
  };

  const shapes = [...(layer?.components ?? []), ...(live ? [live] : [])];

  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: disabled ? 'not-allowed' : tool === 'brush' || tool === 'heal' ? 'none' : 'crosshair' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => setCursor(null)}
      data-testid="tool-overlay"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {tool !== 'heal' &&
          shapes.map((c) => {
            if (c.type === 'linear') {
              const a = toScreen([c.x0, c.y0]);
              const b = toScreen([c.x1, c.y1]);
              return (
                <g key={c.id} stroke="var(--color-champagne)" strokeWidth={1.2}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray="4 3" />
                  <circle cx={a.x} cy={a.y} r={4} fill="var(--color-champagne)" />
                  <circle cx={b.x} cy={b.y} r={4} fill="none" />
                </g>
              );
            }
            if (c.type === 'radial') {
              const ctr = toScreen([c.cx, c.cy]);
              const r = c.rx * longEdge * cssPerFullPx;
              return (
                <g key={c.id} stroke="var(--color-champagne)" strokeWidth={1.2} fill="none">
                  <circle cx={ctr.x} cy={ctr.y} r={r} />
                  <circle cx={ctr.x} cy={ctr.y} r={r * (1 - c.feather)} strokeDasharray="3 3" opacity={0.6} />
                  <circle cx={ctr.x} cy={ctr.y} r={3} fill="var(--color-champagne)" />
                </g>
              );
            }
            return null;
          })}
        {tool === 'object' &&
          shapes.flatMap((c) =>
            c.type === 'object'
              ? c.points.map((p, i) => {
                  const t = toScreen([p.x, p.y]);
                  return (
                    <g key={`${c.id}-${i}`} data-testid={p.include ? 'object-point-include' : 'object-point-exclude'}>
                      <circle cx={t.x} cy={t.y} r={7} fill="#000" fillOpacity={0.35} />
                      <circle cx={t.x} cy={t.y} r={5.5} fill={p.include ? 'var(--color-amber)' : 'var(--color-ink-950)'} stroke="var(--color-ivory)" strokeWidth={1.4} />
                      <line x1={t.x - 2.5} y1={t.y} x2={t.x + 2.5} y2={t.y} stroke={p.include ? 'var(--color-ink-950)' : 'var(--color-ivory)'} strokeWidth={1.4} />
                      {p.include && <line x1={t.x} y1={t.y - 2.5} x2={t.x} y2={t.y + 2.5} stroke="var(--color-ink-950)" strokeWidth={1.4} />}
                    </g>
                  );
                })
              : [],
          )}
        {tool === 'heal' &&
          spots.map((sp) => {
            const t = toScreen([sp.x, sp.y]);
            const s = toScreen([sp.x + sp.dx, sp.y + sp.dy]);
            const r = sp.r * longEdge * cssPerFullPx;
            return (
              <g key={sp.id}>
                <line x1={t.x} y1={t.y} x2={s.x} y2={s.y} stroke="var(--color-ivory)" strokeOpacity={0.4} />
                <circle cx={s.x} cy={s.y} r={r} fill="none" stroke="var(--color-ivory)" strokeOpacity={0.5} strokeDasharray="3 3" />
                <circle
                  cx={t.x}
                  cy={t.y}
                  r={r}
                  fill="none"
                  stroke="var(--color-champagne)"
                  strokeWidth={1.4}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(e) => {
                    if (touchMods(e).altKey) {
                      e.stopPropagation();
                      removeSpot(sp.id);
                    }
                  }}
                />
              </g>
            );
          })}
        {cursor && (tool === 'brush' || tool === 'heal') && (
          <g>
            <circle cx={cursor.x} cy={cursor.y} r={Math.max(2, brushCss / 2)} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={2.5} />
            <circle cx={cursor.x} cy={cursor.y} r={Math.max(2, brushCss / 2)} fill="none" stroke="var(--color-ivory)" strokeWidth={1} />
            {tool === 'brush' && brush.softness > 0.05 && (
              <circle cx={cursor.x} cy={cursor.y} r={Math.max(1, (brushCss / 2) * (1 - brush.softness * 0.6))} fill="none" stroke="var(--color-ivory)" strokeOpacity={0.45} strokeDasharray="2 3" />
            )}
            {tool === 'brush' && brush.mode === 'erase' && (
              <line x1={cursor.x - 4} y1={cursor.y} x2={cursor.x + 4} y2={cursor.y} stroke="var(--color-ivory)" />
            )}
          </g>
        )}
      </svg>
      {tool === 'object' && !disabled && <ObjectToolChip />}
      {disabled && (
        <p className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-xs bg-ink-950/85 px-2.5 py-1 text-xs text-mute">
          Select or add a mask layer first.
        </p>
      )}
    </div>
  );
}
