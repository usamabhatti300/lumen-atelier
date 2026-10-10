/**
 * Remove brush on the canvas. Each stroke becomes a removal (Shift adds the
 * stroke to the previous one) that MI-GAN fills from its surroundings.
 * Strokes are stored in source-image coordinates, so they stay attached to
 * the photo across crops and rotations. Painted areas that are still being
 * filled are shown with a soft amber wash.
 */
import { useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { useRemovalStatus } from '@/engine/removalPreview';
import { apply, outputSize, outputToSourceMatrix, sourceToOutputMatrix } from '@/lib/engine/geometry';
import { activeRemovals, simplifyStroke } from '@/lib/removal/removal';
import { REMOVAL_LIMITS, type RemovalStroke } from '@/lib/schema/adjustments';
import type { ViewBox } from '../Viewport';

export function RemoveToolOverlay({ box }: { box: ViewBox }) {
  const geometry = useEditor((s) => s.edit.geometry);
  const removals = useEditor((s) => s.edit.removals);
  const size = useEditor((s) => s.brush.size);
  const addRemoval = useEditor((s) => s.addRemoval);
  const full = useEngine((s) => s.fullSize);
  const status = useRemovalStatus();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<RemovalStroke | null>(null);
  const drawing = useRef<{ stroke: RemovalStroke; append: boolean } | null>(null);

  const m = useMemo(() => (full ? outputToSourceMatrix(full, geometry) : null), [full, geometry]);
  const inv = useMemo(() => (full ? sourceToOutputMatrix(full, geometry) : null), [full, geometry]);
  if (!full || !m || !inv) return null;
  const longEdge = Math.max(full.width, full.height);
  const cssPerFullPx = box.width / outputSize(full, geometry).width;
  const cssFor = (s: number) => Math.max(2, s * longEdge * cssPerFullPx);

  const toSrc = (e: React.PointerEvent): [number, number] => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return apply(m, (e.clientX - rect.left - box.left) / box.width, (e.clientY - rect.top - box.top) / box.height);
  };
  const toScreen = (p: [number, number]) => {
    const [u, v] = apply(inv, p[0], p[1]);
    return [box.left + u * box.width, box.top + v * box.height] as const;
  };
  const pathOf = (s: RemovalStroke) =>
    s.points.map((p, i) => `${i ? 'L' : 'M'}${toScreen(p).join(' ')}`).join(' ') + (s.points.length === 1 ? ' l0.01 0' : '');

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const stroke: RemovalStroke = { size, points: [toSrc(e)] };
    drawing.current = { stroke, append: e.shiftKey };
    setLive(stroke);
  };

  const onMove = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const d = drawing.current;
    if (!d || d.stroke.points.length >= REMOVAL_LIMITS.points) return;
    const s = toSrc(e);
    const last = d.stroke.points[d.stroke.points.length - 1];
    if (Math.hypot((s[0] - last[0]) * full.width, (s[1] - last[1]) * full.height) / longEdge < d.stroke.size * 0.08) return;
    d.stroke = { ...d.stroke, points: [...d.stroke.points, s] };
    setLive(d.stroke);
  };

  const onUp = () => {
    const d = drawing.current;
    drawing.current = null;
    setLive(null);
    if (!d) return;
    addRemoval({ size: d.stroke.size, points: simplifyStroke(d.stroke.points, full.width, full.height, d.stroke.size * 0.12) }, d.append);
  };

  const applied = new Set(status.applied);
  const working = status.phase === 'download' || status.phase === 'inpaint';
  const pending = activeRemovals(removals).filter((r) => !applied.has(r.id));
  const shown = [...pending.flatMap((r) => r.strokes), ...(live ? [live] : [])];

  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => setCursor(null)}
      data-testid="remove-overlay"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <g className={working ? 'motion-safe:animate-pulse' : undefined}>
          {shown.map((s, i) => (
            <path
              key={i}
              d={pathOf(s)}
              fill="none"
              stroke="var(--color-amber)"
              strokeOpacity={0.5}
              strokeWidth={cssFor(s.size)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
        {cursor && (
          <g>
            <circle cx={cursor.x} cy={cursor.y} r={cssFor(size) / 2} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={2.5} />
            <circle cx={cursor.x} cy={cursor.y} r={cssFor(size) / 2} fill="none" stroke="var(--color-ivory)" strokeWidth={1} />
          </g>
        )}
      </svg>
      {working && (
        <p
          className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-xs bg-ink-950/85 px-2.5 py-1 text-xs text-ivory-dim"
          role="status"
        >
          <Loader2 size={12} className="animate-spin text-amber" />
          {status.phase === 'download' ? 'Loading the removal model…' : 'Removing…'}
        </p>
      )}
    </div>
  );
}
