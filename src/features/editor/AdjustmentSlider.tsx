import { memo, useCallback } from 'react';
import { Slider } from '@/components/ui/Slider';
import { useEditor } from '@/state/editorStore';
import { getPath, rangeForPath, type Range } from '@/lib/schema/adjustments';

/** A slider bound to one adjustment path (e.g. "basic.exposure"). Subscribes only to its own value. */
export const AdjustmentSlider = memo(function AdjustmentSlider({
  path,
  label,
  track,
  format,
  range,
}: {
  path: string;
  label: string;
  track?: string;
  format?: (v: number) => string;
  range?: Range;
}) {
  const value = useEditor((s) => getPath(s.edit.adjustments, path) as number);
  const setAdjustment = useEditor((s) => s.setAdjustment);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const r = range ?? rangeForPath(path)!;
  const onChange = useCallback((v: number) => setAdjustment(path, v, label), [setAdjustment, path, label]);
  const onStart = useCallback(() => begin(label), [begin, label]);
  return (
    <Slider
      label={label}
      value={value}
      range={r}
      onChange={onChange}
      onGestureStart={onStart}
      onGestureEnd={end}
      track={track}
      format={format}
    />
  );
});

export const TRACKS = {
  temperature: 'linear-gradient(90deg, #5d7fae, #b9b2a5 50%, #d9a24f)',
  tint: 'linear-gradient(90deg, #6fa86a, #b9b2a5 50%, #b968ad)',
  exposure: 'linear-gradient(90deg, #0d0c0b, #ece6da)',
  saturation: 'linear-gradient(90deg, #8f8a83, #c9a26b 70%, #d0584a)',
};

export const fmtEv = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
