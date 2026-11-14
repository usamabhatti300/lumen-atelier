/**
 * The readout of which look is loaded and at what amount. Desktop: a row under the photo, with the
 * photo's pixel size. Phones (`overlay`): a small chip floating in the stage's bottom-left corner,
 * shown only while a look is on and no tool is working on the photo, so it never costs the photo a
 * row or covers a tool's controls. The name rises in (readout-in) whenever the look changes.
 */
import { useEditor } from '@/state/editorStore';

export function LookReadout({ overlay = false }: { overlay?: boolean }) {
  const photo = useEditor((s) => s.photos.find((p) => p.id === s.activePhotoId));
  const preset = useEditor((s) => s.edit.appliedPreset);
  // Crop, masks, remove and heal put their own controls on the photo; the chip steps aside for them.
  const toolActive = useEditor((s) => s.tool !== 'none');
  if (!photo) return null;
  if (overlay) {
    if (!preset || toolActive) return null;
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
