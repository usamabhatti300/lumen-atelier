/**
 * Reference Studio: reference photo -> measured + interpreted analysis ->
 * editable preset -> preview on the target -> refine -> save and reuse.
 */
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDashed,
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
  Wand2,
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
        className="flex h-full min-h-0 flex-col"
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
        <header className="theme-carton flex h-14 shrink-0 items-center gap-3 px-4 sm:px-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-fg text-ground">
            <Wand2 size={18} />
          </span>
          <h2 id="ref-title" className="carton-title text-[1.6rem] text-fg sm:text-[1.9rem]">
            Match a look
          </h2>
          <ol className="ml-auto hidden items-center gap-1 text-[11px] md:flex" aria-label="Progress">
            {['Reference', 'Analyse', 'Apply & refine'].map((label, i) => (
              <li key={label} className="flex items-center gap-1">
                <span
                  className={`carton-label flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs ${
                    step === i + 1 ? 'bg-fg text-ground' : step > i + 1 ? 'text-fg' : 'text-fg-3'
                  }`}
                  aria-current={step === i + 1 ? 'step' : undefined}
                >
                  <span className="tabular font-mono">{i + 1}</span>
                  {label}
                </span>
                {i < 2 && <ArrowRight size={12} className="text-fg-3" />}
              </li>
            ))}
          </ol>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-sm p-2 text-fg hover:bg-control md:ml-2">
            <X size={17} />
          </button>
        </header>
        <div aria-hidden className="bands-rule shrink-0" />

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
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 sm:p-6">
            {/* Explains the feature and gives explicit actions; the dashed area is still a drop zone. */}
            <div
              className={`flex w-full max-w-xl flex-col items-center rounded-md border border-dashed px-5 py-10 text-center transition-colors sm:px-8 sm:py-14 ${
                dragOver ? 'border-accent-fg bg-accent/5' : 'border-line'
              }`}
            >
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-sm bg-accent text-on-accent">
                <Wand2 size={24} />
              </span>
              <span className="carton-title text-[2.25rem] text-fg">Add a reference photo</span>
              <span className="mt-2 max-w-md text-sm leading-relaxed text-fg-3">
                Pick a photo whose look you love. The studio turns its colours and tones into an editable preset for your photo.
              </span>
              <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="Good references">
                {['Saved posts', 'Screenshots', 'Film stills', 'Your best shots'].map((t) => (
                  <li key={t} className="rounded-sm border border-line px-2.5 py-1 text-xs text-fg-2">
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<ImagePlus size={16} />} onClick={() => fileInput.current?.click()}>
                  Choose photo
                </Button>
                {canReadClipboard && (
                  <Button variant="secondary" icon={<ClipboardPaste size={16} />} onClick={() => void pasteFromClipboard()}>
                    Paste
                  </Button>
                )}
              </div>
              <span className="mt-3 text-[11px] text-fg-4 coarse:hidden">or drop it here, or press Ctrl+V. You can crop out app bars next.</span>
              <span className="mt-6 max-w-md text-[11px] leading-relaxed text-fg-4">
                The preset approximates the look from the finished image. The original editing settings cannot be
                recovered from a JPEG.
              </span>
            </div>
            {(loadError || pasteMessage) && (
              <p role="alert" className="absolute bottom-8 mx-4 max-w-md rounded-sm border border-danger/40 bg-ground-2 px-4 py-2 text-sm text-fg">
                {loadError ?? pasteMessage}
              </p>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,1fr)] lg:overflow-hidden">
            <ReferencePane onReplace={() => fileInput.current?.click()} />
            <div className="scroll-quiet min-h-0 border-line-soft lg:overflow-y-auto lg:border-l">
              <AnalysisPane />
              {/* Data is passed as props so the pane keeps its last values while it animates out after a reset. */}
              <AnimatePresence>
                {result && stats && working && <ApplyPane result={result} refStats={stats} working={working} onClose={onClose} onImportTarget={onImportTarget} />}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
      <ConsentDialog />
    </Dialog>
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
      <div className="theme-frame relative flex h-[min(44dvh,420px)] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-well lg:h-auto lg:min-h-[260px] lg:flex-1 lg:shrink">
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
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full w-full object-contain select-none ${cropping ? 'cursor-crosshair' : ''}`}
            draggable={false}
          />
          {running && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <div className="absolute inset-0 bg-well/25" />
              <div className="animate-scan absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-transparent via-accent/15 to-transparent">
                <div className="absolute inset-x-0 bottom-1/2 h-px bg-accent/70" />
              </div>
              <div className="absolute inset-0 [background-image:linear-gradient(rgba(236,230,218,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(236,230,218,0.05)_1px,transparent_1px)] [background-size:32px_32px]" />
            </div>
          )}
          {cropping && draft && draft.w > 0.01 && draft.h > 0.01 && (
            <div
              className="pointer-events-none absolute shadow-[0_0_0_9999px_rgba(13,12,11,0.6)] outline outline-1 outline-fg"
              style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {cropping ? (
          <>
            <span className="text-xs text-fg-3">Drag over the reference to select the part to use.</span>
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
            <span className="max-w-[45%] truncate text-xs text-fg-3" title={original.name}>
              {original.name} · {working.width}×{working.height}
              {crop ? ' (cropped)' : ''}
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {suggested && (
                <Button size="sm" variant="accent-outline" icon={<Crop size={13} />} disabled={running} onClick={() => void applyCrop(suggested)}>
                  Trim borders
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={<Crop size={13} />} disabled={running} onClick={() => setCropping(true)}>
                Crop
              </Button>
              {crop && (
                <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} disabled={running} onClick={() => void applyCrop(null)}>
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

      <AnimatePresence>
        {result && stats && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="edge-code mb-2">Palette</p>
              <div className="flex h-9 overflow-hidden rounded-xs ring-1 ring-line-soft" role="list" aria-label="Dominant colours">
                {stats.palette.map((c) => (
                  <div key={c.hex} role="listitem" title={`${c.hex} · ${Math.round(c.weight * 100)}%`} aria-label={`${c.hex}, ${Math.round(c.weight * 100)} percent`} style={{ background: c.hex, flexGrow: Math.max(0.04, c.weight) }} />
                ))}
              </div>
              <div className="tabular mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] text-fg-4">
                {stats.palette.slice(0, 5).map((c) => (
                  <span key={c.hex}>{c.hex}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="edge-code mb-2">Tonal zones</p>
              <ZoneScale distribution={stats.zones} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis stages and results
// ---------------------------------------------------------------------------

function StageRow({ label, stage, detail, action }: { label: string; stage: Stage; detail: string; action?: ReactNode }) {
  const icon =
    stage.state === 'running' ? (
      <Loader2 size={14} className="animate-spin text-accent-fg" />
    ) : stage.state === 'done' ? (
      <Check size={14} className="text-success" />
    ) : stage.state === 'skipped' ? (
      <Minus size={14} className="text-fg-4" />
    ) : stage.state === 'error' ? (
      <AlertTriangle size={14} className="text-danger" />
    ) : (
      <CircleDashed size={14} className="text-fg-4" />
    );
  return (
    <li className="py-2">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className={`text-[13px] ${stage.state === 'pending' ? 'text-fg-4' : 'text-fg'}`}>{label}</span>
        {action}
        <span className={`${action ? '' : 'ml-auto '}text-[11px] text-fg-4`}>
          {stage.state === 'running' ? 'in progress' : stage.state === 'done' ? 'done' : stage.state === 'skipped' ? 'skipped' : stage.state === 'error' ? 'failed' : ''}
        </span>
      </div>
      {stage.state === 'running' && <Indeterminate className="mt-2 ml-6 w-auto" />}
      <p className="mt-0.5 ml-6 text-[11.5px] leading-relaxed text-fg-3">{stage.note ?? detail}</p>
    </li>
  );
}

function AnalysisPane() {
  const stages = useReference((s) => s.stages);
  const running = useReference((s) => s.running);
  const result = useReference((s) => s.result);
  const health = useReference((s) => s.aiHealth);
  const aiModel = useReference((s) => s.aiModel);
  const consent = useSettings((s) => s.aiConsent);
  const anyError = Object.values(stages).some((s) => s.state === 'error');
  const [showWhy, setShowWhy] = useState(false);

  return (
    <section className="p-4 sm:p-6" aria-labelledby="analysis-heading">
      <div className="flex items-center justify-between">
        <h3 id="analysis-heading" className="text-[11px] font-semibold tracking-[0.14em] text-fg-2 uppercase">
          Analysis
        </h3>
        {running ? (
          <Button size="sm" variant="ghost" onClick={cancelAnalysis}>
            Cancel
          </Button>
        ) : (
          <Button size="sm" variant={result ? 'ghost' : 'primary'} icon={<Sparkles size={14} />} onClick={startAnalysis} data-testid="analyze">
            {result || anyError ? 'Analyse again' : 'Analyse look'}
          </Button>
        )}
      </div>
      <ul className="mt-2 divide-y divide-line-soft" aria-live="polite">
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
        <StageRow label="Preset generation" stage={stages.build} detail="Converts the analysis into editable settings with fixed, documented rules." />
      </ul>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="mt-5">
            <blockquote className="border-l-2 border-accent-fg/60 pl-4">
              <p className="text-[19px] leading-snug font-medium text-fg" data-testid="style-description">
                {result.description}
              </p>
              <footer className="mt-1.5 text-[11px] text-fg-4">
                {result.descriptionSource === 'ai' ? `Interpreted by ${aiModel ?? 'the vision model'}, grounded in measurements` : 'Written from measurements (no AI)'}
              </footer>
            </blockquote>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ConfidenceBadge level={result.confidence} />
              <span className="text-[11px] text-fg-4">
                {result.explanations.length} setting group{result.explanations.length === 1 ? '' : 's'} generated
              </span>
            </div>
            {result.warnings.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {result.warnings.map((w) => (
                  <li key={w} className="flex gap-2 text-xs leading-relaxed text-fg-2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-accent-fg" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setShowWhy(!showWhy)} aria-expanded={showWhy} className="mt-4 text-xs text-accent-fg hover:underline">
              {showWhy ? 'Hide' : 'Show'} how the preset was built
            </button>
            <AnimatePresence initial={false}>
              {showWhy && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-2 overflow-hidden">
                  {result.explanations.map((e, i) => (
                    <li key={i} className="rounded-xs bg-ground px-3 py-2">
                      <p className="flex items-center gap-2 text-[11px] font-medium text-fg-2">
                        {e.area}
                        <span className="rounded-full border border-line px-1.5 text-[9.5px] tracking-wide text-fg-4 uppercase">{e.basis.replace('+', ' + ')}</span>
                        {e.weak && <span className="text-[10px] text-accent-fg">low confidence</span>}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{e.text}</p>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ConfidenceBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const color = level === 'high' ? 'text-success border-success/40' : level === 'medium' ? 'text-accent-fg border-accent-fg/40' : 'text-danger border-danger/40';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${color}`} title="How reliable this estimate is">
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
  onClose: () => void;
  onImportTarget: () => void;
}

function ApplyPane({ result, refStats, working, onClose, onImportTarget }: ApplyPaneProps) {
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      className="border-t border-line-soft p-4 sm:p-6"
      aria-labelledby="apply-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="apply-heading" className="text-[11px] font-semibold tracking-[0.14em] text-fg-2 uppercase">
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
        <div className="mt-3 rounded-sm border border-dashed border-line p-4 text-sm text-fg-3">
          Add the photo you want to apply this look to.
          <Button size="sm" variant="secondary" className="mt-3" icon={<ImagePlus size={14} />} onClick={onImportTarget}>
            Add target photo
          </Button>
        </div>
      ) : (
        <>
          <div className="theme-frame relative mt-3 overflow-hidden rounded-sm bg-well">
            <canvas ref={canvas} className="block max-h-[340px] w-full object-contain" aria-label={`Preview of ${target.name}`} />
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
                className="absolute right-2 bottom-2 touch-none rounded-xs bg-well/80 px-2 py-1 text-[11px] text-fg select-none [-webkit-touch-callout:none] coarse:px-3 coarse:py-2 coarse:text-xs"
              >
                Hold to see before
              </button>
            )}
          </div>
          <p className="mt-1.5 truncate text-[11px] text-fg-4">
            Target: {target.name}
            {isApplied ? ` · look applied${applied?.name.includes('matched') ? ' (matched)' : ''}` : ready ? '' : ' · measuring photo…'}
          </p>
          {effectiveMode === 'matched' && matching && (
            <div className="mt-2" data-testid="match-progress">
              <p className="text-[11px] text-fg-3">
                {matching.pass === 0 ? 'Matching this photo to the reference…' : `Matching this photo to the reference · refinement pass ${matching.pass} of up to ${matching.max}`}
              </p>
              <Indeterminate className="mt-1.5" />
            </div>
          )}
          {mode === 'matched' && matchError && (
            <p className="mt-2 flex gap-2 text-xs text-fg-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" /> Matching failed ({matchError}); showing the generic look instead.
            </p>
          )}
          {!isApplied ? (
            <Button variant="primary" className="mt-3 w-full" icon={<Wand2 size={15} />} disabled={!ready} onClick={() => apply(100)} data-testid="apply-reference">
              {ready ? 'Re-apply look to photo' : 'Measuring photo…'}
            </Button>
          ) : (
            <div className="mt-3 rounded-sm border border-line bg-ground px-3 py-2">
              <Slider
                label="Intensity"
                value={applied!.amount}
                range={{ min: 0, max: 100, default: 100, step: 1 }}
                format={(v) => `${Math.round(v)}%`}
                onGestureStart={() => begin('Preset amount')}
                onGestureEnd={end}
                onChange={setAmount}
              />
            </div>
          )}

          <div className="mt-3">
            <label htmlFor="ref-preset-name" className="mb-1 block text-xs text-fg-3">
              Save as preset
            </label>
            <div className="flex gap-2">
              <input
                id="ref-preset-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-sm border border-line bg-well px-3 text-sm text-fg outline-none focus:border-accent-fg/60"
              />
              <Button variant="secondary" icon={<Save size={14} />} disabled={!name.trim()} onClick={() => void save()} data-testid="save-reference-preset">
                Save
              </Button>
            </div>
            {saved && <p className="mt-1.5 text-[11px] text-success">Saved as “{saved}”.</p>}
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-fg-4">
              Saves the reusable look at the current intensity, plus the reference's colour statistics so it can be matched
              to any other photo later (“Match to this photo” in the Presets panel). This photo's matched settings are not
              saved; to keep hand-refined settings, use “Save look” in the Presets panel.
            </p>
            <Button variant="primary" className="mt-3 w-full" icon={<SlidersHorizontal size={15} />} onClick={onClose}>
              Refine in the editor
            </Button>
          </div>

          {(warnings.length > 0 || notes.length > 0) && (
            <ul className="mt-3 space-y-1">
              {warnings.map((m) => (
                <li key={m} className="flex gap-2 text-xs text-fg-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-accent-fg" />
                  {m}
                </li>
              ))}
              {notes.map((m) => (
                <li key={m} className="flex gap-2 text-xs text-fg-3">
                  <Info size={13} className="mt-0.5 shrink-0 text-fg-4" />
                  {m}
                </li>
              ))}
            </ul>
          )}

          {effectiveMode === 'matched' && match && (
            <>
              <button type="button" onClick={() => setShowHow(!showHow)} aria-expanded={showHow} className="mt-3 text-xs text-accent-fg hover:underline">
                {showHow ? 'Hide' : 'Show'} how it was matched to this photo
              </button>
              <AnimatePresence initial={false}>
                {showHow && (
                  <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-2 overflow-hidden">
                    {match.explanations.map((e, i) => (
                      <li key={i} className="rounded-xs bg-ground px-3 py-2">
                        <p className="flex items-center gap-2 text-[11px] font-medium text-fg-2">
                          {e.area}
                          {e.weak && <span className="text-[10px] text-accent-fg">low confidence</span>}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{e.text}</p>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </>
          )}

          <div className="mt-3 space-y-0.5">
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
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-fg-2 uppercase">Compared with the reference</p>
              <ul className="space-y-1.5">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 rounded-xs bg-ground px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-fg">{s.title}</p>
                      <p className="text-[11px] leading-relaxed text-fg-3">{s.detail}</p>
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
              <p className="mt-1.5 text-[10.5px] text-fg-4">Suggestions close part of the gap and leave the photo's own lighting alone.</p>
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
            variant="primary"
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
      <div className="space-y-3 p-4 text-sm leading-relaxed text-fg-3">
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
