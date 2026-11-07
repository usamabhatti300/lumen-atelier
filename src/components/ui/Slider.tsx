/**
 * Precision slider: native range input (keyboard + screen readers) with a
 * custom track that fills from the default value, a click-to-type numeric
 * field, double-click to reset, and gesture callbacks so one drag becomes one
 * undo step.
 *
 * Touch: the native input ignores fingers (it would jump to wherever a scroll
 * starts). A horizontal drag on the row moves the value relative to where the
 * finger landed; a vertical swipe scrolls the panel; a tap changes nothing.
 */
import { RotateCcw } from 'lucide-react';
import { memo, useId, useRef, useState, type CSSProperties } from 'react';
import type { Range } from '@/lib/schema/adjustments';

export interface SliderProps {
  label: string;
  value: number;
  range: Range;
  onChange: (value: number) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  /** Optional CSS gradient for the track (temperature, tint, hue). */
  track?: string;
  format?: (v: number) => string;
  disabled?: boolean;
  /** Visually de-emphasised when at default. */
  hint?: string;
  /**
   * `lg`: the phone "one slider at a time" view. Larger label and value, a reset button, and a
   * taller track with a tick ruler (the Halide / Lightroom mobile pattern).
   */
  size?: 'md' | 'lg';
}

const decimals = (step: number) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step))));

export const Slider = memo(function Slider({
  label,
  value,
  range,
  onChange,
  onGestureStart,
  onGestureEnd,
  track,
  format,
  disabled,
  hint,
  size = 'md',
}: SliderProps) {
  const lg = size === 'lg';
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const dragging = useRef(false);
  const touch = useRef<{ id: number; x: number; y: number; start: number; width: number; active: boolean } | null>(null);
  const span = range.max - range.min;
  const pct = ((value - range.min) / span) * 100;
  const origin = ((Math.min(Math.max(range.default, range.min), range.max) - range.min) / span) * 100;
  const d = decimals(range.step);
  const display = format ? format(value) : (value > 0 && range.min < 0 ? '+' : '') + value.toFixed(d);
  const changed = Math.abs(value - range.default) > range.step / 2;

  const commitDraft = () => {
    const v = Number(draft.replace(',', '.'));
    if (Number.isFinite(v)) {
      onGestureStart?.();
      onChange(Math.min(range.max, Math.max(range.min, v)));
      onGestureEnd?.();
    }
    setEditing(false);
  };

  const reset = () => {
    onGestureStart?.();
    onChange(range.default);
    onGestureEnd?.();
  };

  const snap = (v: number) => Math.min(range.max, Math.max(range.min, range.min + Math.round((v - range.min) / range.step) * range.step));

  const onTouchDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' || disabled) return;
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: value, width: e.currentTarget.getBoundingClientRect().width, active: false };
  };
  const onTouchMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (!t.active) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Mostly vertical: the browser is scrolling the panel; leave the value alone.
      if (Math.abs(dy) >= Math.abs(dx)) {
        touch.current = null;
        return;
      }
      t.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      onGestureStart?.();
    }
    const next = snap(t.start + (dx / Math.max(1, t.width)) * span);
    if (next !== value) onChange(next);
  };
  const onTouchEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    touch.current = null;
    if (t.active) onGestureEnd?.();
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onGestureEnd?.();
  };

  const fillStyle: CSSProperties = {
    left: `${Math.min(pct, origin)}%`,
    width: `${Math.abs(pct - origin)}%`,
  };

  return (
    <div
      className={`group/slider grid items-center gap-x-2 ${lg ? 'grid-cols-[1fr_auto_auto] py-1' : 'grid-cols-[1fr_auto] py-[3px]'} ${disabled ? 'opacity-40' : ''}`}
    >
      <label
        htmlFor={id}
        onDoubleClick={reset}
        title={hint ?? 'Double-click to reset'}
        className={`cursor-default select-none truncate ${lg ? `text-sm font-medium ${changed ? 'text-ivory' : 'text-ivory-dim'}` : `text-xs ${changed ? 'text-ivory' : 'text-mute'}`}`}
      >
        {label}
      </label>
      {editing ? (
        <input
          autoFocus
          aria-label={`${label} value`}
          className={`tabular rounded-xs border border-amber/60 bg-ink-950 px-1 text-right text-ivory outline-none ${lg ? 'h-8 w-20 text-base' : 'h-5 w-14 text-xs'}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-label={`Type a value for ${label}`}
          onClick={() => {
            setDraft(value.toFixed(d));
            setEditing(true);
          }}
          className={`tabular rounded-xs px-1 text-right transition-colors hover:bg-ink-700 ${lg ? 'h-8 min-w-14 text-base font-medium' : 'h-5 min-w-10 text-xs'} ${
            changed ? 'text-amber' : 'text-faint'
          }`}
        >
          {display}
        </button>
      )}
      {lg && (
        <button
          type="button"
          aria-label={`Reset ${label}`}
          disabled={!changed || disabled}
          onClick={reset}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-mute transition-opacity hover:text-ivory disabled:opacity-25"
        >
          <RotateCcw size={15} />
        </button>
      )}
      <div
        className={`relative touch-pan-y ${lg ? 'col-span-3 flex h-12 items-center' : 'col-span-2 h-[22px] coarse:h-8'}`}
        onDoubleClick={reset}
        onPointerDown={onTouchDown}
        onPointerMove={onTouchMove}
        onPointerUp={onTouchEnd}
        onPointerCancel={onTouchEnd}
        data-testid="slider-track"
      >
        {lg && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 opacity-70"
            style={{ background: 'repeating-linear-gradient(90deg, var(--color-line-strong) 0 1px, transparent 1px 9px)' }}
          />
        )}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-line"
          style={track ? { background: track, height: 3, opacity: 0.85 } : undefined}
        />
        {!track && (
          <div
            className="pointer-events-none absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-amber/80 transition-[left,width] duration-75"
            style={fillStyle}
          />
        )}
        {range.min < range.default && range.default < range.max && (
          <div
            className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong"
            style={{ left: `${origin}%` }}
          />
        )}
        <input
          id={id}
          type="range"
          className="slider-input relative coarse:pointer-events-none"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          disabled={disabled}
          aria-valuetext={display}
          onPointerDown={() => {
            dragging.current = true;
            onGestureStart?.();
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onBlur={endDrag}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
});
