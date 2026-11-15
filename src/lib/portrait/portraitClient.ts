/**
 * Main-thread side of the portrait worker. Falls back to running the models on the main thread
 * when workers are unavailable or the worker can't start the models (then for the rest of the
 * session). A stopped request is answered at once with an AbortError; the worker's late answer is
 * dropped, and its models stay loaded for the next photo.
 */
import { ModelsMissingError } from './mediapipe';
import { runPortraitModels, type PortraitModelResult } from './portraitModels';
import { memoryConstrained, registerRuntime, runtimeStarting } from '../ml/memory';

type Reply = { id: number; ok: true; result: PortraitModelResult } | { id: number; ok: false; missing: boolean; message: string };

let worker: Worker | null = null;
let broken = typeof Worker === 'undefined';
let seq = 0;
const pending = new Map<number, { resolve: (r: PortraitModelResult) => void; reject: (e: unknown) => void }>();

class WorkerFailed extends Error {}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./portrait.worker.ts', import.meta.url), { type: 'module', name: 'portrait' });
  w.onmessage = (e: MessageEvent<Reply>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result);
    else if (e.data.missing) p.reject(new ModelsMissingError(e.data.message));
    else p.reject(new WorkerFailed(e.data.message));
  };
  w.onerror = (e) => {
    e.preventDefault();
    w.terminate();
    worker = null;
    for (const p of pending.values()) p.reject(new WorkerFailed(e.message || 'worker error'));
    pending.clear();
  };
  worker = w;
  return w;
}

/** Shuts the portrait worker down to give its memory back; its models load again on the next photo. */
export function releasePortraitWorkerIfIdle(): boolean {
  if (!worker || pending.size > 0) return false;
  worker.terminate();
  worker = null;
  return true;
}

const abortError = () => new DOMException('Detection stopped.', 'AbortError');

function inWorker(input: ImageBitmap, signal?: AbortSignal): Promise<PortraitModelResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const id = ++seq;
    if (memoryConstrained()) runtimeStarting('portrait');
    pending.set(id, { resolve, reject });
    signal?.addEventListener(
      'abort',
      () => {
        if (pending.delete(id)) reject(abortError());
      },
      { once: true },
    );
    getWorker().postMessage({ id, bitmap: input }, [input]);
  });
}

/** Runs the portrait models on `input`, which is consumed (transferred to the worker or closed). */
export async function detectPortrait(input: ImageBitmap, signal?: AbortSignal): Promise<PortraitModelResult> {
  if (!broken) {
    // A copy for the fallback; the original is transferred to the worker.
    const copy = await createImageBitmap(input);
    try {
      const r = await inWorker(input, signal);
      copy.close();
      return r;
    } catch (e) {
      if (!(e instanceof WorkerFailed)) {
        copy.close();
        throw e;
      }
      broken = true;
      console.warn('[portrait] the worker could not run the models; using the main thread.', e.message);
      input = copy;
    }
  }
  try {
    if (signal?.aborted) throw abortError();
    return await runPortraitModels(input);
  } finally {
    input.close();
  }
}

registerRuntime('portrait', releasePortraitWorkerIfIdle);
