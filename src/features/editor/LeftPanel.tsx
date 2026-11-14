import { AnimatePresence, motion } from 'motion/react';
import { applyLibraryLook } from './lookSequence';
import { ArrowRight, Loader2, Plus, Blend, Star, X } from 'lucide-react';
import { useState } from 'react';
import { PresetBrowser, PresetFields } from '@/features/presets/PresetBrowser';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/misc';
import { useEditor } from '@/state/editorStore';
import { usePresets } from '@/state/presetStore';
import { MAX_LOOK_AMOUNT, adjustmentsToPresetValues } from '@/lib/presets/blend';
import { engine } from '@/engine/controller';
import { matchInWorker, matchSampleFor } from '@/lib/analysis/client';
import { PhotosPanel } from './PhotosPanel';
import { describeAdaptation } from '@/lib/analysis/lookAdapt';

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
  // Phones show only looks here (Photos is in the More grid).
  const storedTab = useEditor((s) => s.leftTab);
  const tab = compact ? 'presets' : storedTab;
  const setUi = useEditor((s) => s.setUi);
  const hasPhoto = useEditor((s) => !!s.activePhotoId);
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`shrink-0 p-3 ${compact ? 'hidden' : ''}`}>
        {/* The editor's signature entry: a card whose edge turns lilac on hover. */}
        <button
          type="button"
          onClick={onOpenReference}
          className="group relative block w-full overflow-hidden rounded-lg p-px text-left transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 active:scale-[0.98]"
          data-testid="open-reference"
        >
          <span aria-hidden className="absolute inset-0 bg-line transition-colors duration-300 group-hover:bg-accent/70" />
          <span className="relative flex items-center gap-3 rounded-[21px] bg-raised/85 px-3 py-3 backdrop-blur-xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-offset-sm transition-transform duration-500 group-hover:rotate-[-14deg]">
              <Blend size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-tight font-semibold tracking-[-0.01em] text-fg">Match a look</span>
              <span className="mt-0.5 block text-xs text-fg-3">Copy any photo’s look</span>
            </span>
            <ArrowRight size={16} className="mr-1 shrink-0 text-fg-3 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-fg" />
          </span>
        </button>
      </div>
      <div className={`flex shrink-0 items-center justify-between gap-2 px-3 pt-1 ${compact ? 'hidden' : ''}`}>
        <h2 className="sr-only">{tab === 'photos' ? 'Your photos' : 'Pick a look'}</h2>
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
            className={`flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-fg-2 transition-colors hover:bg-control hover:text-fg disabled:text-fg-4 coarse:h-11 ${compact ? 'ml-auto' : ''}`}
          >
            <Plus size={15} /> {compact ? <span aria-hidden>Save</span> : 'Save look'}
          </button>
        )}
        {onClose && (
          <button type="button" aria-label="Close panel" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-3 transition-transform hover:text-fg active:scale-90 coarse:h-11 coarse:w-11">
            <X size={16} />
          </button>
        )}
      </div>
      {tab !== 'photos' && !compact && <AppliedPresetBar />}
      <div className={compact && !expanded ? 'shrink-0' : 'min-h-0 flex-1'}>
        {tab === 'photos' ? (
          <PhotosPanel />
        ) : (
          <PresetBrowser
            variant={compact && !expanded ? 'strip' : 'panel'}
            // Library looks are evened out for this photo first (Settings → Adaptive looks).
            onApply={(p) => applyLibraryLook(p)}
            canApply={hasPhoto}
            trailing={
              compact && onClose ? (
                <button type="button" aria-label="Close panel" onClick={onClose} className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-3 transition-transform hover:text-fg active:scale-90 coarse:h-11 coarse:w-10">
                  <X size={16} />
                </button>
              ) : undefined
            }
          />
        )}
      </div>
      {tab !== 'photos' && compact && <AppliedPresetBar compact onSave={() => setSaving(true)} />}
      <SavePresetDialog open={saving} onClose={() => setSaving(false)} />
    </div>
  );
}

function AppliedPresetBar({ compact = false, onSave }: { compact?: boolean; onSave?: () => void }) {
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
  const amount = (
    <Slider
      label="Amount"
      value={applied?.amount ?? 100}
      range={{ min: 0, max: MAX_LOOK_AMOUNT, default: 100, step: 1 }}
      fillFrom="min"
      format={(v) => `${Math.round(v)}%`}
      onGestureStart={() => begin('Look amount')}
      onGestureEnd={end}
      onChange={setAmount}
    />
  );
  const matchButton = source && (
    <button
      type="button"
      onClick={() => void matchToPhoto()}
      disabled={!!matching}
      title="Compare this photo with the reference this look came from and set the sliders to match it"
      className={`flex shrink-0 items-center gap-1.5 rounded-full text-xs font-medium text-fg-2 transition-colors hover:bg-control hover:text-fg disabled:text-fg-4 ${compact ? 'h-8 bg-control px-3' : 'mb-1 h-8 px-2.5'}`}
      data-testid="match-preset-to-photo"
    >
      {matching ? <Loader2 size={11} className="animate-spin" /> : <Blend size={11} />}
      {matching
        ? matching.pass === 0
          ? 'Matching…'
          : `Matching · pass ${matching.pass}`
        : compact
          ? isMatched ? 'Match again' : 'Match to photo'
          : isMatched
            ? 'Match again to this photo'
            : 'Match to this photo'}
    </button>
  );
  const overridesNote =
    applied && applied.overrides.length > 0
      ? `${applied.overrides.length} hand-edited setting${applied.overrides.length === 1 ? '' : 's'} kept when the amount changes.`
      : undefined;
  // Honest about adaptive looks: say what was changed to fit this photo.
  // The adaptation is already in the sliders, so say it is relative to the look as it was made.
  const adaptNote = applied?.adapted ? `Fitted to this photo: ${describeAdaptation(applied.adapted)}` : undefined;
  const kept = usePresets((s) => !!applied && s.favorites.includes(applied.id));
  const toggleKept = usePresets((s) => s.toggleFavorite);
  const canKeep = usePresets((s) => !!applied && !!s.byId(applied.id));

  // Phones: one line (Amount · value · keep · save · remove). The look's name is on the chip over
  // the photo. The row keeps its height with no look on, so choosing a look never moves the photo.
  if (compact)
    return (
      <div className="relative mx-3 h-12 shrink-0 overflow-hidden" title={[adaptNote, overridesNote].filter(Boolean).join(' ') || undefined}>
        {!applied && (
          <p className="flex h-12 items-center border-t border-line-soft pt-1 text-[13px] text-fg-4" data-testid="looks-hint">
            Tap a look to try it. Hold one to see it large.
          </p>
        )}
        {applied && (
          <div className="flex h-12 items-center gap-0.5 border-t border-line-soft pt-1">
            <div className="min-w-0 flex-1">
              <Slider
                label="Amount"
                size="row"
                value={applied.amount}
                range={{ min: 0, max: MAX_LOOK_AMOUNT, default: 100, step: 1 }}
                fillFrom="min"
                format={(v) => `${Math.round(v)}%`}
                onGestureStart={() => begin('Look amount')}
                onGestureEnd={end}
                onChange={setAmount}
              />
            </div>
            {matchButton}
            {canKeep && (
              <button
                type="button"
                onClick={() => toggleKept(applied.id)}
                aria-pressed={kept}
                aria-label={kept ? `Remove ${applied.name} from Kept` : `Keep ${applied.name}`}
                className={`flex h-11 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${kept ? 'text-accent' : 'text-fg-3 hover:text-fg'}`}
              >
                <Star size={16} fill={kept ? 'currentColor' : 'none'} />
              </button>
            )}
            <button type="button" onClick={onSave} aria-label="Save look" title="Save as your own look" className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors hover:text-fg">
              <Plus size={17} />
            </button>
            <button type="button" onClick={clear} aria-label="Remove look" title="Remove look" className="-mr-1.5 flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors hover:text-fg">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    );

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
          <div className="glass-card mx-3 mt-3 rounded-lg px-3.5 pt-2.5 pb-1.5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="spectrum h-2 w-2 shrink-0 rounded-full" />
              <p className="min-w-0 flex-1 truncate text-[13px] text-fg-3">
                Applied <span className="font-medium text-fg">{applied.name}</span>
              </p>
              <button type="button" onClick={clear} aria-label="Remove look" title="Remove look" className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-full text-fg-4 transition-colors hover:bg-control hover:text-fg coarse:h-9 coarse:w-9">
                <X size={14} />
              </button>
            </div>
            {amount}
            {matchButton}
            {adaptNote && (
              <p className="pb-1.5 text-[11px] text-fg-4" data-testid="look-adapted">
                {adaptNote}
              </p>
            )}
            {overridesNote && <p className="pb-1.5 text-[11px] text-fg-4">{overridesNote}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SavePresetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('My look');
  const [description, setDescription] = useState('');
  const showToast = useEditor((s) => s.showToast);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save look"
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
              await usePresets.getState().create({ name, description, category: 'custom', tags: [], adjustments: adjustmentsToPresetValues(adj) });
              showToast(`Saved “${name.trim()}”. It is under Yours.`, 'success');
              onClose();
            }}
          >
            Save look
          </Button>
        </>
      }
    >
      <p className="px-5 pb-1 text-[13px] leading-relaxed text-fg-3">
        Saves this photo's light, colour, curve, grade and effects as a look under Yours. Crop, masks and retouching belong
        to the photo and are left out.
      </p>
      <PresetFields name={name} setName={setName} description={description} setDescription={setDescription} />
    </Dialog>
  );
}
