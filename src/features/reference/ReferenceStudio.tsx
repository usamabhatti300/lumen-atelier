/**
 * Reference Studio: reference photo -> measured + interpreted analysis ->
 * editable preset -> preview on the target -> refine -> save and reuse.
 *
 * Layout: one focused column on phones (reference hero, analysis, the look, apply) with the
 * screen's one main action in a bar at the bottom (Analyse look, then Refine in the editor);
 * two columns on desktop (reference and its measurements | analysis, apply, save).
 */
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Crop,
  ImagePlus,
  Info,
  Loader2,
  Minus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Blend,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Indeterminate, Segmented, Toggle } from '@/components/ui/misc';
import { Slider } from '@/components/ui/Slider';
import { ZoneScale } from '@/components/ZoneScale';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { engine } from '@/engine/controller';
import { usePresets } from '@/state/presetStore';
import { useSettings } from '@/state/settingsStore';
import { matchInWorker, matchSampleFor, samplesFor, statsInWorker } from '@/lib/analysis/client';
import { MATCH, type MatchResult } from '@/lib/analysis/match';
import { adaptToTarget, suggestRefinements, type Adaptation, type Suggestion } from '@/lib/analysis/adapt';
import type { ImageStats } from '@/lib/analysis/stats';
import type { MappingResult } from '@/lib/analysis/mapping';
import { cameraReadout } from '@/lib/analysis/readout';
import { blendPreset } from '@/lib/presets/blend';
import { defaultAdjustments, getPath, leafPaths, setPath, type PartialAdjustments } from '@/lib/schema/adjustments';
import { createCanvas, canvasToBlob } from '@/lib/image/decode';
import { newId } from '@/lib/storage/db';
import {
  applyCrop,
  cancelAiRefinement,
  cancelAnalysis,
  loadReference,
  resetReference,
  runAnalysis,
  startAnalysis,
  useReference,
  type Stage,
} from './useReferenceAnalysis';

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

const STEPS = ['Reference', 'Analyse', 'Apply & refine'];

export default function ReferenceStudio({ onClose, onImportTarget }: { onClose: () => void; onImportTarget: () => void }) {
  const original = useReference((s) => s.original);
  const result = useReference((s) => s.result);
  const stats = useReference((s) => s.stats);
  const working = useReference((s) => s.working);
  const running = useReference((s) => s.running);
  const loadError = useReference((s) => s.loadError);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const canReadClipboard = typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';

  // The Paste button: phones have no Ctrl+V, so read the clipboard on request (the browser asks for permission).
  const pasteFromClipboard = async () => {
    setPasteMessage(null);
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          void loadReference(await item.getType(type), 'pasted-image');
          return;
        }
      }
      setPasteMessage('There is no image on the clipboard. Copy a photo first, then tap Paste.');
    } catch {
      setPasteMessage('The clipboard could not be read. Copy the photo again, or choose it from your files.');
    }
  };

  // Paste an image from the clipboard (e.g. a screenshot).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        void loadReference(file, file.name || 'pasted-image.png');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const step = !original ? 1 : !result ? 2 : 3;

  return (
    <Dialog open onClose={onClose} fullscreen labelledBy="ref-title" dismissible={!running}>
      <div
        className="relative flex h-full min-h-0 flex-col bg-ground"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => e.relatedTarget === null && setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void loadReference(f, f.name);
        }}
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line-soft px-4 sm:px-6">
          <h2 id="ref-title" className="display text-[1.65rem] text-fg sm:text-[1.9rem]">
            Match a <span className="voice text-accent pr-1 text-[1.18em]">look</span>
          </h2>
          <ol className="ml-auto hidden items-center gap-1.5 md:flex" aria-label="Progress">
            {STEPS.map((label, i) => {
              const state = step === i + 1 ? 'now' : step > i + 1 ? 'done' : 'next';
              return (
                <li key={label}>
                  <span
                    className={`flex h-8 items-center gap-2 rounded-full pr-3.5 pl-1.5 text-[13px] font-medium transition-colors duration-300 ${
                      state === 'now' ? 'bg-accent text-on-accent' : state === 'done' ? 'bg-control text-fg' : 'text-fg-4'
                    }`}
                    aria-current={state === 'now' ? 'step' : undefined}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] ${
                        state === 'now' ? 'bg-on-accent text-accent' : state === 'done' ? 'bg-success/20 text-success' : 'border border-line-strong'
                      }`}
                    >
                      {state === 'done' ? <Check size={11} strokeWidth={3} /> : i + 1}
                    </span>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
          <span className="ml-auto font-mono text-xs text-fg-3 md:hidden" aria-hidden>
            {step}/3 · {STEPS[step - 1]}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-control text-fg-2 transition-transform hover:bg-control-2 hover:text-fg active:scale-90 md:ml-2"
          >
            <X size={18} />
          </button>
        </header>

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          data-testid="reference-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadReference(f, f.name);
            e.target.value = '';
          }}
        />

        {!original ? (
          <EmptyState
            dragOver={dragOver}
            onChoose={() => fileInput.current?.click()}
            onPaste={canReadClipboard ? () => void pasteFromClipboard() : undefined}
            message={loadError ?? pasteMessage}
          />
        ) : (
          <>
            <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,1fr)] lg:overflow-hidden">
              <ReferencePane onReplace={() => fileInput.current?.click()} />
              {/* Once the look exists, the payoff leads: your photo wearing it, then what the look is,
                  then how it was made. On phones this column moves above the reference. */}
              <div className={`scroll-quiet border-line-soft lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-l ${result ? 'order-first' : ''}`}>
                {/* Data is passed as props so the pane keeps its last values while it animates out after a reset. */}
                <AnimatePresence>
                  {result && stats && working && <ApplyPane result={result} refStats={stats} working={working} onImportTarget={onImportTarget} />}
                </AnimatePresence>
                <AnimatePresence>{result && <LookCard key="look" result={result} />}</AnimatePresence>
                <AnalysisPane />
                <Measurements className="px-4 pb-6 sm:px-6 lg:hidden" />
              </div>
            </div>
            <StudioBar onRefine={onClose} />
          </>
        )}
      </div>
      <ConsentDialog />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Empty state: what this does, and the way in
// ---------------------------------------------------------------------------

function EmptyState({ dragOver, onChoose, onPaste, message }: { dragOver: boolean; onChoose: () => void; onPaste?: () => void; message: string | null }) {
  return (
    <div className="scroll-quiet flex min-h-0 flex-1 overflow-y-auto">
      <div className="m-auto w-full max-w-xl px-4 py-6 sm:py-10">
        <div
          className={`relative flex flex-col items-center overflow-hidden rounded-xl border px-5 pt-12 pb-8 text-center transition-[border-color,box-shadow] duration-300 sm:px-10 sm:pt-16 ${
            dragOver ? 'border-accent shadow-selected' : 'border-line-soft'
          } bg-well`}
        >
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
            className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full p-[3px]"
            style={{ background: 'var(--color-accent)', boxShadow: 'var(--shadow-offset)' }}
          >
            <span className="flex h-full w-full items-center justify-center rounded-full bg-well text-accent">
              <Blend size={28} strokeWidth={1.8} />
            </span>
          </motion.span>
          <h3 className="display relative text-[2.1rem] text-fg sm:text-[2.6rem]">Add a reference photo</h3>
          <p className="relative mt-3 max-w-sm text-[15px] leading-relaxed text-fg-3">
            Pick a photo whose look you love. The studio turns its colours and tones into an editable preset for your photo.
          </p>
          <ul className="relative mt-5 flex flex-wrap justify-center gap-1.5" aria-label="Good references">
            {['Saved posts', 'Screenshots', 'Film stills', 'Your best shots'].map((t) => (
              <li key={t} className="rounded-full bg-control px-3 py-1 text-xs text-fg-2">
                {t}
              </li>
            ))}
          </ul>
          <div className="relative mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="accent" size="lg" icon={<ImagePlus size={18} />} onClick={onChoose}>
              Choose photo
            </Button>
            {onPaste && (
              <Button variant="secondary" size="lg" icon={<ClipboardPaste size={18} />} onClick={onPaste}>
                Paste
              </Button>
            )}
          </div>
          <span className="relative mt-4 text-xs text-fg-4 coarse:hidden">or drop it here, or press Ctrl+V. You can crop out app bars next.</span>
        </div>
        <p className="mx-auto mt-5 max-w-md text-center text-xs leading-relaxed text-fg-4">
          The preset approximates the look from the finished image. The original editing settings cannot be recovered from a JPEG.
        </p>
        {message && (
          <p role="alert" className="mx-auto mt-4 flex max-w-md gap-2 rounded-md border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-fg">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The bar at the bottom: the screen's one main action
// ---------------------------------------------------------------------------

function StudioBar({ onRefine }: { onRefine: () => void }) {
  const result = useReference((s) => s.result);
  const running = useReference((s) => s.running);
  const stages = useReference((s) => s.stages);
  const anyError = Object.values(stages).some((s) => s.state === 'error');
  const runningStage = stages.measure.state === 'running' ? 'Measuring the light' : stages.build.state === 'running' ? 'Building the preset' : 'Reading the style';
  return (
    <div className="shrink-0 border-t border-line-soft bg-ground px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-6">
      <div className="flex min-h-11 items-center gap-3">
        {running ? (
          <>
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/70" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-fg-2">{runningStage}…</p>
            <Button variant="secondary" onClick={cancelAnalysis}>
              Cancel
            </Button>
          </>
        ) : result ? (
          <>
            <p className="hidden min-w-0 flex-1 truncate text-sm text-fg-3 sm:block">Fine-tune any slider in the editor. The look stays editable.</p>
            <Button variant="accent" size="lg" className="flex-1 sm:flex-none" icon={<SlidersHorizontal size={17} />} onClick={onRefine}>
              Refine in the editor
            </Button>
          </>
        ) : (
          <>
            <p className="hidden min-w-0 flex-1 truncate text-sm text-fg-3 sm:block">Measured on this device. Nothing is uploaded unless you allow AI.</p>
            <Button variant="accent" size="lg" className="flex-1 sm:flex-none" icon={<Sparkles size={17} />} onClick={startAnalysis} data-testid="analyze">
              {anyError ? 'Analyse again' : 'Analyse look'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reference image with crop and scanning overlay
// ---------------------------------------------------------------------------

function ReferencePane({ onReplace }: { onReplace: () => void }) {
  const original = useReference((s) => s.original)!;
  const working = useReference((s) => s.working)!;
  const stats = useReference((s) => s.stats);
  const crop = useReference((s) => s.crop);
  const running = useReference((s) => s.running);
  const result = useReference((s) => s.result);
  const [cropping, setCropping] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const dragStart = useRef<[number, number] | null>(null);
  const suggested = stats?.suggestedCrop && !crop ? stats.suggestedCrop : null;
  const shown = cropping ? original : working;

  const toNorm = (e: React.PointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  return (
    // One column on phones: the pane keeps its full height (min-h-0 only in the two-column layout).
    <div className="flex flex-col p-4 sm:p-6 lg:min-h-0">
      <div
        className={`theme-frame relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-well ring-1 ring-line-soft transition-[height] duration-500 ease-out lg:h-auto lg:min-h-[260px] lg:flex-1 lg:shrink ${
          result && !running && !cropping ? 'h-[min(30dvh,280px)]' : 'h-[min(50dvh,460px)]'
        }`}
      >
        <div
          ref={box}
          className={`relative max-h-full ${cropping ? 'touch-none' : ''}`}
          style={{ aspectRatio: `${shown.width} / ${shown.height}`, height: '100%', maxWidth: '100%' }}
          onPointerDown={(e) => {
            if (!cropping) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragStart.current = toNorm(e);
            setDraft(null);
          }}
          onPointerMove={(e) => {
            if (!cropping || !dragStart.current) return;
            const [x, y] = toNorm(e);
            const [x0, y0] = dragStart.current;
            setDraft({ x: Math.min(x, x0), y: Math.min(y, y0), w: Math.abs(x - x0), h: Math.abs(y - y0) });
          }}
          onPointerUp={() => (dragStart.current = null)}
        >
          <motion.img
            key={shown.url}
            src={shown.url}
            alt={`Reference: ${original.name}`}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full w-full object-contain select-none ${cropping ? 'cursor-crosshair' : ''}`}
            draggable={false}
          />
          <AnimatePresence>
            {running && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="pointer-events-none absolute inset-0 overflow-hidden"
                aria-hidden
              >
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute inset-0 [background-image:linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
                <div className="animate-scan absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-[rgb(200_184_255/0.12)] to-transparent">
                  <div className="spectrum absolute inset-x-0 bottom-1/2 h-[2px] shadow-offset-sm" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* The look is ready: one sweep of light across the reference. */}
          {result && !running && <div key={result.description} className="afterimage-flash" aria-hidden />}
          {cropping && draft && draft.w > 0.01 && draft.h > 0.01 && (
            <div
              className="pointer-events-none absolute rounded-xs shadow-[0_0_0_9999px_rgb(0_0_0/0.62)] outline-2 outline-accent"
              style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
            />
          )}
        </div>
        {running && (
          <span className="surface-float absolute top-3 left-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-fg" aria-hidden>
            <Loader2 size={13} className="animate-spin text-accent" /> Analysing
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {cropping ? (
          <>
            <span className="text-[13px] text-fg-3">Drag over the reference to select the part to use.</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setCropping(false); setDraft(null); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!draft || draft.w < 0.05 || draft.h < 0.05}
                onClick={() => {
                  void applyCrop(draft);
                  setCropping(false);
                  setDraft(null);
                }}
              >
                Use selection
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="max-w-[45%] truncate font-mono text-xs text-fg-3" title={original.name}>
              {original.name} · {working.width}×{working.height}
              {crop ? ' (cropped)' : ''}
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {suggested && (
                <Button size="sm" variant="accent-outline" icon={<Crop size={14} />} disabled={running} onClick={() => void applyCrop(suggested)}>
                  Trim borders
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={<Crop size={14} />} disabled={running} onClick={() => setCropping(true)}>
                Crop
              </Button>
              {crop && (
                <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} disabled={running} onClick={() => void applyCrop(null)}>
                  Uncrop
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={running} onClick={onReplace}>
                Replace
              </Button>
            </div>
          </>
        )}
      </div>
      {suggested && !cropping && stats?.flags.screenshotLikely && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-accent-fg">
          <Info size={13} className="mt-0.5 shrink-0" /> This looks like a screenshot. Trim the interface bars so they do not skew the colours.
        </p>
      )}

      <Measurements className="mt-6 hidden lg:block" />
    </div>
  );
}

function Measurements({ className = '' }: { className?: string }) {
  const stats = useReference((s) => s.stats);
  const result = useReference((s) => s.result);
  return (
    <AnimatePresence>
      {result && stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className={className}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="label-caps mb-2.5 text-fg-3">Palette</p>
              <div className="flex h-12 overflow-hidden rounded-md ring-1 ring-line-soft" role="list" aria-label="Dominant colours">
                {stats.palette.map((c, i) => (
                  <motion.div
                    key={c.hex}
                    role="listitem"
                    title={`${c.hex} · ${Math.round(c.weight * 100)}%`}
                    aria-label={`${c.hex}, ${Math.round(c.weight * 100)} percent`}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.45, delay: 0.2 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    style={{ background: c.hex, flexGrow: Math.max(0.04, c.weight), transformOrigin: 'bottom' }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-fg-4">
                {stats.palette.slice(0, 5).map((c) => (
                  <span key={c.hex}>{c.hex}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="label-caps mb-2.5 text-fg-3">Tonal zones</p>
              <ZoneScale distribution={stats.zones} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Analysis stages and results
// ---------------------------------------------------------------------------

function StageRow({ label, stage, detail, action, last }: { label: string; stage: Stage; detail: string; action?: ReactNode; last?: boolean }) {
  const icon =
    stage.state === 'running' ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/60">
        <Loader2 size={14} className="animate-spin text-accent" />
      </span>
    ) : stage.state === 'done' ? (
      <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 18 }} className="flex h-7 w-7 items-center justify-center rounded-full bg-success/15 text-success">
        <Check size={14} strokeWidth={2.6} />
      </motion.span>
    ) : stage.state === 'skipped' ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-control text-fg-4">
        <Minus size={14} />
      </span>
    ) : stage.state === 'error' ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger/15 text-danger">
        <AlertTriangle size={13} />
      </span>
    ) : (
      <span className="block h-7 w-7 rounded-full border border-dashed border-line-strong" />
    );
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {!last && <span aria-hidden className="absolute top-8 bottom-1 left-[13.5px] w-px bg-line" />}
      <span className="relative flex shrink-0">{icon}</span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-center gap-2.5">
          <span className={`text-sm font-medium ${stage.state === 'pending' ? 'text-fg-4' : 'text-fg'}`}>{label}</span>
          {action}
          <span className={`${action ? '' : 'ml-auto '}font-mono text-[11px] text-fg-4`}>
            {stage.state === 'running' ? 'in progress' : stage.state === 'done' ? 'done' : stage.state === 'skipped' ? 'skipped' : stage.state === 'error' ? 'failed' : ''}
          </span>
        </div>
        {stage.state === 'running' && <Indeterminate className="mt-2" />}
        <p className="mt-1 text-[13px] leading-relaxed text-fg-3">{stage.note ?? detail}</p>
      </div>
    </li>
  );
}

/** The look, revealed: what was measured, in words, with its confidence. */
/** `result` is a prop (not read from the store) so the card keeps its data while it animates out after a reset. */
function LookCard({ result }: { result: MappingResult }) {
  const aiModel = useReference((s) => s.aiModel);
  const stats = useReference((s) => s.stats);
  const readout = useMemo(() => (stats ? cameraReadout(stats) : []), [stats]);
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div className="p-4 pb-0 sm:p-6 sm:pb-0">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="relative overflow-hidden rounded-xl border border-line-soft bg-raised p-5"
          >
            <span aria-hidden className="spectrum absolute inset-x-0 top-0 h-[2px]" />
            <p className="label-caps flex items-center gap-2 text-accent-fg">
              <Sparkles size={13} /> The look
            </p>
            <p className="mt-3 text-[21px] leading-[1.25] font-medium tracking-[-0.02em] text-fg sm:text-[23px]" data-testid="style-description">
              {result.description}
            </p>
            <p className="mt-2.5 text-xs text-fg-4">
              {result.descriptionSource === 'ai' ? `Interpreted by ${aiModel ?? 'the vision model'}, grounded in measurements` : 'Written from measurements (no AI)'}
            </p>
            {/* What was measured, read out like a camera's info screen. */}
            {readout.length > 0 && (
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md bg-well px-3.5 py-3 font-mono text-[11px]" data-testid="look-readout">
                {readout.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="text-fg-4">{r.label}</dt>
                    <dd className="text-right text-fg">{r.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ConfidenceBadge level={result.confidence} />
              <span className="rounded-full bg-control px-2.5 py-1 text-xs text-fg-2">
                {result.explanations.length} setting group{result.explanations.length === 1 ? '' : 's'} generated
              </span>
            </div>
            {result.warnings.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {result.warnings.map((w) => (
                  <li key={w} className="flex gap-2 text-[13px] leading-relaxed text-fg-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-fg-3" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setShowWhy(!showWhy)} aria-expanded={showWhy} className="mt-4 -ml-1 rounded-full px-1 py-1 text-[13px] font-medium text-fg-2 underline decoration-fg-4 underline-offset-4 hover:text-fg coarse:py-2.5">
              {showWhy ? 'Hide' : 'Show'} how the preset was built
            </button>
            <AnimatePresence initial={false}>
              {showWhy && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-2 overflow-hidden">
                  {result.explanations.map((e, i) => (
                    <li key={i} className="rounded-md bg-well px-3.5 py-2.5">
                      <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-fg-2">
                        {e.area}
                        <span className="rounded-full bg-control px-2 font-mono text-[10px] tracking-wide text-fg-3 uppercase">{e.basis.replace('+', ' + ')}</span>
                        {e.weak && <span className="text-[11px] text-fg-3">low confidence</span>}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-fg-3">{e.text}</p>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.div>
    </div>
  );
}

function AnalysisPane() {
  const stages = useReference((s) => s.stages);
  const running = useReference((s) => s.running);
  const result = useReference((s) => s.result);
  const health = useReference((s) => s.aiHealth);
  const consent = useSettings((s) => s.aiConsent);

  return (
    <section className={`p-4 sm:p-6 ${result ? 'border-t border-line-soft' : ''}`} aria-labelledby="analysis-heading">
      <div className="mb-4 flex min-h-8 items-center justify-between">
        <h3 id="analysis-heading" className="label-caps text-fg-3">
          Analysis
        </h3>
        {result && !running && (
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} onClick={startAnalysis} data-testid="analyze">
            Analyse again
          </Button>
        )}
      </div>
      <ul aria-live="polite">
        <StageRow label="Image statistics" stage={stages.measure} detail="Tones, colour casts, palette, saturation, grain and vignette evidence, measured from the pixels." />
        <StageRow
          label="Style interpretation"
          stage={stages.interpret}
          action={
            !running && stages.interpret.state === 'running' ? (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={cancelAiRefinement}>
                Cancel
              </Button>
            ) : undefined
          }
          detail={
            health?.configured
              ? health.local
                ? `A vision model running on this computer (${health.model}) refines the look in the background. The reference never leaves the device; on a laptop CPU this takes a few minutes.`
                : consent
                ? `A vision model (${health.model}) describes the look. A downscaled copy of the reference is sent via this app's server.`
                : 'Optional. Asks before sending the reference to the AI provider.'
              : health && !health.reachable
                ? 'The app server is not reachable, so measurements only.'
                : 'AI is not configured on this server, so the look is built from measurements only.'
          }
        />
        <StageRow label="Preset generation" stage={stages.build} detail="Converts the analysis into editable settings with fixed, documented rules." last />
      </ul>

    </section>
  );
}

function ConfidenceBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  // Confidence is information, not an error: only high gets colour (success); medium and low stay neutral.
  const color = level === 'high' ? 'text-success bg-success/12' : level === 'medium' ? 'text-fg-2 bg-control' : 'text-fg-3 bg-control ring-1 ring-line';
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${color}`} title="How reliable this estimate is">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low'} confidence
    </span>
  );
}

// ---------------------------------------------------------------------------
// Apply to target, refine, save
// ---------------------------------------------------------------------------

function withExtras(values: PartialAdjustments, extras: Adaptation['extras']): PartialAdjustments {
  const b = values.basic ?? {};
  const out: PartialAdjustments = structuredClone(values);
  if (extras.exposure) out.basic = { ...out.basic, exposure: Math.max(-5, Math.min(5, (b.exposure ?? 0) + extras.exposure)) };
  if (extras.temperature) out.basic = { ...out.basic, temperature: Math.max(-100, Math.min(100, (b.temperature ?? 0) + extras.temperature)) };
  if (extras.tint) out.basic = { ...out.basic, tint: Math.max(-100, Math.min(100, (b.tint ?? 0) + extras.tint)) };
  return out;
}

/** The preset's values at a given intensity (for saving). */
function scaledValues(values: PartialAdjustments, amount: number): PartialAdjustments {
  const full = blendPreset(defaultAdjustments(), values, amount);
  let out: PartialAdjustments = {};
  for (const p of leafPaths(values)) out = setPath(out, p, getPath(full, p));
  return out;
}

const SUGGESTION_PATHS: Record<string, string[]> = {
  exposure: ['basic.exposure'],
  contrast: ['basic.contrast'],
  saturation: ['basic.saturation'],
  'shadow-tint': ['grading.shadows.hue', 'grading.shadows.saturation'],
};

type ApplyMode = 'matched' | 'generic';

interface ApplyPaneProps {
  result: MappingResult;
  refStats: ImageStats;
  working: NonNullable<ReturnType<typeof useReference.getState>['working']>;
  onImportTarget: () => void;
}

function ApplyPane({ result, refStats, working, onImportTarget }: ApplyPaneProps) {
  const aiModel = useReference((s) => s.aiModel);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const photos = useEditor((s) => s.photos);
  const applied = useEditor((s) => s.edit.appliedPreset);
  const applyPreset = useEditor((s) => s.applyPreset);
  const setAmount = useEditor((s) => s.setPresetAmount);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const setUi = useEditor((s) => s.setUi);
  const commitEdit = useEditor((s) => s.commitEdit);
  const showToast = useEditor((s) => s.showToast);
  const previewSize = useEngine((s) => s.previewSize);
  const frame = useEngine((s) => s.frame);
  const [targetStatsFor, setTargetStatsFor] = useState<{ key: string; stats: ImageStats } | null>(null);
  const [opts, setOpts] = useState({ matchBrightness: false, neutralizeCast: true });
  const [mode, setMode] = useState<ApplyMode>('matched');
  const [matchFor, setMatchFor] = useState<{ key: string; match: MatchResult } | null>(null);
  const [matchState, setMatchState] = useState<{ key: string; pass: number; max: number; error?: string } | null>(null);
  const [suggestionState, setSuggestions] = useState<Suggestion[]>([]);
  const [name, setName] = useState(() => `Reference look ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  const [saved, setSaved] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);
  const presetId = useMemo(() => `ref:${newId()}`, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const isApplied = applied?.id === presetId;

  // Statistics of the target's unedited preview (for the generic look's adaptation).
  const targetKey = `${activePhotoId}:${previewSize?.width}x${previewSize?.height}`;
  useEffect(() => {
    const bmp = engine.getPreviewBitmap();
    if (!bmp || !activePhotoId) return;
    const { image, detail } = samplesFor(bmp);
    void statsInWorker(image, detail)
      .then((stats) => setTargetStatsFor({ key: targetKey, stats }))
      .catch(() => undefined);
  }, [activePhotoId, targetKey]);
  const targetStats = targetStatsFor?.key === targetKey ? targetStatsFor.stats : null;

  // Target-aware match (closed loop in the worker), recomputed when the photo, the reference or the
  // brightness option changes.
  const keepExposure = opts.matchBrightness ? 0 : MATCH.keepExposure;
  const matchKey = `${targetKey}:${keepExposure}:${refStats.width}x${refStats.height}:${result.description}`;
  useEffect(() => {
    const bmp = engine.getPreviewBitmap();
    if (!bmp || !activePhotoId) return;
    const controller = new AbortController();
    matchInWorker(refStats.features, matchSampleFor(bmp), result.adjustments, {
      keepExposure,
      signal: controller.signal,
      onProgress: (pass, max) => setMatchState({ key: matchKey, pass, max }),
    })
      .then((match) => {
        setMatchFor({ key: matchKey, match });
        setMatchState(null);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setMatchState({ key: matchKey, pass: 0, max: MATCH.iterations, error: e instanceof Error ? e.message : 'Matching failed.' });
      });
    return () => controller.abort();
  }, [activePhotoId, matchKey, keepExposure, refStats, result]);
  const match = matchFor?.key === matchKey ? matchFor.match : null;
  const matchError = matchState?.key === matchKey ? matchState.error : undefined;
  const matching = !match && !matchError && activePhotoId ? { pass: matchState?.key === matchKey ? matchState.pass : 0, max: MATCH.iterations } : null;

  const suggestions = isApplied && mode === 'generic' ? suggestionState : [];
  const adaptation = useMemo(() => (targetStats ? adaptToTarget(refStats, targetStats, opts) : null), [refStats, targetStats, opts]);
  // Matched mode falls back to the generic look only if matching failed.
  const effectiveMode: ApplyMode = mode === 'matched' && (match || !matchError) ? 'matched' : 'generic';
  const ready = effectiveMode === 'matched' ? !!match : !!adaptation;

  const apply = (amount = applied?.id === presetId ? applied.amount : 100) => {
    if (effectiveMode === 'matched') {
      if (!match) return;
      applyPreset({ id: presetId, name: 'Reference look (matched)', adjustments: match.adjustments }, amount);
    } else {
      if (!adaptation) return;
      applyPreset({ id: presetId, name: 'Reference look', adjustments: withExtras(result.adjustments, adaptation.extras) }, amount);
    }
  };

  // Apply the look as soon as it is ready (once per analysis), and re-apply when the mode or options change.
  const autoApplied = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!autoApplied.current) {
      autoApplied.current = true;
      apply(100);
    } else if (isApplied) apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, effectiveMode, match, adaptation]);

  // Live preview of the real render.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !activePhotoId) return;
    const img = engine.readRendered(1100);
    if (!img) return;
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')?.putImageData(img, 0, 0);
  }, [frame, activePhotoId]);

  // Generic look: compare the result with the reference (debounced). The matched look already did this in its loop.
  useEffect(() => {
    if (!isApplied || mode !== 'generic') return;
    const t = window.setTimeout(() => {
      const img = engine.readRendered(600);
      if (!img) return;
      void statsInWorker({ width: img.width, height: img.height, data: img.data })
        .then((s) => setSuggestions(suggestRefinements(refStats, s)))
        .catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(t);
  }, [frame, isApplied, refStats, mode]);

  const save = () =>
    saveLook().catch((e: unknown) => {
      // Never fail silently: storage can be full or blocked (e.g. a private window).
      showToast(`Could not save the preset: ${e instanceof Error ? e.message : 'unknown error'}.`, 'error');
    });

  const saveLook = async () => {
    const amount = isApplied ? applied!.amount : 100;
    const thumb = await referenceThumb(working.bitmap);
    const preset = await usePresets.getState().create({
      name,
      category: 'reference',
      origin: 'reference',
      description: result.description.slice(0, 400),
      tags: ['reference'],
      adjustments: scaledValues(result.adjustments, amount),
      reference: {
        styleSummary: result.description.slice(0, 600),
        palette: refStats.palette.slice(0, 8).map((p) => p.hex),
        confidence: result.confidence,
        notes: [...result.warnings, ...result.explanations.filter((e) => e.weak).map((e) => `${e.area}: ${e.text}`)].slice(0, 12).map((n) => n.slice(0, 300)),
        aiInterpretation: result.descriptionSource === 'ai',
        model: aiModel ?? undefined,
        thumbnail: thumb,
        features: refStats.features,
      },
    });
    setSaved(preset.name);
    showToast(`Saved “${preset.name}” to your presets. Apply it to any photo from the Presets panel, then use “Match to this photo”.`, 'success');
  };

  const target = photos.find((p) => p.id === activePhotoId);
  const warnings = effectiveMode === 'matched' && match ? match.warnings : (adaptation?.mismatch ?? []);
  const notes = effectiveMode === 'matched' && match ? match.notes : (adaptation?.notes ?? []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="p-4 sm:p-6"
      aria-labelledby="apply-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="apply-heading" className="label-caps text-fg-3">
          Apply to your photo
        </h3>
        {target && (
          <Segmented
            label="Apply mode"
            size="xs"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'matched', label: 'Matched to this photo', title: 'Compares this photo with the reference and sets the sliders to close the gap' },
              { value: 'generic', label: 'Generic look', title: 'The reusable look as measured from the reference, independent of this photo' },
            ]}
          />
        )}
      </div>
      {!target ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-line p-5 text-sm text-fg-3">
          Add the photo you want to apply this look to.
          <Button size="sm" variant="secondary" icon={<ImagePlus size={15} />} onClick={onImportTarget}>
            Add target photo
          </Button>
        </div>
      ) : (
        <>
          <div className="theme-frame relative mt-4 overflow-hidden rounded-xl bg-well ring-1 ring-line-soft">
            <canvas ref={canvas} className="block max-h-[380px] w-full object-contain" aria-label={`Preview of ${target.name}`} />
            {isApplied && <div key={`${applied?.name}`} className="afterimage-flash" aria-hidden />}
            {/* The reference, inset, so the two can be compared at a glance. */}
            <motion.img
              src={working.url}
              alt=""
              aria-hidden
              initial={{ opacity: 0, scale: 0.8, rotate: -4 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.35 }}
              className="pointer-events-none absolute top-3 right-3 h-16 w-16 rounded-md object-cover shadow-lift ring-2 ring-white/80 sm:h-20 sm:w-20"
            />
            <span className="surface-float pointer-events-none absolute top-3 left-3 rounded-full px-2.5 py-1 font-mono text-[11px] text-fg" aria-hidden>
              {isApplied ? `Your photo · ${Math.round(applied!.amount)}%` : 'Your photo'}
            </span>
            {isApplied && (
              <button
                type="button"
                onPointerDown={() => setUi({ compare: 'before' })}
                onPointerUp={() => setUi({ compare: 'off' })}
                onPointerLeave={() => setUi({ compare: 'off' })}
                onPointerCancel={() => setUi({ compare: 'off' })}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={(e) => e.key === ' ' && setUi({ compare: 'before' })}
                onKeyUp={() => setUi({ compare: 'off' })}
                className="surface-float absolute right-3 bottom-3 touch-none rounded-full px-3.5 py-2 text-xs font-medium text-fg select-none [-webkit-touch-callout:none] active:scale-95 coarse:px-4 coarse:py-3"
              >
                Hold to see before
              </button>
            )}
          </div>
          <p className="mt-2 truncate text-xs text-fg-4">
            Target: {target.name}
            {isApplied ? ` · look applied${applied?.name.includes('matched') ? ' (matched)' : ''}` : ready ? '' : ' · measuring photo…'}
          </p>
          {effectiveMode === 'matched' && matching && (
            <div className="mt-3" data-testid="match-progress">
              <p className="text-xs text-fg-3">
                {matching.pass === 0 ? 'Matching this photo to the reference…' : `Matching this photo to the reference · refinement pass ${matching.pass} of up to ${matching.max}`}
              </p>
              <Indeterminate className="mt-2" />
            </div>
          )}
          {mode === 'matched' && matchError && (
            <p className="mt-3 flex gap-2 text-[13px] text-fg-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" /> Matching failed ({matchError}); showing the generic look instead.
            </p>
          )}
          {/* While matching runs, its status above is the whole story; no disabled button under it. */}
          {!isApplied ? (
            effectiveMode === 'matched' && matching ? null : <Button variant="primary" className="mt-4 w-full" icon={<Blend size={16} />} disabled={!ready} onClick={() => apply(100)} data-testid="apply-reference">
              {ready ? 'Re-apply look to photo' : 'Measuring photo…'}
            </Button>
          ) : (
            <div className="mt-4 rounded-lg bg-raised px-4 pt-2 pb-1">
              <Slider
                label="Intensity"
                size="lg"
                value={applied!.amount}
                range={{ min: 0, max: 100, default: 100, step: 1 }}
                format={(v) => `${Math.round(v)}%`}
                onGestureStart={() => begin('Preset amount')}
                onGestureEnd={end}
                onChange={setAmount}
              />
            </div>
          )}

          <div className="mt-4 rounded-lg bg-raised p-4">
            <label htmlFor="ref-preset-name" className="mb-2 block text-sm font-medium text-fg">
              Save as preset
            </label>
            <div className="flex gap-2">
              <input
                id="ref-preset-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-well px-4 text-sm text-fg outline-none transition-colors focus:border-accent/60"
              />
              <Button variant="primary" className="h-11" icon={<Save size={15} />} disabled={!name.trim()} onClick={() => void save()} data-testid="save-reference-preset">
                Save
              </Button>
            </div>
            <AnimatePresence>
              {saved && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-center gap-1.5 text-[13px] text-success">
                  <Check size={14} strokeWidth={2.6} />
                  <span>Saved as “{saved}”.</span>
                </motion.p>
              )}
            </AnimatePresence>
            <p className="mt-2.5 text-xs leading-relaxed text-fg-4">
              Saves the reusable look at the current intensity, plus the reference's colour statistics so it can be matched
              to any other photo later (“Match to this photo” in the Presets panel). This photo's matched settings are not
              saved; to keep hand-refined settings, use “Save look” in the Presets panel.
            </p>
          </div>

          {(warnings.length > 0 || notes.length > 0) && (
            <ul className="mt-4 space-y-1.5">
              {warnings.map((m) => (
                <li key={m} className="flex gap-2 text-[13px] text-fg-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-fg-3" />
                  {m}
                </li>
              ))}
              {notes.map((m) => (
                <li key={m} className="flex gap-2 text-[13px] text-fg-3">
                  <Info size={14} className="mt-0.5 shrink-0 text-fg-4" />
                  {m}
                </li>
              ))}
            </ul>
          )}

          {effectiveMode === 'matched' && match && (
            <>
              <button type="button" onClick={() => setShowHow(!showHow)} aria-expanded={showHow} className="mt-4 -ml-1 rounded-full px-1 py-1 text-[13px] font-medium text-fg-2 underline decoration-fg-4 underline-offset-4 hover:text-fg coarse:py-2.5">
                {showHow ? 'Hide' : 'Show'} how it was matched to this photo
              </button>
              <AnimatePresence initial={false}>
                {showHow && (
                  <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-2 overflow-hidden">
                    {match.explanations.map((e, i) => (
                      <li key={i} className="rounded-md bg-raised px-3.5 py-2.5">
                        <p className="flex items-center gap-2 text-xs font-medium text-fg-2">
                          {e.area}
                          {e.weak && <span className="text-[11px] text-fg-3">low confidence</span>}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-fg-3">{e.text}</p>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </>
          )}

          <div className="mt-4 space-y-1 border-t border-line-soft pt-3">
            {mode === 'generic' && (
              <Toggle checked={opts.neutralizeCast} onChange={(v) => setOpts({ ...opts, neutralizeCast: v })} label="Neutralise this photo's colour cast first" description="Keeps the reference's grade consistent when the two photos were lit differently." />
            )}
            <Toggle
              checked={opts.matchBrightness}
              onChange={(v) => setOpts({ ...opts, matchBrightness: v })}
              label="Match the reference's brightness fully"
              description={
                mode === 'matched'
                  ? `Off by default: the match keeps ${Math.round(MATCH.keepExposure * 100)}% of this photo's own brightness, since part of it belongs to the scene.`
                  : 'Off by default: brightness usually belongs to the scene, not the style.'
              }
            />
          </div>

          {isApplied && suggestions.length > 0 && (
            <div className="mt-5">
              <p className="label-caps mb-2 text-fg-3">Compared with the reference</p>
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 rounded-md bg-raised px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-fg">{s.title}</p>
                      <p className="text-xs leading-relaxed text-fg-3">{s.detail}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        commitEdit(s.title, (e) => ({
                          ...e,
                          adjustments: s.apply(e.adjustments),
                          appliedPreset: e.appliedPreset && {
                            ...e.appliedPreset,
                            overrides: [...new Set([...e.appliedPreset.overrides, ...(SUGGESTION_PATHS[s.id] ?? [])])],
                          },
                        }))
                      }
                    >
                      Apply
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-fg-4">Suggestions close part of the gap and leave the photo's own lighting alone.</p>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}

async function referenceThumb(bitmap: ImageBitmap): Promise<string> {
  const k = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
  const c = createCanvas(Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k)));
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(bitmap, 0, 0, c.width, c.height);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.8);
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

function ConsentDialog() {
  const needs = useReference((s) => s.needsConsent);
  const health = useReference((s) => s.aiHealth);
  const update = useSettings((s) => s.update);
  const close = () => useReference.setState({ needsConsent: false });
  return (
    <Dialog
      open={needs}
      onClose={close}
      title="Send the reference to the AI model?"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              close();
              void runAnalysis({ useAi: false });
            }}
          >
            Measurements only
          </Button>
          <Button
            variant="accent"
            onClick={() => {
              update({ aiConsent: true });
              close();
              void runAnalysis({ useAi: true });
            }}
          >
            Allow and analyse
          </Button>
        </>
      }
    >
      <div className="space-y-3 px-5 pb-5 text-sm leading-relaxed text-fg-3">
        <p>
          To describe the style, a <span className="text-fg">downscaled copy (max 1024 px) of the reference image</span> is sent
          through this app's server to Anthropic's API ({health?.model ?? 'Claude'}). Your photos being edited are
          never sent.
        </p>
        <p>
          This app does not store the image on the server. Anthropic processes it under its API data policies. Only use
          references you are allowed to share.
        </p>
        <p className="text-xs text-fg-4">You can change this any time in Settings → Privacy. Choosing “Measurements only” builds the preset from pixel statistics alone.</p>
      </div>
    </Dialog>
  );
}

export { resetReference };
