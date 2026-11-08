import { CheckSquare, Copy, Download, Square, Trash2 } from 'lucide-react';
import { LooksIcon } from '@/components/icons';
import { PresetBrowser } from '@/features/presets/PresetBrowser';
import { useState } from 'react';
import { useEditor } from '@/state/editorStore';
import { usePresets } from '@/state/presetStore';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Progress } from '@/components/ui/misc';
import { applyToMany, type BatchProgress } from '@/engine/batch';
import { blendPreset } from '@/lib/presets/blend';
import { deletePhoto } from '@/lib/storage/db';
import { useExportDialog } from '@/features/export/ExportDialog';

export function PhotosPanel() {
  const photos = useEditor((s) => s.photos);
  const activeId = useEditor((s) => s.activePhotoId);
  const setActive = useEditor((s) => s.setActivePhoto);
  const removePhoto = useEditor((s) => s.removePhoto);
  const showToast = useEditor((s) => s.showToast);
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const openExport = useExportDialog((s) => s.open);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const targets = selected.filter((id) => photos.some((p) => p.id === id));

  const run = async (label: string, mutate: Parameters<typeof applyToMany>[1], ids: string[]) => {
    const ac = new AbortController();
    setController(ac);
    const r = await applyToMany(ids, mutate, label, ac.signal, setProgress);
    setController(null);
    setProgress(null);
    if (r.cancelled) showToast(`Stopped after ${r.done} of ${ids.length} photos.`, 'info');
    else if (r.errors.length) showToast(r.errors.join(' '), 'error');
    else showToast(`${label}: ${r.done} photo${r.done === 1 ? '' : 's'} updated.`, 'success');
  };

  const syncSettings = () => {
    const source = useEditor.getState().edit;
    const ids = targets.filter((id) => id !== activeId);
    void run('Settings applied', (e) => ({ ...e, adjustments: structuredClone(source.adjustments), appliedPreset: source.appliedPreset, lut: source.lut }), ids);
  };

  const applyPresetToSelected = (presetId: string) => {
    const preset = usePresets.getState().byId(presetId);
    if (!preset) return;
    void run(`${preset.name} applied`, (e) => {
      const baseline = e.appliedPreset ? e.appliedPreset.baseline : e.adjustments;
      return {
        ...e,
        adjustments: blendPreset(baseline, preset.adjustments, 100),
        appliedPreset: { id: preset.id, name: preset.name, amount: 100, baseline, values: preset.adjustments, overrides: [] },
      };
    }, targets);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 py-2 text-[11px] text-fg-3">
        <span>
          {photos.length} photo{photos.length === 1 ? '' : 's'}
          {targets.length > 0 && ` · ${targets.length} selected`}
        </span>
        <button
          type="button"
          className="text-accent-fg hover:underline"
          onClick={() => setSelected(targets.length === photos.length ? [] : photos.map((p) => p.id))}
        >
          {targets.length === photos.length && photos.length ? 'Select none' : 'Select all'}
        </button>
      </div>
      <ul className="scroll-quiet min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Photos in this project">
        {photos.map((p) => (
          <li key={p.id} className={`flex items-center gap-2 rounded-xs p-1 ${p.id === activeId ? 'bg-control' : 'hover:bg-raised'}`}>
            <button type="button" onClick={() => toggle(p.id)} aria-label={`${selected.includes(p.id) ? 'Deselect' : 'Select'} ${p.name}`} className="coarse:p-2.5 text-fg-3 hover:text-fg">
              {selected.includes(p.id) ? <CheckSquare size={15} className="text-accent-fg" /> : <Square size={15} />}
            </button>
            <button type="button" onClick={() => setActive(p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <img src={p.thumbUrl} alt="" className="h-9 w-12 shrink-0 rounded-[2px] object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-xs text-fg">{p.name}</span>
                <span className="tabular block text-[10.5px] text-fg-4">
                  {p.width} × {p.height}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="shrink-0 space-y-2 border-t border-line-soft p-3">
        {progress ? (
          <div role="status">
            <p className="mb-1.5 truncate text-[11px] text-fg-3">
              {progress.stage}: {progress.name} ({progress.index + 1}/{progress.total})
            </p>
            <Progress value={(progress.index + progress.fraction) / progress.total} label="Batch progress" />
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => controller?.abort()}>
              Cancel
            </Button>
          </div>
        ) : (
          targets.length === 0 ? (
            // Nothing selected: one quiet line instead of a stack of disabled buttons.
            <p className="font-mono text-[11px] text-fg-4">select photos to copy settings, apply a look or export them together</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" icon={<LooksIcon size={14} />} onClick={() => setPicking(true)}>
                  Apply a look
                </Button>
                <Button size="sm" variant="secondary" disabled={targets.filter((t) => t !== activeId).length === 0} onClick={syncSettings} icon={<Copy size={13} />}>
                  Copy my edits
                </Button>
                <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={() => openExport(targets)}>
                  Export
                </Button>
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" icon={<Trash2 size={13} />} onClick={() => setConfirmRemove(true)}>
                  Remove
                </Button>
              </div>
            </>
          )
        )}
      </div>
      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove photos?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                for (const id of targets) {
                  await deletePhoto(id);
                  removePhoto(id);
                }
                setSelected([]);
                setConfirmRemove(false);
              }}
            >
              Remove {targets.length} photo{targets.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <p className="px-4 py-4 text-sm text-fg-3">The selected photos and their edits will be removed from this project. Files on your computer are not affected.</p>
      </Dialog>
      {/* Pick a look for the selected photos from the same grid as the Looks panel. */}
      <Dialog open={picking} onClose={() => setPicking(false)} title={`Apply a look to ${targets.length} photo${targets.length === 1 ? '' : 's'}`}>
        <div className="h-[min(60dvh,520px)] pb-2">
          <PresetBrowser
            variant="panel"
            actionVerb="Apply to selected:"
            onApply={(p) => {
              setPicking(false);
              applyPresetToSelected(p.id);
            }}
          />
        </div>
      </Dialog>
    </div>
  );
}
