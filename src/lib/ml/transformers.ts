/**
 * Transformers.js (Apache-2.0), configured for strictly local use inside the
 * ML worker: models load only from this origin's /models/ folder, remote
 * (Hugging Face) loading is disabled, and every file goes through a fetch
 * guard that blocks other hosts and verifies size + SHA-256 from the
 * registry. Unregistered files are answered with 404 so nothing unverified
 * is ever loaded.
 */
import { getOrt } from './ort';
import { findModelFile, MODELS_BASE } from './registry';
import { assertSameOrigin, fetchVerified } from './verify';

type Transformers = typeof import('@huggingface/transformers');

interface RequestContext {
  /** Byte progress for each file Transformers.js loads. */
  onBytes?: (path: string, received: number) => void;
  signal?: AbortSignal;
}
let context: RequestContext = {};

/** Set by the worker around each model load so downloads report progress and can be cancelled. */
export function setTransformersContext(ctx: RequestContext) {
  context = ctx;
}

export async function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const origin = self.location.origin;
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = assertSameOrigin(raw, origin);
  if (!url.pathname.startsWith(MODELS_BASE)) {
    throw new Error(`Blocked an unexpected AI runtime request to ${url.pathname}.`);
  }
  const file = findModelFile(decodeURIComponent(url.pathname.slice(MODELS_BASE.length)));
  if (!file) return new Response(null, { status: 404, statusText: 'Not a registered model file' });
  const bytes = await fetchVerified(file, {
    origin,
    signal: init?.signal ?? context.signal,
    onBytes: (n) => context.onBytes?.(file.path, n),
  });
  const type = file.path.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': type, 'content-length': String(bytes.length) } });
}

let tfPromise: Promise<Transformers> | null = null;

export function getTransformers(): Promise<Transformers> {
  if (!tfPromise) {
    tfPromise = (async () => {
      await getOrt(); // registers our ONNX Runtime before Transformers.js initialises
      const tf = await import('@huggingface/transformers');
      tf.env.allowRemoteModels = false;
      tf.env.allowLocalModels = true;
      tf.env.localModelPath = MODELS_BASE;
      tf.env.useBrowserCache = false;
      tf.env.useWasmCache = false;
      tf.env.fetch = guardedFetch;
      return tf;
    })();
    tfPromise.catch(() => (tfPromise = null));
  }
  return tfPromise;
}
