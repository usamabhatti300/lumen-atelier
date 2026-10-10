/**
 * "Select object" mask service (main thread). Owns the cache of computed
 * object-mask rasters and drives the ML worker: model download (real byte
 * progress), one image embedding per photo, then one fast decode per
 * selection. The edit state holds only the clicked points; whenever a
 * raster for those points is missing (new click, undo, reload, export, a
 * copied edit on another photo) it is loaded from the local cache or
 * recomputed here.
 */
import { create } from 'zustand';
import { objectMaskKey, type ObjectMaskRaster } from '@/lib/masks/objectMask';
import type { ObjectMaskLookup } from '@/lib/masks/rasterize';
import { samDecode, samEmbed, samLoad } from '@/lib/ml/samClient';
import { getCachedObjectMask, putCachedObjectMask } from '@/lib/storage/maskCache';
import type { ObjectComponent } from '@/lib/schema/adjustments';

export type ObjectSelectPhase = 'idle' | 'downloading' | 'starting' | 'analysing' | 'ready' | 'selecting' | 'error';

export interface ObjectSelectStatus {
  phase: ObjectSelectPhase;
  /** Model download bytes (only meaningful while downloading). */
  loaded: number;
  total: number;
  /** Photo whose embedding is ready. */
  readyPhotoId: string | null;
  backend: 'webgpu' | 'wasm' | null;
  error: string | null;
  /** 'ModelMissingError' | 'ModelIntegrityError' | ... so the UI can explain what to do. */
  errorName: string | null;
  /** Shown after a cancel. */
  notice: string | null;
}

export const useObjectSelect = create<ObjectSelectStatus>(() => ({
  phase: 'idle',
  loaded: 0,
  total: 0,
  readyPhotoId: null,
  backend: null,
  error: null,
  errorName: null,
  notice: null,
}));

/** Supplies the photo at <= OBJECT_MASK_SIDE as RGBA (a fresh copy each call; it is transferred). */
export type ImageProvider = () => ImageData | null;

const MEM_LIMIT = 16;
const isAbort = (e: unknown) => e instanceof DOMException ? e.name === 'AbortError' : (e as Error)?.name === 'AbortError';

class ObjectMaskService {
  private mem = new Map<string, ObjectMaskRaster>();
  /** Last raster shown for a component, so the preview keeps it while a new click is computed. */
  private shown = new Map<string, ObjectMaskRaster>();
  private inflight = new Map<string, Promise<ObjectMaskRaster>>();
  private model: Promise<unknown> | null = null;
  private embeds = new Map<string, Promise<void>>();
  /** Photos where automatic computation is paused after a cancel or an error (until the user retries). */
  private paused = new Set<string>();
  private ac = new AbortController();
  private listeners = new Set<() => void>();
  version = 0;

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private bump() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Raster lookup for rasterizeLayer. `keepPrevious` shows a component's last mask while its new one computes. */
  lookup(photoId: string, keepPrevious: boolean): ObjectMaskLookup {
    return (c: ObjectComponent) =>
      this.mem.get(objectMaskKey(photoId, c.points)) ?? (keepPrevious ? (this.shown.get(`${photoId}|${c.id}`) ?? null) : null);
  }

  /** Called while rendering: fetches or computes missing rasters in the background. */
  request(photoId: string, comps: ObjectComponent[], image: ImageProvider) {
    if (this.paused.has(photoId)) return;
    for (const c of comps) {
      void this.raster(photoId, c, image, this.ac.signal).then(
        () => undefined,
        (e) => this.fail(photoId, e),
      );
    }
  }

  /** Makes sure every component has a raster (export); throws a readable error otherwise. */
  async ensure(photoId: string, comps: ObjectComponent[], image: ImageProvider, signal?: AbortSignal) {
    for (const c of comps) await this.raster(photoId, c, image, signal ?? this.ac.signal);
  }

  /** User-initiated: downloads the model and analyses the photo ahead of the first click. */
  prepare(photoId: string, image: ImageProvider) {
    this.paused.delete(photoId);
    useObjectSelect.setState({ error: null, errorName: null, notice: null });
    void this.embedding(photoId, image, this.ac.signal).catch((e) => this.fail(photoId, e));
  }

  /** Clears a cancel/error pause so missing masks are computed again. */
  resume(photoId: string) {
    this.paused.delete(photoId);
    useObjectSelect.setState({ error: null, errorName: null, notice: null });
    this.bump();
  }

  cancel() {
    this.ac.abort(new DOMException('Cancelled', 'AbortError'));
    this.ac = new AbortController();
  }

  private fail(photoId: string, e: unknown) {
    this.paused.add(photoId);
    if (isAbort(e)) {
      const s = useObjectSelect.getState();
      useObjectSelect.setState({
        phase: s.readyPhotoId ? 'ready' : 'idle',
        notice: 'Cancelled. Click the photo to try again.',
      });
      return;
    }
    const err = e instanceof Error ? e : new Error(String(e));
    console.warn('[select-object]', err);
    useObjectSelect.setState({ phase: 'error', error: err.message, errorName: err.name });
    this.bump();
  }

  private loadModel(signal: AbortSignal) {
    if (!this.model) {
      useObjectSelect.setState({ phase: 'downloading', loaded: 0, total: 0 });
      this.model = samLoad({
        signal,
        onProgress: (loaded, total) =>
          useObjectSelect.setState({ phase: loaded >= total ? 'starting' : 'downloading', loaded, total }),
      }).then((r) => useObjectSelect.setState({ backend: r.backend }));
      this.model.catch(() => (this.model = null));
    }
    return this.model;
  }

  private embedding(photoId: string, image: ImageProvider, signal: AbortSignal) {
    let p = this.embeds.get(photoId);
    if (!p) {
      p = (async () => {
        await this.loadModel(signal);
        const img = image();
        if (!img) throw new Error('The photo is not loaded yet.');
        useObjectSelect.setState({ phase: 'analysing' });
        await samEmbed(photoId, img, signal);
        useObjectSelect.setState({ phase: 'ready', readyPhotoId: photoId });
      })();
      this.embeds.set(photoId, p);
      // Keep only the newest embedding promise per photo set small (the worker keeps two embeddings).
      for (const k of [...this.embeds.keys()].slice(0, -2)) this.embeds.delete(k);
      p.catch(() => this.embeds.delete(photoId));
    }
    return p;
  }

  private raster(photoId: string, c: ObjectComponent, image: ImageProvider, signal: AbortSignal): Promise<ObjectMaskRaster> {
    const key = objectMaskKey(photoId, c.points);
    const have = this.mem.get(key);
    if (have) return Promise.resolve(have);
    let p = this.inflight.get(key);
    if (!p) {
      p = (async () => {
        if (useObjectSelect.getState().phase === 'ready') useObjectSelect.setState({ phase: 'selecting' });
        let r = await getCachedObjectMask(key);
        if (!r) {
          await this.embedding(photoId, image, signal);
          useObjectSelect.setState({ phase: 'selecting' });
          try {
            r = await samDecode(photoId, c.points, signal);
          } catch (e) {
            // The worker dropped this photo's embedding (it keeps two); compute it again once.
            if ((e as Error)?.name !== 'SamNotEmbeddedError') throw e;
            this.embeds.delete(photoId);
            await this.embedding(photoId, image, signal);
            r = await samDecode(photoId, c.points, signal);
          }
          r = { width: r.width, height: r.height, data: r.data };
          void putCachedObjectMask(key, r);
        }
        if (useObjectSelect.getState().phase === 'selecting' && this.inflight.size <= 1) useObjectSelect.setState({ phase: 'ready' });
        this.mem.set(key, r);
        while (this.mem.size > MEM_LIMIT) this.mem.delete(this.mem.keys().next().value!);
        this.shown.set(`${photoId}|${c.id}`, r);
        while (this.shown.size > 64) this.shown.delete(this.shown.keys().next().value!);
        this.bump();
        return r;
      })();
      this.inflight.set(key, p);
      void p.finally(() => this.inflight.delete(key)).catch(() => undefined);
    }
    return p;
  }

  /** Marks a selection as being computed right away (the click handler), so the UI never shows "ready" in between. */
  markSelecting() {
    const s = useObjectSelect.getState();
    if (s.phase === 'ready' || s.phase === 'idle') useObjectSelect.setState({ phase: 'selecting', notice: null });
  }

  /** Called after a mask pass with nothing missing: a click whose mask was already cached is done. */
  settle() {
    if (this.inflight.size === 0 && useObjectSelect.getState().phase === 'selecting') useObjectSelect.setState({ phase: 'ready' });
  }

  isPaused(photoId: string) {
    return this.paused.has(photoId);
  }
}

export const objectMasks = new ObjectMaskService();

export function objectComponentsOf(layers: { components: { type: string }[] }[]): ObjectComponent[] {
  return layers.flatMap((l) => l.components.filter((c): c is ObjectComponent => c.type === 'object'));
}
