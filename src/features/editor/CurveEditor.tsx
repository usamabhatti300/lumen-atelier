/**
 * Tone-curve editor. Click the curve to add a point, drag to move, drag a
 * point off the graph or double-click it to remove. Points are focusable;
 * arrow keys nudge the focused point (Shift for larger steps), Delete removes it.
 *
 * Touch: a swipe that starts on the graph scrolls the panel (only points capture the
 * finger, through large invisible handles); a tap on the graph adds a point; a point
 * dragged by finger stays on the graph (no accidental removal) and a double tap removes it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createCurveEvaluator } from '@/lib/color/curves';
import { normalizeCurve, type CurveChannel, type CurvePoint } from '@/lib/schema/adjustments';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';

const CHANNEL_COLOR: Record<CurveChannel, string> = {
  master: 'var(--color-ivory)',
  red: '#d9776a',
  green: '#86b07e',
  blue: '#7d9bd1',
};

export function CurveEditor({ channel }: { channel: CurveChannel }) {
  const points = useEditor((s) => s.edit.adjustments.curves[channel]);
  const setAdjustment = useEditor((s) => s.setAdjustment);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const histogram = useEngine((s) => s.histogram);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const touchDrag = useRef(false);
  const lastPointTap = useRef<{ i: number; t: number } | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  // A finger on the graph background: becomes a new point if it lifts without scrolling.
  const tap = useRef<{ id: number; x: number; y: number } | null>(null);

  // `touch-action` is ignored on SVG shapes, so a finger on a point handle would also scroll
  // the panel. Cancelling the touch start (not the pointer events) keeps the panel still.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as Element).getAttribute?.('data-testid') === 'curve-point-handle') e.preventDefault();
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => el.removeEventListener('touchstart', onTouchStart);
  }, []);
  const size = 232;
  const pad = 6;
  const inner = size - pad * 2;

  const path = useMemo(() => {
    const f = createCurveEvaluator(points);
    let d = '';
    for (let i = 0; i <= 96; i++) {
      const x = i / 96;
      d += `${i ? 'L' : 'M'}${(pad + x * inner).toFixed(2)},${(pad + (1 - f(x)) * inner).toFixed(2)}`;
    }
    return d;
  }, [points, inner]);

  const histPath = useMemo(() => {
    if (!histogram) return '';
    const bins = channel === 'master' ? histogram.l : channel === 'red' ? histogram.r : channel === 'green' ? histogram.g : histogram.b;
    let max = 1;
    for (let i = 2; i < 254; i++) max = Math.max(max, bins[i]);
    let d = `M${pad},${pad + inner}`;
    for (let i = 0; i < 256; i++) {
      const h = Math.min(1, bins[i] / max);
      d += `L${(pad + (i / 255) * inner).toFixed(1)},${(pad + inner - h * inner * 0.9).toFixed(1)}`;
    }
    return `${d}L${pad + inner},${pad + inner}Z`;
  }, [histogram, channel, inner]);

  const commit = (next: CurvePoint[], label = 'Curve') => setAdjustment(`curves.${channel}`, normalizeCurve(next), label);

  const toLocal = (e: React.PointerEvent): [number, number] => {
    const rect = svg.current!.getBoundingClientRect();
    const k = size / rect.width;
    return [((e.clientX - rect.left) * k - pad) / inner, 1 - ((e.clientY - rect.top) * k - pad) / inner];
  };

  const onPointerDownBg = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') {
      tap.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    addPointAt(e, true);
  };

  const addPointAt = (e: React.PointerEvent, startDrag: boolean) => {
    const [x, y] = toLocal(e);
    if (x < 0 || x > 1) return;
    const f = createCurveEvaluator(points);
    // Add a point on the curve (or at the pointer when clicking away from it).
    const ny = Math.abs(f(x) - y) < 0.08 ? f(x) : Math.min(1, Math.max(0, y));
    if (points.length >= 16) return;
    const next = normalizeCurve([...points, [x, ny]]);
    const idx = next.findIndex((p) => Math.abs(p[0] - x) < 1e-6);
    begin('Curve point');
    commit(next);
    if (startDrag) {
      setDrag(idx);
      svg.current?.setPointerCapture(e.pointerId);
    } else end();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    const [x, y] = toLocal(e);
    const next = points.map((p) => [...p] as CurvePoint);
    const isEnd = drag === 0 || drag === points.length - 1;
    const remove = !isEnd && !touchDrag.current && (y < -0.12 || y > 1.12);
    if (remove) {
      next.splice(drag, 1);
      setDrag(null);
      commit(next);
      return;
    }
    const lo = drag > 0 ? points[drag - 1][0] + 0.01 : 0;
    const hi = drag < points.length - 1 ? points[drag + 1][0] - 0.01 : 1;
    next[drag] = [Math.min(hi, Math.max(lo, x)), Math.min(1, Math.max(0, y))];
    commit(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const t = tap.current;
    tap.current = null;
    if (t && t.id === e.pointerId && e.type === 'pointerup' && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10) addPointAt(e, false);
    if (drag !== null) {
      setDrag(null);
      end();
    }
  };

  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block aspect-square w-full max-w-[300px] touch-none select-none rounded-xs bg-ink-950 coarse:touch-pan-y"
        onPointerDown={onPointerDownBg}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="group"
        aria-label={`${channel} tone curve`}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} stroke="var(--color-line-soft)" strokeWidth={1}>
            <line x1={pad + g * inner} y1={pad} x2={pad + g * inner} y2={pad + inner} />
            <line x1={pad} y1={pad + g * inner} x2={pad + inner} y2={pad + g * inner} />
          </g>
        ))}
        <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="var(--color-line)" />
        {histPath && <path d={histPath} fill="rgba(236,230,218,0.07)" />}
        <line x1={pad} y1={pad + inner} x2={pad + inner} y2={pad} stroke="var(--color-line)" strokeDasharray="2 3" />
        <path d={path} fill="none" stroke={CHANNEL_COLOR[channel]} strokeWidth={1.6} />
        {points.map(([x, y], i) => (
          // Large invisible handle (the finger's target), drawn under the visible point.
          <circle
            key={`hit${i}`}
            cx={pad + x * inner}
            cy={pad + (1 - y) * inner}
            r={14}
            fill="transparent"
            className="cursor-grab touch-none"
            data-testid="curve-point-handle"
            onPointerDown={(e) => {
              e.stopPropagation();
              tap.current = null;
              touchDrag.current = e.pointerType === 'touch';
              if (touchDrag.current) {
                // Double tap removes a point (the browser's dblclick is suppressed for touches here).
                const last = lastPointTap.current;
                lastPointTap.current = { i, t: e.timeStamp };
                if (last && last.i === i && e.timeStamp - last.t < 350 && i > 0 && i < points.length - 1) {
                  lastPointTap.current = null;
                  commit(
                    points.filter((_, j) => j !== i),
                    'Remove curve point',
                  );
                  return;
                }
              }
              begin('Curve point');
              setDrag(i);
              svg.current?.setPointerCapture(e.pointerId);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (i === 0 || i === points.length - 1) return;
              commit(
                points.filter((_, j) => j !== i),
                'Remove curve point',
              );
            }}
          />
        ))}
        {points.map(([x, y], i) => (
          <circle
            key={i}
            cx={pad + x * inner}
            cy={pad + (1 - y) * inner}
            r={focus === i || drag === i ? 5.5 : 4.5}
            fill={drag === i ? CHANNEL_COLOR[channel] : 'var(--color-ink-900)'}
            stroke={CHANNEL_COLOR[channel]}
            strokeWidth={1.5}
            tabIndex={0}
            role="slider"
            aria-label={`Curve point ${i + 1}: input ${Math.round(x * 255)}, output ${Math.round(y * 255)}`}
            aria-valuenow={Math.round(y * 255)}
            aria-valuemin={0}
            aria-valuemax={255}
            className="pointer-events-none focus:outline-none"
            onFocus={() => setFocus(i)}
            onBlur={() => setFocus(null)}
            onPointerDown={(e) => {
              e.stopPropagation();
              begin('Curve point');
              setDrag(i);
              svg.current?.setPointerCapture(e.pointerId);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (i === 0 || i === points.length - 1) return;
              const next = points.filter((_, j) => j !== i);
              commit(next, 'Remove curve point');
            }}
            onKeyDown={(e) => {
              const step = (e.shiftKey ? 10 : 1) / 255;
              const next = points.map((p) => [...p] as CurvePoint);
              if (e.key === 'ArrowUp') next[i][1] = Math.min(1, next[i][1] + step);
              else if (e.key === 'ArrowDown') next[i][1] = Math.max(0, next[i][1] - step);
              else if (e.key === 'ArrowLeft' && i > 0 && i < points.length - 1) next[i][0] = Math.max(points[i - 1][0] + 0.01, next[i][0] - step);
              else if (e.key === 'ArrowRight' && i > 0 && i < points.length - 1) next[i][0] = Math.min(points[i + 1][0] - 0.01, next[i][0] + step);
              else if ((e.key === 'Delete' || e.key === 'Backspace') && i > 0 && i < points.length - 1) {
                next.splice(i, 1);
                commit(next, 'Remove curve point');
                return;
              } else return;
              e.preventDefault();
              commit(next, 'Curve nudge');
            }}
          />
        ))}
      </svg>
      <p className="mt-1.5 text-[11px] text-faint">
        <span className="coarse:hidden">Click to add a point. Drag a point off the graph to remove it.</span>
        <span className="hidden coarse:inline">Tap the graph to add a point, drag a point to move it, double-tap a point to remove it.</span>
      </p>
    </div>
  );
}
