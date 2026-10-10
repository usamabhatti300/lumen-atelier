/**
 * Main-thread API for the ML worker. One worker is shared by every AI
 * feature; it starts on first use. Errors keep their names
 * (ModelMissingError, ModelIntegrityError, AbortError) so the UI can
 * explain what to do.
 */
import type { DepthImage, DepthResult, LoadResult, MlRequest, MlResponse, SelfTestResult, TensorData } from './protocol';
import type { ModelInfo } from './registry';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (loaded: number, total: number) => void };
type RequestBody = MlRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module', name: 'ml' });
    worker.onmessage = (e: MessageEvent<MlResponse>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') return p.onProgress?.(msg.loaded, msg.total);
      pending.delete(msg.id);
      if (msg.type === 'result') p.resolve(msg.result);
      else p.reject(Object.assign(new Error(msg.error.message), { name: msg.error.name }));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      for (const p of pending.values()) p.reject(new Error('The AI worker stopped unexpectedly. Reload the page to try again.'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export interface CallOptions {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
  transfer?: Transferable[];
}

/** Sends one request to the ML worker (used by feature modules such as samClient.ts). */
export function call<T>(body: RequestBody, opts: CallOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const id = ++seq;
    const w = getWorker();
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress: opts.onProgress });
    opts.signal?.addEventListener(
      'abort',
      () => {
        w.postMessage({ type: 'cancel', id } satisfies MlRequest);
        if (pending.delete(id)) reject(new DOMException('Cancelled', 'AbortError'));
      },
      { once: true },
    );
    w.postMessage({ ...body, id } as MlRequest, opts.transfer ?? []);
  });
}

/** Runs a tiny built-in model on WebGPU and WASM to check the runtime works on this device. */
export function runSelfTest(): Promise<SelfTestResult> {
  return call<SelfTestResult>({ type: 'selftest' });
}

/** Downloads (verified) and starts an ONNX Runtime model, reporting real byte progress. */
export function loadModel(modelId: string, opts: Omit<CallOptions, 'transfer'> = {}): Promise<LoadResult> {
  return call<LoadResult>({ type: 'load', modelId }, opts);
}

export function runModel(modelId: string, feeds: Record<string, TensorData>, opts: { file?: string; signal?: AbortSignal } = {}) {
  return call<Record<string, TensorData>>({ type: 'run', modelId, file: opts.file, feeds }, { signal: opts.signal, transfer: Object.values(feeds).map((t) => t.data.buffer as ArrayBuffer) });
}

export function releaseModel(modelId: string): Promise<boolean> {
  return call<boolean>({ type: 'release', modelId });
}

/**
 * Estimates depth for an image (Depth Anything V2 Small). The first call
 * downloads and starts the model, reporting real byte progress; later calls
 * reuse it. The pixel buffer is transferred to the worker.
 */
export function estimateDepth(image: DepthImage, opts: Omit<CallOptions, 'transfer'> = {}): Promise<DepthResult> {
  return call<DepthResult>({ type: 'depth', image }, { ...opts, transfer: [image.data.buffer as ArrayBuffer] });
}

export type InstallState = 'installed' | 'missing' | 'partial' | 'unknown';

/** Files in this app's models folder and their sizes, from the app server (null if it is not reachable). */
export async function installedModelFiles(): Promise<Record<string, number> | null> {
  try {
    const r = await fetch('/api/models');
    if (!r.ok) return null;
    const body = (await r.json()) as { files?: unknown };
    return body.files && typeof body.files === 'object' ? (body.files as Record<string, number>) : null;
  } catch {
    return null;
  }
}

/** Whether every file of a model is installed with its registered size. */
export function modelInstallState(model: ModelInfo, files: Record<string, number> | null): InstallState {
  if (!files) return 'unknown';
  const present = model.files.map((f) => files[f.path] === f.bytes);
  if (present.every(Boolean)) return 'installed';
  return present.some(Boolean) ? 'partial' : 'missing';
}
