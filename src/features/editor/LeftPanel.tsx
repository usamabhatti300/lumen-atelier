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

/** `compact`: inside the mobile presets sheet, where the bottom bar already has "Match look". */
export function LeftPanel({ onOpenReference, compact = false }: { onOpenReference: () => void; compact?: boolean }) {
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
          className="group flex w-full items-center gap-3 rounded-sm border border-amber/35 bg-gradient-to-r from-amber/10 to-transparent px-3 py-2.5 text-left transition-colors hover:border-amber/70"
          data-testid="open-reference"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber transition-transform group-hover:scale-105">
            <Wand2 size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-ivory">Match a reference look</span>
            <span className="block truncate text-[11px] text-mute">Build an editable preset from any photo</span>
          </span>
        </button>
      </div>
      <div className={`flex shrink-0 items-center justify-between px-3 ${compact ? 'pt-0.5' : 'pt-2.5'}`}>
        <Segmented
          label="Left panel"
          size="xs"
          value={tab === 'reference' ? 'presets' : tab}
          onChange={(v) => setUi({ leftTab: v })}
          options={[
            { value: 'presets', label: 'Presets' },
            { value: 'photos', label: 'Photos' },
          ]}
        />
        {tab !== 'photos' && (
          <button
            type="button"
            disabled={!hasPhoto}
            onClick={() => setSaving(true)}
            className="flex items-center gap-1 rounded-xs px-1.5 py-1 text-[11px] text-amber hover:bg-amber/10 disabled:text-faint"
          >
            <Plus size={12} /> Save look
          </button>
        )}
      </div>
      {tab !== 'photos' && <AppliedPresetBar />}
      <div className="min-h-0 flex-1">
        {tab === 'photos' ? (
          <PhotosPanel />
        ) : (
          <PresetBrowser onApply={(p) => applyPreset(p, 100)} canApply={hasPhoto} />
        )}
      </div>
      <SavePresetDialog open={saving} onClose={() => setSaving(false)} />
    </div>
  );
}

function AppliedPresetBar() {
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
          <div className="mx-3 mt-2.5 rounded-sm border border-line bg-ink-900 px-2.5 pt-1.5 pb-1">
            <div className="flex items-center justify-between">
              <p className="truncate text-[11px] text-mute">
                Applied <span className="text-ivory">{applied.name}</span>
              </p>
              <button type="button" onClick={clear} aria-label="Remove preset" title="Remove preset" className="rounded-xs p-0.5 text-faint hover:text-ivory">
                <X size={12} />
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
                className="mb-1 flex items-center gap-1.5 rounded-xs px-1 py-0.5 text-[11px] text-amber hover:bg-amber/10 disabled:text-faint"
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
              <p className="pb-1 text-[10.5px] text-faint">{applied.overrides.length} hand-edited setting{applied.overrides.length === 1 ? '' : 's'} kept when the amount changes.</p>
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
      <p className="px-4 pt-4 text-xs leading-relaxed text-mute">
        Saves the tone, colour, curve, grading and effects settings. Crop, masks and retouching are specific to this photo
        and are not included.
      </p>
      <PresetFields name={name} setName={setName} description={description} setDescription={setDescription} category={category} setCategory={setCategory} />
    </Dialog>
  );
}
