/**
 * Tone-curve editor. Click the curve to add a point, drag to move, drag a
 * point off the graph or double-click it to remove. Points are focusable;
 * arrow keys nudge the focused point (Shift for larger steps), Delete removes it.
 */
import { useMemo, useRef, useState } from 'react';
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
  const [focus, setFocus] = useState<number | null>(null);
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
    setDrag(idx);
    svg.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    const [x, y] = toLocal(e);
    const next = points.map((p) => [...p] as CurvePoint);
    const isEnd = drag === 0 || drag === points.length - 1;
    const remove = !isEnd && (y < -0.12 || y > 1.12);
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

  const onPointerUp = () => {
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
        className="aspect-square w-full touch-none select-none rounded-xs bg-ink-950"
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
            className="cursor-grab focus:outline-none"
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
      <p className="mt-1.5 text-[11px] text-faint">Click to add a point. Drag a point off the graph to remove it.</p>
    </div>
  );
}
