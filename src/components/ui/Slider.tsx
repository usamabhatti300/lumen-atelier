/**
 * Precision slider: native range input (keyboard + screen readers) with a
 * custom track that fills from the default value, a click-to-type numeric
 * field, double-click to reset, and gesture callbacks so one drag becomes one
 * undo step.
 */
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
}: SliderProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const dragging = useRef(false);
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
    <div className={`group/slider grid grid-cols-[1fr_auto] items-center gap-x-2 py-[3px] ${disabled ? 'opacity-40' : ''}`}>
      <label
        htmlFor={id}
        onDoubleClick={reset}
        title={hint ?? 'Double-click to reset'}
        className={`cursor-default select-none truncate text-xs ${changed ? 'text-ivory' : 'text-mute'}`}
      >
        {label}
      </label>
      {editing ? (
        <input
          autoFocus
          aria-label={`${label} value`}
          className="tabular h-5 w-14 rounded-xs border border-amber/60 bg-ink-950 px-1 text-right text-xs text-ivory outline-none"
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
          className={`tabular h-5 min-w-10 rounded-xs px-1 text-right text-xs transition-colors hover:bg-ink-700 ${
            changed ? 'text-amber' : 'text-faint'
          }`}
        >
          {display}
        </button>
      )}
      <div className="relative col-span-2 h-[22px] coarse:h-8" onDoubleClick={reset}>
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
          className="slider-input relative"
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
