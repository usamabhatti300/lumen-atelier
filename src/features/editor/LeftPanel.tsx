import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Plus, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { PresetBrowser, PresetFields } from '@/features/presets/PresetBrowser';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/misc';
import { useEditor } from '@/state/editorStore';
import { usePresets } from '@/state/presetStore';
import { adjustmentsToPresetValues } from '@/lib/presets/blend';
import { engine } from '@/engine/controller';
import { matchInWorker, matchSampleFor } from '@/lib/analysis/client';
import type { PresetCategoryId } from '@/lib/schema/preset';
import { PhotosPanel } from './PhotosPanel';

/**
 * `compact`: inside the mobile presets sheet, where the bottom bar already has "Match look".
 * The tab row then also carries the sheet's close button (`onClose`), and presets show as a
 * sideways strip unless the sheet is expanded (`expanded`).
 */
export function LeftPanel({
  onOpenReference,
  compact = false,
  expanded = false,
  onClose,
}: {
  onOpenReference: () => void;
  compact?: boolean;
  expanded?: boolean;
  onClose?: () => void;
}) {
  const tab = useEditor((s) => s.leftTab);
  const setUi = useEditor((s) => s.setUi);
  const hasPhoto = useEditor((s) => !!s.activePhotoId);
  const applyPreset = useEditor((s) => s.applyPreset);
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`shrink-0 border-b border-line-soft p-3 ${compact ? 'hidden' : ''}`}>
        <button
          type="button"
          onClick={onOpenReference}
          className="group relative flex w-full items-center gap-3 overflow-hidden rounded-sm bg-accent px-3 pt-2.5 pb-3 text-left text-on-accent transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift"
          data-testid="open-reference"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-fg text-accent transition-transform group-hover:rotate-[-8deg]">
            <Wand2 size={15} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[17px] leading-tight font-bold uppercase">Match a look</span>
            <span className="block text-xs">Copy any photo’s look</span>
          </span>
          <span aria-hidden className="bands absolute inset-x-0 bottom-0 h-[3px]" />
        </button>
      </div>
      <div className={`flex shrink-0 items-center justify-between gap-2 ${compact ? 'pr-1 pl-3' : 'px-3 pt-2.5'}`}>
        {compact && <h2 className="carton-title mr-auto text-[1.35rem] whitespace-nowrap text-fg">{tab === 'photos' ? 'Your frames' : 'Pick a look'}</h2>}
        <Segmented
          label="Left panel"
          size="xs"
          value={tab === 'reference' ? 'presets' : tab}
          onChange={(v) => setUi({ leftTab: v })}
          options={[
            { value: 'presets', label: 'Looks' },
            { value: 'photos', label: 'Photos' },
          ]}
        />
        {tab !== 'photos' && (
          <button
            type="button"
            disabled={!hasPhoto}
            onClick={() => setSaving(true)}
            aria-label="Save look"
            className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs font-semibold text-accent-fg hover:bg-accent/10 disabled:text-fg-4 coarse:h-9 coarse:px-2"
          >
            <Plus size={compact ? 16 : 12} /> {compact ? <span aria-hidden>Save</span> : 'Save look'}
          </button>
        )}
        {onClose && (
          <button type="button" aria-label="Close panel" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-fg-2">
            <X size={17} />
          </button>
        )}
      </div>
      {tab !== 'photos' && !compact && <AppliedPresetBar />}
      <div className={compact && !expanded ? 'shrink-0' : 'min-h-0 flex-1'}>
        {tab === 'photos' ? (
          <PhotosPanel />
        ) : (
          <PresetBrowser variant={compact && !expanded ? 'strip' : 'panel'} onApply={(p) => applyPreset(p, 100)} canApply={hasPhoto} />
        )}
      </div>
      {tab !== 'photos' && compact && <AppliedPresetBar compact />}
      <SavePresetDialog open={saving} onClose={() => setSaving(false)} />
    </div>
  );
}

function AppliedPresetBar({ compact = false }: { compact?: boolean }) {
  const applied = useEditor((s) => s.edit.appliedPreset);
  const setAmount = useEditor((s) => s.setPresetAmount);
  const clear = useEditor((s) => s.clearAppliedPreset);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const applyPreset = useEditor((s) => s.applyPreset);
  const showToast = useEditor((s) => s.showToast);
  const user = usePresets((s) => s.user);
  const [matching, setMatching] = useState<{ id: string; pass: number } | null>(null);
  // Reference presets saved with the reference's statistics can be matched to the current photo.
  const source = applied ? user.find((p) => p.id === applied.id && p.reference?.features) : undefined;
  const isMatched = !!applied?.name.endsWith(' · matched');

  const matchToPhoto = async () => {
    const features = source?.reference?.features;
    const bmp = engine.getPreviewBitmap();
    if (!source || !features || !bmp) return;
    setMatching({ id: source.id, pass: 0 });
    try {
      const match = await matchInWorker(features, matchSampleFor(bmp), source.adjustments, {
        onProgress: (pass) => setMatching({ id: source.id, pass }),
      });
      applyPreset({ id: source.id, name: `${source.name} · matched`, adjustments: match.adjustments }, applied?.amount ?? 100);
      showToast(match.warnings[0] ?? `Matched “${source.name}” to this photo (${match.iterations + 1} render passes).`, match.warnings.length ? 'info' : 'success');
    } catch (e) {
      showToast(e instanceof Error ? `Matching failed: ${e.message}` : 'Matching failed.', 'error');
    } finally {
      setMatching(null);
    }
  };
  return (
    <AnimatePresence initial={false}>
      {applied && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="shrink-0 overflow-hidden"
        >
          <div className={`rounded-sm border border-line bg-ground px-2.5 pt-1.5 pb-1 ${compact ? 'mx-3 mb-2' : 'mx-3 mt-2.5'}`}>
            <div className="flex items-center justify-between">
              <p className="truncate text-[11px] text-fg-3">
                Applied <span className="text-fg">{applied.name}</span>
              </p>
              <button type="button" onClick={clear} aria-label="Remove preset" title="Remove preset" className="rounded-xs p-0.5 text-fg-4 hover:text-fg coarse:-my-1.5 coarse:p-2">
                <X size={compact ? 15 : 12} />
              </button>
            </div>
            <Slider
              label="Amount"
              value={applied.amount}
              range={{ min: 0, max: 100, default: 100, step: 1 }}
              format={(v) => `${Math.round(v)}%`}
              onGestureStart={() => begin('Preset amount')}
              onGestureEnd={end}
              onChange={setAmount}
            />
            {source && (
              <button
                type="button"
                onClick={() => void matchToPhoto()}
                disabled={!!matching}
                title="Compare this photo with the reference the preset came from and set the sliders to match it"
                className="mb-1 flex items-center gap-1.5 rounded-xs px-1 py-0.5 text-[11px] text-accent-fg hover:bg-accent/10 disabled:text-fg-4"
                data-testid="match-preset-to-photo"
              >
                {matching ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                {matching
                  ? matching.pass === 0
                    ? 'Matching…'
                    : `Matching · pass ${matching.pass}`
                  : isMatched
                    ? 'Match again to this photo'
                    : 'Match to this photo'}
              </button>
            )}
            {applied.overrides.length > 0 && (
              <p className="pb-1 text-[10.5px] text-fg-4">{applied.overrides.length} hand-edited setting{applied.overrides.length === 1 ? '' : 's'} kept when the amount changes.</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SavePresetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('My look');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PresetCategoryId>('custom');
  const showToast = useEditor((s) => s.showToast);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save look as preset"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={async () => {
              const adj = useEditor.getState().edit.adjustments;
              await usePresets.getState().create({ name, description, category, tags: [], adjustments: adjustmentsToPresetValues(adj) });
              showToast(`Saved preset “${name.trim()}”.`, 'success');
              onClose();
            }}
          >
            Save preset
          </Button>
        </>
      }
    >
      <p className="px-4 pt-4 text-xs leading-relaxed text-fg-3">
        Saves the tone, colour, curve, grading and effects settings. Crop, masks and retouching are specific to this photo
        and are not included.
      </p>
      <PresetFields name={name} setName={setName} description={description} setDescription={setDescription} category={category} setCategory={setCategory} />
    </Dialog>
  );
}
