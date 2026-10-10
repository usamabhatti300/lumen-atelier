/**
 * Depth estimation for lens blur: once per photo, on this device. The depth
 * map comes from memory, then the IndexedDB cache, and only then from the
 * model (Depth Anything V2 Small in the ML worker, with real download
 * progress and cancel). It is handed to the engine, never baked into pixels.
 */
import { create } from 'zustand';
import { engine } from '@/engine/controller';
import { useEngine } from '@/engine/engineStore';
import { useEditor } from '@/state/editorStore';
import { bitmapToImageData } from '@/lib/image/decode';
import { estimateDepth } from '@/lib/ml/client';
import { getCachedDepth, putCachedDepth } from '@/lib/storage/depthCache';
import { autoFocus, focusFromNearness, type DepthMap } from '@/lib/depth/raster';
import { ensurePortraitAnalysis } from '@/features/portrait/portraitState';

export type DepthStatus = 'idle' | 'running' | 'ready' | 'missing-model' | 'error';

interface DepthState {
  status: Record<string, DepthStatus>;
  /** Model download progress in bytes while the model is being fetched (null otherwise). */
  progress: Record<string, { loaded: number; total: number } | null>;
  message: Record<string, string>;
}

export const useDepthStore = create<DepthState>(() => ({ status: {}, progress: {}, message: {} }));

export function useDepth() {
  const id = useEditor((s) => s.activePhotoId) ?? '';
  const status = useDepthStore((s) => s.status[id] ?? 'idle');
  const progress = useDepthStore((s) => s.progress[id] ?? null);
  const message = useDepthStore((s) => s.message[id] ?? '');
  return { photoId: id, status, progress, message };
}

function set(id: string, patch: { status?: DepthStatus; progress?: { loaded: number; total: number } | null; message?: string }) {
  useDepthStore.setState((s) => ({
    status: patch.status ? { ...s.status, [id]: patch.status } : s.status,
    progress: patch.progress !== undefined ? { ...s.progress, [id]: patch.progress } : s.progress,
    message: patch.message !== undefined ? { ...s.message, [id]: patch.message } : s.message,
  }));
}

/** Image size sent to the model (it resizes to 518 px on the short side itself). */
const INPUT_SIDE = 1024;

async function runModel(source: ImageBitmap, signal: AbortSignal, onProgress?: (loaded: number, total: number) => void) {
  const img = bitmapToImageData(source, INPUT_SIDE);
  const res = await estimateDepth({ width: img.width, height: img.height, data: img.data }, { signal, onProgress });
  return { map: { width: res.width, height: res.height, data: res.data } as DepthMap, backend: res.backend, ms: res.ms };
}

const jobs = new Map<string, { promise: Promise<void>; ac: AbortController }>();

/** Makes sure the active photo has a depth map (memory → cache → model). */
export function ensureDepth(): Promise<void> {
  const id = engine.getActivePhotoId();
  const preview = engine.getPreviewBitmap();
  if (!id) return Promise.resolve();
  if (engine.getDepthData(id)) {
    if (useDepthStore.getState().status[id] !== 'ready') set(id, { status: 'ready' });
    return Promise.resolve();
  }
  const existing = jobs.get(id);
  if (existing) return existing.promise;
  if (!preview) return Promise.resolve();
  const ac = new AbortController();
  set(id, { status: 'running', progress: null, message: '' });
  // Read the pixels now: the preview bitmap is released if the user switches photos.
  const input = bitmapToImageData(preview, INPUT_SIDE);
  const promise = (async () => {
    try {
      const cached = await getCachedDepth(id);
      if (cached) {
        engine.setDepthData(id, cached);
        set(id, { status: 'ready', progress: null, message: '' });
        return;
      }
      ac.signal.throwIfAborted();
      const res = await estimateDepth(
        { width: input.width, height: input.height, data: input.data },
        { signal: ac.signal, onProgress: (loaded, total) => set(id, { progress: loaded < total ? { loaded, total } : null }) },
      );
      const map: DepthMap = { width: res.width, height: res.height, data: res.data };
      engine.setDepthData(id, map);
      void putCachedDepth(id, map);
      const where = res.backend === 'webgpu' ? 'GPU' : 'CPU';
      set(id, { status: 'ready', progress: null, message: `Depth estimated on this device (${where}, ${(res.ms / 1000).toFixed(1)} s).` });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'AbortError') set(id, { status: 'idle', progress: null, message: 'Depth estimation cancelled.' });
      else if (name === 'ModelMissingError') set(id, { status: 'missing-model', progress: null, message: e instanceof Error ? e.message : String(e) });
      else {
        console.error('[depth]', e);
        set(id, {
          status: 'error',
          progress: null,
          message: name === 'ModelIntegrityError' && e instanceof Error ? e.message : 'Depth estimation failed in this browser.',
        });
      }
    } finally {
      jobs.delete(id);
    }
  })();
  jobs.set(id, { promise, ac });
  return promise;
}

export function cancelDepth(photoId: string) {
  jobs.get(photoId)?.ac.abort(new DOMException('Cancelled', 'AbortError'));
}

/** Depth for any photo (batch export): memory → cache → model. Null if it cannot be estimated. */
export async function depthForPhoto(photoId: string, bitmap: ImageBitmap, signal?: AbortSignal): Promise<DepthMap | null> {
  const mem = engine.getDepthData(photoId);
  if (mem) return mem;
  const cached = await getCachedDepth(photoId);
  if (cached) {
    engine.setDepthData(photoId, cached);
    return cached;
  }
  const res = await runModel(bitmap, signal ?? new AbortController().signal);
  engine.setDepthData(photoId, res.map);
  void putCachedDepth(photoId, res.map);
  return res.map;
}

/**
 * Prepares lens blur for the active photo: depth plus (when "keep subject
 * sharp" is on) person segmentation, then focuses on the subject if the user
 * has not picked a focus point yet.
 */
export async function prepareLensBlur(opts: { autoFocus: boolean }): Promise<void> {
  const id = engine.getActivePhotoId();
  if (!id) return;
  const protect = useEditor.getState().edit.lensBlur?.protectSubject ?? true;
  await Promise.allSettled([ensureDepth(), protect ? ensurePortraitAnalysis() : Promise.resolve()]);
  if (engine.getActivePhotoId() !== id) return;
  const lens = useEditor.getState().edit.lensBlur;
  if (!opts.autoFocus || !lens || lens.amount <= 0 || lens.focusPoint) return;
  const d = engine.getDepthRaster();
  if (!d) return;
  const f = autoFocus(d.raster, d.subject);
  useEditor.getState().commitEdit('Focus on subject', (e) =>
    e.lensBlur && !e.lensBlur.focusPoint ? { ...e, lensBlur: { ...e.lensBlur, focus: focusFromNearness(f.nearness), focusPoint: [f.x, f.y] } } : e,
  );
}

let autoloadStarted = false;

/** Restores lens blur after a reload or photo switch: when the edit uses it, depth is loaded (or estimated) automatically. */
export function initLensBlurAutoload() {
  if (autoloadStarted) return;
  autoloadStarted = true;
  const check = () => {
    const id = useEditor.getState().activePhotoId;
    const on = (useEditor.getState().edit.lensBlur?.amount ?? 0) > 0;
    if (!id || !on || !useEngine.getState().previewSize || engine.getActivePhotoId() !== id) return;
    const st = useDepthStore.getState().status[id];
    if (st === 'missing-model' || st === 'error' || st === 'running') return;
    if (!engine.getDepthData(id)) void prepareLensBlur({ autoFocus: false });
  };
  useEditor.subscribe((s) => [s.activePhotoId, (s.edit.lensBlur?.amount ?? 0) > 0] as const, check, {
    equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1],
  });
  useEngine.subscribe((s, prev) => {
    if (s.previewSize !== prev.previewSize) check();
  });
  check();
}
