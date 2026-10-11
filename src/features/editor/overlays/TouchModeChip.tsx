/**
 * Touch screens have no Shift or Alt key. This chip gives the canvas tools that
 * use modifiers (Remove: add to the last removal; Select object: add /
 * subtract; Heal: delete a spot) an on-screen mode instead. The overlays read
 * it through `touchMods`, so keyboard modifiers keep working as before.
 */
import { useEffect } from 'react';
import { useEditor, type Tool } from '@/state/editorStore';
import { useTouchMode, type TouchMode } from './touchMode';

const OPTIONS: Partial<Record<Tool, { value: TouchMode; label: string }[]>> = {
  remove: [
    { value: 'none', label: 'New removal' },
    { value: 'add', label: 'Add to last' },
  ],
  object: [
    { value: 'none', label: 'Select' },
    { value: 'add', label: 'Add' },
    { value: 'subtract', label: 'Subtract' },
  ],
  heal: [
    { value: 'none', label: 'Heal' },
    { value: 'subtract', label: 'Delete spot' },
  ],
};

export function TouchModeChip() {
  const tool = useEditor((s) => s.tool);
  const mode = useTouchMode((s) => s.mode);
  const setUi = useEditor((s) => s.setUi);
  useEffect(() => useTouchMode.setState({ mode: 'none' }), [tool]);
  const options = OPTIONS[tool];
  if (!options) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Touch mode"
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 rounded-sm border border-line bg-ink-950/90 p-0.5 shadow-float backdrop-blur-sm"
      data-testid="touch-mode"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={mode === o.value}
          onClick={() => useTouchMode.setState({ mode: o.value })}
          className={`h-9 rounded-xs px-3 text-xs font-medium whitespace-nowrap ${mode === o.value ? 'bg-champagne text-ink-950' : 'text-ivory-dim'}`}
        >
          {o.label}
        </button>
      ))}
      <span className="mx-0.5 my-1.5 w-px bg-line" aria-hidden />
      <button type="button" onClick={() => setUi({ tool: 'none' })} className="h-9 rounded-xs px-3 text-xs font-medium text-amber">
        Done
      </button>
    </div>
  );
}
