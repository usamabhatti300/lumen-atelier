import { CheckSquare, Download, Square, Trash2, Wand } from 'lucide-react';
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
  const [presetId, setPresetId] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const allPresets = usePresets((s) => s.all);
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

  const applyPresetToSelected = () => {
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
      <div className="flex shrink-0 items-center justify-between px-3 py-2 text-[11px] text-mute">
        <span>
          {photos.length} photo{photos.length === 1 ? '' : 's'}
          {targets.length > 0 && ` · ${targets.length} selected`}
        </span>
        <button
          type="button"
          className="text-amber hover:underline"
          onClick={() => setSelected(targets.length === photos.length ? [] : photos.map((p) => p.id))}
        >
          {targets.length === photos.length && photos.length ? 'Select none' : 'Select all'}
        </button>
      </div>
      <ul className="scroll-quiet min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Photos in this project">
        {photos.map((p) => (
          <li key={p.id} className={`flex items-center gap-2 rounded-xs p-1 ${p.id === activeId ? 'bg-ink-700' : 'hover:bg-ink-800'}`}>
            <button type="button" onClick={() => toggle(p.id)} aria-label={`${selected.includes(p.id) ? 'Deselect' : 'Select'} ${p.name}`} className="text-mute hover:text-ivory">
              {selected.includes(p.id) ? <CheckSquare size={15} className="text-amber" /> : <Square size={15} />}
            </button>
            <button type="button" onClick={() => setActive(p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <img src={p.thumbUrl} alt="" className="h-9 w-12 shrink-0 rounded-[2px] object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-xs text-ivory">{p.name}</span>
                <span className="tabular block text-[10.5px] text-faint">
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
            <p className="mb-1.5 truncate text-[11px] text-mute">
              {progress.stage}: {progress.name} ({progress.index + 1}/{progress.total})
            </p>
            <Progress value={(progress.index + progress.fraction) / progress.total} label="Batch progress" />
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => controller?.abort()}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <Button size="sm" variant="secondary" className="w-full" disabled={targets.filter((t) => t !== activeId).length === 0} onClick={syncSettings} icon={<Wand size={13} />}>
              Copy current settings to selected
            </Button>
            <div className="flex gap-1">
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
                aria-label="Preset to apply"
                className="h-7 min-w-0 flex-1 rounded-xs border border-line bg-ink-950 px-1.5 text-xs text-ivory"
              >
                <option value="">Choose a preset…</option>
                {allPresets().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="secondary" disabled={!presetId || targets.length === 0} onClick={applyPresetToSelected}>
                Apply
              </Button>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" className="flex-1" disabled={targets.length === 0} icon={<Download size={13} />} onClick={() => openExport(targets)}>
                Export selected
              </Button>
              <Button size="sm" variant="ghost" disabled={targets.length === 0} aria-label="Remove selected photos" onClick={() => setConfirmRemove(true)} icon={<Trash2 size={13} />} />
            </div>
          </>
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
        <p className="px-4 py-4 text-sm text-mute">The selected photos and their edits will be removed from this project. Files on your computer are not affected.</p>
      </Dialog>
    </div>
  );
}
