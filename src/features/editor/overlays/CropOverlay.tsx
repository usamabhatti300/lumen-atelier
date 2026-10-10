/**
 * Crop tool overlay. The canvas shows the whole straightened frame; the
 * rectangle is the crop in frame-normalized coordinates. Drag inside to move,
 * drag corners/edges to resize (aspect lock respected). Moves that would put
 * the crop outside the rotated image are rejected.
 */
import { useRef } from 'react';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { clampCrop, cropFitsRotation, frameSize } from '@/lib/engine/geometry';
import type { CropRect } from '@/lib/schema/adjustments';
import type { ViewBox } from '../Viewport';

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function CropOverlay({ box }: { box: ViewBox }) {
  const geometry = useEditor((s) => s.edit.geometry);
  const setGeometry = useEditor((s) => s.setGeometry);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const full = useEngine((s) => s.fullSize);
  const drag = useRef<{ handle: Handle; start: CropRect; x: number; y: number } | null>(null);
  if (!full) return null;
  const frame = frameSize(full, geometry);
  const c = geometry.crop;
  const aspect = geometry.aspect; // pixel aspect w/h

  const apply = (handle: Handle, start: CropRect, dx: number, dy: number) => {
    let { x, y, w, h } = start;
    if (handle === 'move') {
      x += dx;
      y += dy;
      return clampCrop({ x, y, w, h });
    }
    if (handle.includes('e')) w += dx;
    if (handle.includes('w')) {
      x += dx;
      w -= dx;
    }
    if (handle.includes('s')) h += dy;
    if (handle.includes('n')) {
      y += dy;
      h -= dy;
    }
    w = Math.max(0.02, w);
    h = Math.max(0.02, h);
    if (aspect) {
      // Keep the pixel aspect: derive the dependent dimension from the dominant drag.
      const hFromW = (w * frame.width) / aspect / frame.height;
      const wFromH = (h * aspect * frame.height) / frame.width;
      if (handle === 'n' || handle === 's') w = wFromH;
      else h = hFromW;
      if (handle.includes('n')) y = start.y + start.h - h;
      if (handle.includes('w')) x = start.x + start.w - w;
      if (handle === 'n' || handle === 's') x = start.x + (start.w - w) / 2;
      if (handle === 'e' || handle === 'w') y = start.y + (start.h - h) / 2;
    }
    if (x < 0 || y < 0 || x + w > 1 || y + h > 1) return null;
    return { x, y, w, h };
  };

  const startDrag = (handle: Handle, e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, start: c, x: e.clientX, y: e.clientY };
    begin('Crop');
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = apply(d.handle, d.start, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height);
    if (next && cropFitsRotation(next, geometry.straighten, frame)) setGeometry({ crop: next }, 'Crop');
  };
  const onUp = () => {
    if (drag.current) end();
    drag.current = null;
  };

  const style = { left: box.left + c.x * box.width, top: box.top + c.y * box.height, width: c.w * box.width, height: c.h * box.height };
  const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const pos: Record<string, string> = {
    nw: 'left-0 top-0 cursor-nwse-resize',
    n: 'left-1/2 top-0 cursor-ns-resize',
    ne: 'left-full top-0 cursor-nesw-resize',
    e: 'left-full top-1/2 cursor-ew-resize',
    se: 'left-full top-full cursor-nwse-resize',
    s: 'left-1/2 top-full cursor-ns-resize',
    sw: 'left-0 top-full cursor-nesw-resize',
    w: 'left-0 top-1/2 cursor-ew-resize',
  };

  return (
    <div className="absolute inset-0 overflow-hidden" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div
        className="absolute cursor-move touch-none shadow-[0_0_0_9999px_rgba(13,12,11,0.62)] outline outline-1 outline-ivory/90"
        style={style}
        onPointerDown={(e) => startDrag('move', e)}
        role="group"
        aria-label="Crop rectangle"
        tabIndex={0}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.02 : 0.004;
          const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const d = delta[e.key];
          if (!d) return;
          e.preventDefault();
          const next = clampCrop({ ...c, x: c.x + d[0], y: c.y + d[1] });
          if (cropFitsRotation(next, geometry.straighten, frame)) setGeometry({ crop: next }, 'Nudge crop');
        }}
      >
        {[1, 2].map((i) => (
          <div key={`v${i}`} className="pointer-events-none absolute top-0 h-full w-px bg-ivory/25" style={{ left: `${(i * 100) / 3}%` }} />
        ))}
        {[1, 2].map((i) => (
          <div key={`h${i}`} className="pointer-events-none absolute left-0 h-px w-full bg-ivory/25" style={{ top: `${(i * 100) / 3}%` }} />
        ))}
        {handles.map((h) => (
          <div
            key={h}
            onPointerDown={(e) => startDrag(h, e)}
            className={`absolute h-4 w-4 -translate-1/2 touch-none ${pos[h]}`}
            aria-hidden
          >
            <span className={`absolute top-1/2 left-1/2 -translate-1/2 bg-ivory ${h.length === 2 ? 'h-2.5 w-2.5' : h === 'n' || h === 's' ? 'h-1 w-4' : 'h-4 w-1'}`} />
          </div>
        ))}
        <span className="tabular pointer-events-none absolute -bottom-6 left-0 font-mono text-[10px] text-ivory/80">
          {Math.round(c.w * frame.width)} × {Math.round(c.h * frame.height)}
        </span>
      </div>
    </div>
  );
}
