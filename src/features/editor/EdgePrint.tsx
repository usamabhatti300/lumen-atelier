/**
 * Edge printing along the bottom of the photo frame: which frame is loaded and which look is in
 * it, like the rebate text on a strip of film. It advances (rolls in) whenever the look changes.
 */
import { useEditor } from '@/state/editorStore';

export function EdgePrint() {
  const index = useEditor((s) => s.photos.findIndex((p) => p.id === s.activePhotoId));
  const photo = useEditor((s) => s.photos.find((p) => p.id === s.activePhotoId));
  const preset = useEditor((s) => s.edit.appliedPreset);
  if (!photo) return null;
  const frame = `Frame ${String(index + 1).padStart(2, '0')}A`;
  const look = preset ? `${preset.name} · ${Math.round(preset.amount)}%` : 'No look loaded';
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 overflow-hidden px-4 whitespace-nowrap" data-testid="edge-print">
      <span className="edge-code text-fg-4">{frame}</span>
      <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-fg-4" />
      <span key={preset ? `${preset.id}` : 'none'} className="edge-code edge-advance truncate" aria-live="polite">
        {preset ? 'Look ' : ''}
        {look}
      </span>
      <span className="edge-code ml-auto hidden text-fg-4 sm:inline">
        {photo.width} × {photo.height}
      </span>
    </div>
  );
}
