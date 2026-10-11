/**
 * Colour-grading wheel. Angle = OKLCh hue, distance from centre = saturation.
 * Pointer drag, keyboard (arrows: hue ←/→, saturation ↑/↓; Shift for larger
 * steps) and double-click to reset.
 */
import { memo, useMemo, useRef } from 'react';
import { oklchHueSwatch } from '@/lib/color/oklab';
import { linearToSrgb } from '@/lib/color/srgb';
import type { GradeWheel } from '@/lib/schema/adjustments';

function hueCss(h: number, L = 0.72, C = 0.13) {
  const [r, g, b] = oklchHueSwatch(h, L, C).map((v) => Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255));
  return `rgb(${r},${g},${b})`;
}

export const ColorWheel = memo(function ColorWheel({
  value,
  onChange,
  onStart,
  onEnd,
  size = 112,
  label,
}: {
  value: GradeWheel;
  onChange: (v: GradeWheel) => void;
  onStart?: () => void;
  onEnd?: () => void;
  size?: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const tap = useRef<{ id: number; x: number; y: number } | null>(null);
  const gradient = useMemo(() => {
    const stops: string[] = [];
    for (let a = 0; a <= 360; a += 15) stops.push(`${hueCss((360 - a) % 360)} ${a}deg`);
    return `radial-gradient(circle, rgba(40,37,34,1) 0%, rgba(40,37,34,0.0) 72%), conic-gradient(from 90deg, ${stops.join(',')})`;
  }, []);
  const r = size / 2;
  const rad = (value.hue * Math.PI) / 180;
  const px = r + Math.cos(rad) * (value.saturation / 100) * (r - 6);
  const py = r - Math.sin(rad) * (value.saturation / 100) * (r - 6);

  const fromPointer = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - r;
    const y = -(e.clientY - rect.top - r);
    const dist = Math.min(1, Math.hypot(x, y) / (r - 6));
    let hue = (Math.atan2(y, x) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    onChange({ ...value, hue: Math.round(hue), saturation: Math.round(dist * 100) });
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={`${label} colour wheel`}
      aria-valuetext={`hue ${Math.round(value.hue)} degrees, saturation ${Math.round(value.saturation)}`}
      aria-valuenow={Math.round(value.saturation)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative shrink-0 cursor-crosshair touch-none rounded-full ring-1 ring-line coarse:touch-pan-y"
      style={{ width: size, height: size, background: gradient }}
      onPointerDown={(e) => {
        // Touch: dragging starts only from the marker (its handle blocks scrolling); a swipe
        // elsewhere scrolls the panel and a tap moves the marker there.
        if (e.pointerType === 'touch' && !(e.target as HTMLElement).dataset.puck) {
          tap.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          return;
        }
        (e.target as Element).setPointerCapture(e.pointerId);
        dragging.current = true;
        onStart?.();
        fromPointer(e);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={(e) => {
        const t = tap.current;
        tap.current = null;
        if (t && t.id === e.pointerId && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10) {
          onStart?.();
          fromPointer(e);
          onEnd?.();
        }
        if (dragging.current) {
          dragging.current = false;
          onEnd?.();
        }
      }}
      onPointerCancel={() => {
        tap.current = null;
        if (dragging.current) {
          dragging.current = false;
          onEnd?.();
        }
      }}
      onDoubleClick={() => {
        onStart?.();
        onChange({ ...value, hue: 0, saturation: 0 });
        onEnd?.();
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 2;
        let { hue, saturation } = value;
        if (e.key === 'ArrowLeft') hue = (hue + step) % 360;
        else if (e.key === 'ArrowRight') hue = (hue - step + 360) % 360;
        else if (e.key === 'ArrowUp') saturation = Math.min(100, saturation + step);
        else if (e.key === 'ArrowDown') saturation = Math.max(0, saturation - step);
        else return;
        e.preventDefault();
        onStart?.();
        onChange({ ...value, hue, saturation });
        onEnd?.();
      }}
    >
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-1 w-1 -translate-1/2 rounded-full bg-ivory/40" />
      {/* Touch handle around the marker: a finger that lands here drags it. */}
      <div data-puck="1" className="absolute hidden h-11 w-11 -translate-1/2 touch-none rounded-full coarse:block" style={{ left: px, top: py }} />
      <div
        className="pointer-events-none absolute h-3 w-3 -translate-1/2 rounded-full border-2 border-ivory shadow-[0_0_0_1px_rgba(0,0,0,0.6)] coarse:h-4 coarse:w-4"
        style={{ left: px, top: py, background: value.saturation > 0 ? hueCss(value.hue, 0.7, 0.15) : 'transparent' }}
      />
    </div>
  );
});
