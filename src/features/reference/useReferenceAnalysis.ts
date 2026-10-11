/**
 * State machine for the reference workflow:
 * load -> (crop) -> measure -> interpret (AI, optional) -> build preset.
 * With a slow local model (Ollama on this computer) the preset is built from
 * measurements first and the AI refines it in the background (cancellable).
 * Stage states are only marked "done" after the work actually finished.
 */
import { create } from 'zustand';
import { canvasToBlob, createCanvas, decodeImageBlob } from '@/lib/image/decode';
import { safeFileName } from '@/lib/image/fileTypes';
import { samplesFor, statsInWorker, getAiHealth, encodeForAi, interpretWithAi, AiError, type AiHealth } from '@/lib/analysis/client';
import { measuredSummary, type ImageStats } from '@/lib/analysis/stats';
import { mapReferenceToPreset, type MappingResult } from '@/lib/analysis/mapping';
import { MeasuredSummarySchema } from '@shared/ai-schema';
import { useSettings } from '@/state/settingsStore';

export type StageState = 'pending' | 'running' | 'done' | 'skipped' | 'error';
export interface Stage {
  state: StageState;
  note?: string;
}

export interface RefImage {
  bitmap: ImageBitmap;
  url: string;
  name: string;
  width: number;
  height: number;
}

interface RefState {
  original: RefImage | null;
  /** Normalized crop applied to the original, or null for the whole image. */
  crop: { x: number; y: number; w: number; h: number } | null;
  working: RefImage | null;
  loadError: string | null;
  stages: { measure: Stage; interpret: Stage; build: Stage };
  stats: ImageStats | null;
  aiModel: string | null;
  aiHealth: AiHealth | null;
  result: MappingResult | null;
  running: boolean;
  needsConsent: boolean;
  controller: AbortController | null;
}

const initialStages = () => ({ measure: { state: 'pending' as StageState }, interpret: { state: 'pending' as StageState }, build: { state: 'pending' as StageState } });

export const useReference = create<RefState>(() => ({
  original: null,
  crop: null,
  working: null,
  loadError: null,
  stages: initialStages(),
  stats: null,
  aiModel: null,
  aiHealth: null,
  result: null,
  running: false,
  needsConsent: false,
  controller: null,
}));

/** Background refinement with a local model; aborted whenever the reference or analysis changes. */
let aiRefinement: AbortController | null = null;
function stopAiRefinement() {
  aiRefinement?.abort();
  aiRefinement = null;
}

/** Cancels the background AI refinement and keeps the measurements-only look. */
export function cancelAiRefinement() {
  if (!aiRefinement) return;
  stopAiRefinement();
  useReference.setState((st) => ({
    stages: { ...st.stages, interpret: { state: 'skipped', note: 'AI refinement cancelled. The look built from measurements is kept.' } },
  }));
}

function release(img: RefImage | null) {
  if (!img) return;
  img.bitmap.close();
  URL.revokeObjectURL(img.url);
}

async function toRefImage(bitmap: ImageBitmap, name: string): Promise<RefImage> {
  // Display copy only (analysis uses the full bitmap).
  const k = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const c = createCanvas(Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k)));
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
  return { bitmap, url: URL.createObjectURL(blob), name, width: bitmap.width, height: bitmap.height };
}

export async function loadReference(blob: Blob, rawName: string) {
  const s = useReference.getState();
  s.controller?.abort();
  stopAiRefinement();
  const name = safeFileName(rawName, 'reference');
  try {
    const decoded = await decodeImageBlob(blob, name);
    const img = await toRefImage(decoded.bitmap, name);
    release(s.working !== s.original ? s.working : null);
    release(s.original);
    useReference.setState({
      original: img,
      working: img,
      crop: null,
      loadError: null,
      stages: initialStages(),
      stats: null,
      result: null,
      running: false,
      controller: null,
    });
    void getAiHealth().then((h) => useReference.setState({ aiHealth: h }));
    // Measure immediately so screenshot detection can suggest a crop before analysis.
    void quickMeasure();
  } catch (e) {
    useReference.setState({ loadError: e instanceof Error ? e.message : 'This image could not be opened.' });
  }
}

/** Fast statistics pass used for crop suggestions (no AI). */
async function quickMeasure() {
  const w = useReference.getState().working;
  if (!w) return;
  try {
    const { image, detail } = samplesFor(w.bitmap);
    const stats = await statsInWorker(image, detail);
    if (useReference.getState().working === w) useReference.setState({ stats });
  } catch {
    /* the full analysis will report errors */
  }
}

export async function applyCrop(crop: { x: number; y: number; w: number; h: number } | null) {
  const s = useReference.getState();
  if (!s.original) return;
  stopAiRefinement();
  if (s.working && s.working !== s.original) release(s.working);
  if (!crop || (crop.w > 0.995 && crop.h > 0.995)) {
    useReference.setState({ crop: null, working: s.original, result: null, stats: null, stages: initialStages() });
  } else {
    const o = s.original;
    const sx = Math.round(crop.x * o.width);
    const sy = Math.round(crop.y * o.height);
    const sw = Math.max(8, Math.round(crop.w * o.width));
    const sh = Math.max(8, Math.round(crop.h * o.height));
    const bmp = await createImageBitmap(o.bitmap, sx, sy, sw, sh);
    const img = await toRefImage(bmp, o.name);
    useReference.setState({ crop, working: img, result: null, stats: null, stages: initialStages() });
  }
  void quickMeasure();
}

export function cancelAnalysis() {
  const s = useReference.getState();
  s.controller?.abort();
  useReference.setState((st) => ({
    running: false,
    controller: null,
    stages: {
      measure: st.stages.measure.state === 'running' ? { state: 'error', note: 'Cancelled' } : st.stages.measure,
      interpret: st.stages.interpret.state === 'running' ? { state: 'error', note: 'Cancelled' } : st.stages.interpret,
      build: st.stages.build.state === 'running' ? { state: 'error', note: 'Cancelled' } : st.stages.build,
    },
  }));
}

/**
 * Runs the analysis. `useAi`: whether the user allowed sending the image to
 * the AI provider for this run (consent is also remembered in settings).
 */
export async function runAnalysis(opts: { useAi: boolean }) {
  const s = useReference.getState();
  const working = s.working;
  if (!working || s.running) return;
  stopAiRefinement();
  const controller = new AbortController();
  const signal = controller.signal;
  const setStage = (key: keyof RefState['stages'], stage: Stage) =>
    useReference.setState((st) => ({ stages: { ...st.stages, [key]: stage } }));
  useReference.setState({ running: true, controller, result: null, stages: initialStages(), needsConsent: false });

  // 1. Measure.
  setStage('measure', { state: 'running' });
  let stats: ImageStats;
  try {
    const { image, detail } = samplesFor(working.bitmap);
    stats = await statsInWorker(image, detail, signal);
    if (signal.aborted) return;
    setStage('measure', { state: 'done' });
    useReference.setState({ stats });
  } catch (e) {
    if (signal.aborted) return;
    setStage('measure', { state: 'error', note: e instanceof Error ? e.message : 'Measurement failed.' });
    useReference.setState({ running: false, controller: null });
    return;
  }

  // 2. Interpret (AI) — optional.
  let interpretation = null;
  let model: string | null = null;
  const health = await getAiHealth();
  useReference.setState({ aiHealth: health });
  if (!health.reachable) {
    setStage('interpret', { state: 'skipped', note: 'App server unreachable. Using measurements only.' });
  } else if (!health.configured) {
    setStage('interpret', { state: 'skipped', note: 'No AI model is available (no API key, and the local model is not running). Using measurements only.' });
  } else if (!opts.useAi) {
    setStage('interpret', { state: 'skipped', note: 'Not sent to AI (your choice). Using measurements only.' });
  } else if (health.local) {
    // Slow on a laptop CPU: build from measurements now, refine in the background.
    setStage('build', { state: 'running' });
    try {
      const result = mapReferenceToPreset(stats, null);
      setStage('build', { state: 'done', note: 'Built from measurements. The local AI refines it in the background and the look updates when it finishes.' });
      useReference.setState({ result, aiModel: null, running: false, controller: null });
    } catch (e) {
      setStage('build', { state: 'error', note: e instanceof Error ? e.message : 'Could not build a preset.' });
      useReference.setState({ running: false, controller: null });
      return;
    }
    void refineWithLocalAi(working, stats, health);
    return;
  } else {
    setStage('interpret', { state: 'running' });
    try {
      const image = await encodeForAi(working.bitmap, health.maxImageSide);
      const measured = MeasuredSummarySchema.parse(measuredSummary(stats));
      const res = await interpretWithAi(image, measured, signal, health.timeoutMs);
      interpretation = res.interpretation;
      model = res.model;
      setStage('interpret', { state: 'done' });
    } catch (e) {
      if (signal.aborted) return;
      const msg = e instanceof AiError ? e.message : 'The AI request failed.';
      setStage('interpret', { state: 'error', note: `${msg} Continuing with measurements only.` });
    }
  }
  if (signal.aborted) return;

  // 3. Build the preset (deterministic).
  setStage('build', { state: 'running' });
  try {
    const result = mapReferenceToPreset(stats, interpretation);
    setStage('build', { state: 'done' });
    useReference.setState({ result, aiModel: model, running: false, controller: null });
  } catch (e) {
    setStage('build', { state: 'error', note: e instanceof Error ? e.message : 'Could not build a preset.' });
    useReference.setState({ running: false, controller: null });
  }
}

async function refineWithLocalAi(working: RefImage, stats: ImageStats, health: AiHealth) {
  const controller = new AbortController();
  aiRefinement = controller;
  const started = Date.now();
  const setInterpret = (stage: Stage) => useReference.setState((st) => ({ stages: { ...st.stages, interpret: stage } }));
  setInterpret({ state: 'running', note: `Refining with ${health.model} on this computer. This can take a few minutes on a laptop; you can keep editing.` });
  try {
    const image = await encodeForAi(working.bitmap, health.maxImageSide);
    const measured = MeasuredSummarySchema.parse(measuredSummary(stats));
    const res = await interpretWithAi(image, measured, controller.signal, health.timeoutMs);
    if (controller.signal.aborted || useReference.getState().stats !== stats) return;
    const result = mapReferenceToPreset(stats, res.interpretation);
    const secs = Math.round((Date.now() - started) / 1000);
    setInterpret({ state: 'done', note: `Refined by ${res.model} on this computer in ${secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`}.` });
    useReference.setState({ result, aiModel: res.model });
  } catch (e) {
    if (controller.signal.aborted) return;
    const msg = e instanceof AiError ? e.message : 'The local AI request failed.';
    setInterpret({ state: 'error', note: `${msg} The look built from measurements is kept.` });
  } finally {
    if (aiRefinement === controller) aiRefinement = null;
  }
}

export function startAnalysis() {
  const consent = useSettings.getState().aiConsent;
  const health = useReference.getState().aiHealth;
  // A local model keeps the reference on this computer, so no consent is needed.
  if (health?.local) {
    void runAnalysis({ useAi: true });
    return;
  }
  if (!consent && health?.configured) {
    useReference.setState({ needsConsent: true });
    return;
  }
  void runAnalysis({ useAi: consent });
}

export function resetReference() {
  const s = useReference.getState();
  s.controller?.abort();
  stopAiRefinement();
  if (s.working !== s.original) release(s.working);
  release(s.original);
  useReference.setState({ original: null, working: null, crop: null, stats: null, result: null, stages: initialStages(), running: false, controller: null, loadError: null });
}
