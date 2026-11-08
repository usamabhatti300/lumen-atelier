/**
 * Runs on-device face landmark detection and person segmentation for the
 * active photo (once per photo per session) and hands the results to the
 * engine as a portrait mask and segmentation maps.
 *
 * It starts by itself in the background when a photo opens (`autoDetectPortrait`, Settings →
 * Detect faces automatically), can be stopped (`cancelPortraitAnalysis`), and the Portrait panel's
 * button runs it again on demand. A photo whose detection the user stopped isn't re-run automatically.
 */
import { create } from 'zustand';
import { engine } from '@/engine/controller';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { resizeBitmap } from '@/lib/image/decode';
import { buildPortraitMask } from '@/lib/portrait/faceMask';
import { ModelsMissingError } from '@/lib/portrait/mediapipe';
import { detectPortrait } from '@/lib/portrait/portraitClient';
import { maskCanvasSize, type SegmentationMaps } from '@/lib/masks/rasterize';

export type PortraitStatus = 'idle' | 'running' | 'ready' | 'missing-models' | 'error';

interface PortraitState {
  status: Record<string, PortraitStatus>;
  faces: Record<string, number>;
  person: Record<string, boolean>;
  message: Record<string, string>;
}

export const usePortraitStore = create<PortraitState>(() => ({ status: {}, faces: {}, person: {}, message: {} }));

export function usePortrait() {
  const id = useEditor((s) => s.activePhotoId) ?? '';
  const status = usePortraitStore((s) => s.status[id] ?? 'idle');
  const faces = usePortraitStore((s) => s.faces[id] ?? 0);
  const person = usePortraitStore((s) => s.person[id] ?? false);
  const message = usePortraitStore((s) => s.message[id] ?? '');
  return { status, faces, person, message, photoId: id };
}

const running = new Map<string, { job: Promise<void>; abort: AbortController }>();
/** Photos whose detection the user stopped: not started again automatically this session. */
const stopped = new Set<string>();

export function ensurePortraitAnalysis(): Promise<void> {
  const id = engine.getActivePhotoId();
  if (!id) return Promise.resolve();
  const st = usePortraitStore.getState().status[id];
  if (st === 'ready') return Promise.resolve();
  const existing = running.get(id);
  if (existing) return existing.job;
  stopped.delete(id);
  const abort = new AbortController();
  const job = run(id, abort.signal).finally(() => running.delete(id));
  running.set(id, { job, abort });
  return job;
}

/** Stops a running detection (the photo returns to "not detected"; the panel's button runs it again). */
export function cancelPortraitAnalysis(id = engine.getActivePhotoId() ?? '', byUser = true): void {
  const r = running.get(id);
  if (!r) return;
  if (byUser) stopped.add(id);
  r.abort.abort();
}

/** Runs detection again for the open photo (the panel's retry). */
export function redetectPortrait(): Promise<void> {
  const id = engine.getActivePhotoId();
  if (!id || running.has(id)) return ensurePortraitAnalysis();
  usePortraitStore.setState((s) => ({ status: { ...s.status, [id]: 'idle' }, message: { ...s.message, [id]: '' } }));
  return ensurePortraitAnalysis();
}

/**
 * Starts detection in the background for the photo that just opened, unless it is already known,
 * running, stopped by the user, or turned off in Settings. Waits for an idle moment so the photo and
 * the looks show first. Returns a function that cancels the pending start.
 */
export function autoDetectPortrait(id: string): () => void {
  const st = usePortraitStore.getState().status[id];
  if (!useSettings.getState().autoDetectFaces || stopped.has(id) || running.has(id) || (st && st !== 'idle')) return () => undefined;
  let cancelled = false;
  const start = () => {
    if (!cancelled && engine.getActivePhotoId() === id) void ensurePortraitAnalysis();
  };
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const handle = ric ? ric(start, { timeout: 2500 }) : setTimeout(start, 1200);
  return () => {
    cancelled = true;
    const cic = (globalThis as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
    if (ric && cic) cic(handle as number);
    else clearTimeout(handle as ReturnType<typeof setTimeout>);
  };
}

const abortError = () => new DOMException('Detection stopped.', 'AbortError');

function set(id: string, patch: { status?: PortraitStatus; faces?: number; person?: boolean; message?: string }) {
  usePortraitStore.setState((s) => ({
    status: patch.status ? { ...s.status, [id]: patch.status } : s.status,
    faces: patch.faces !== undefined ? { ...s.faces, [id]: patch.faces } : s.faces,
    person: patch.person !== undefined ? { ...s.person, [id]: patch.person } : s.person,
    message: patch.message !== undefined ? { ...s.message, [id]: patch.message } : s.message,
  }));
}

export interface PortraitAnalysis {
  mask: ImageData | null;
  segmentation: SegmentationMaps | null;
  faces: number;
  personFraction: number;
  segError: string;
}

/** Face landmarks + person segmentation for any image (used by the editor and batch export). */
export async function analyzePortraitBitmap(
  source: ImageBitmap,
  full: { width: number; height: number },
  signal?: AbortSignal,
): Promise<PortraitAnalysis> {
  // The models run in the portrait worker; a stop answers at once and the late result is dropped.
  if (signal?.aborted) throw abortError();
  const input = await resizeBitmap(source, 1280);
  const { faces, regions, segmentation, segError } = await detectPortrait(input, signal);
  let personFraction = 0;
  if (segmentation) {
    const m = segmentation.maps.subject;
    let sum = 0;
    for (let i = 0; i < m.length; i++) sum += m[i] > 127 ? 1 : 0;
    personFraction = sum / m.length;
  }
  const mask = faces.length && regions ? buildPortraitMask(faces, regions, maskCanvasSize(full, 1280), segmentation) : null;
  return { mask, segmentation, faces: faces.length, personFraction, segError };
}

async function run(id: string, signal: AbortSignal) {
  const preview = engine.getPreviewBitmap();
  const full = engine.getFullSize();
  if (!preview || !full) return;
  set(id, { status: 'running', message: '' });
  try {
    const a = await analyzePortraitBitmap(preview, full, signal);
    if (signal.aborted) throw abortError();
    if (engine.getActivePhotoId() !== id) {
      set(id, { status: 'idle' });
      return;
    }
    engine.setPortraitData(id, { mask: a.mask, segmentation: a.segmentation, faces: a.faces });
    const notes: string[] = [];
    if (!a.faces)
      notes.push('No face was found. Skin, eye and teeth tools need a clearly visible face; profiles and covered faces may not be detected.');
    if (a.faces > 1) notes.push(`${a.faces} faces found. Retouching applies to all of them.`);
    if (a.segmentation && a.personFraction < 0.01) notes.push('No person was detected, so subject and background masks will be empty.');
    if (a.segError) notes.push(a.segError);
    set(id, { status: 'ready', faces: a.faces, person: a.personFraction >= 0.01, message: notes.join(' ') });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      set(id, { status: 'idle', message: stopped.has(id) ? 'Stopped. Detect again whenever you need the portrait tools.' : '' });
    } else if (e instanceof ModelsMissingError) {
      set(id, { status: 'missing-models', message: e.message });
    } else {
      console.error('[portrait]', e);
      set(id, { status: 'error', message: 'Face and subject detection failed to run in this browser.' });
    }
  }
}
