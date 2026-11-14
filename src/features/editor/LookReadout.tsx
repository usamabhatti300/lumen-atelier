/**
 * The readout of which look is loaded and at what amount. Desktop: a row under the photo, with the
 * photo's pixel size. Phones (`overlay`): a small chip floating in the stage's bottom-left corner,
 * shown only while a look is on, so it never costs the photo a row. The name rises in (readout-in)
 * whenever the look changes.
 */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useEditor } from '@/state/editorStore';
import { describeAdaptation } from '@/lib/analysis/lookAdapt';

/**
 * The "what next" hint under the chip, after the first two looks of a visit. Kept outside React so
 * a re-mount of the readout (layout changes as the sheet opens) neither restarts nor loses it.
 */
const lookHint = { count: 0, id: '', text: '', until: 0 };

function useLookHint(id: string | undefined) {
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    const now = performance.now();
    if (lookHint.id !== id) {
      if (lookHint.count >= 2) return;
      lookHint.count++;
      const adapted = useEditor.getState().edit.appliedPreset?.adapted;
      lookHint.id = id;
      lookHint.text = adapted
        ? `Fitted to this photo (${describeAdaptation(adapted)}). Drag Amount to make it softer.`
        : 'Drag Amount below to make it softer or stronger.';
      lookHint.until = now + 4000;
    }
    const left = lookHint.until - now;
    if (left <= 0) return;
    const show = window.setTimeout(() => setHint(lookHint.text), 200);
    const hide = window.setTimeout(() => setHint(null), left);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
      setHint(null);
    };
  }, [id]);
  return hint;
}

export function LookReadout({ overlay = false }: { overlay?: boolean }) {
  const photo = useEditor((s) => s.photos.find((p) => p.id === s.activePhotoId));
  const preset = useEditor((s) => s.edit.appliedPreset);
  const hint = useLookHint(overlay ? preset?.id : undefined);
  if (!photo) return null;
  if (overlay) {
    if (!preset) return null;
    return (
      <div
        className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[70%]"
        data-testid="edge-print"
      >
        <span
          key={preset.id}
          className="readout-in surface-float flex min-w-0 items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-[12px] text-fg"
          aria-live="polite"
        >
          <span aria-hidden className="spectrum h-1.5 w-1.5 shrink-0 rounded-full" />
          <span className="truncate font-medium">{preset.name}</span>
          <span className="font-mono text-[11px] text-accent-fg">{Math.round(preset.amount)}%</span>
          {preset.adapted && <span className="text-[11px] text-fg-3">· fitted</span>}
        </span>
        <AnimatePresence>
          {hint && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="surface-float mt-1.5 rounded-xl px-2.5 py-1.5 text-[12px] leading-snug text-fg-2"
            >
              {hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
  return (
    <div
      className="flex h-11 shrink-0 items-center gap-3 overflow-hidden px-3 whitespace-nowrap sm:px-4"
      data-testid="edge-print"
    >
      <span
        key={preset ? preset.id : 'none'}
        className={`readout-in flex min-w-0 items-center gap-2 rounded-full py-1 pr-3 pl-2 text-[13px] ${preset ? 'glass-card text-fg' : 'text-fg-4'}`}
        aria-live="polite"
      >
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${preset ? 'spectrum shadow-offset-sm' : 'bg-fg-4/50'}`}
        />
        <span className="truncate font-medium">{preset ? preset.name : 'Original'}</span>
        {preset && (
          <span className="font-mono text-xs text-accent-fg">{Math.round(preset.amount)}%</span>
        )}
      </span>
      <span className="ml-auto hidden font-mono text-[11px] text-fg-4 sm:inline">
        {photo.width} × {photo.height}
      </span>
    </div>
  );
}
