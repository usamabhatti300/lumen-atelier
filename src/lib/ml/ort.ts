/**
 * ONNX Runtime Web (MIT), loaded lazily inside the ML worker. The WASM engine
 * files are served from our own /ort/ folder (copied from node_modules on
 * install), never from a CDN. The same instance is shared with
 * Transformers.js so only one runtime is shipped.
 */
import type * as Ort from 'onnxruntime-web';

export type Backend = 'webgpu' | 'wasm';

export const ORT_WASM_BASE = '/ort/';

let ortPromise: Promise<typeof Ort> | null = null;

export function getOrt(): Promise<typeof Ort> {
  if (!ortPromise) {
    // The WebGPU bundle runs WASM through an "asyncify" build that is several times slower on the
    // CPU (MI-GAN: 13 s vs 2 s per fill), so without WebGPU the plain WASM bundle is used.
    const load = async () => {
      const gpu = await webgpuAvailable();
      return { gpu, ort: gpu ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm') };
    };
    ortPromise = load().then(({ gpu, ort }) => {
      // Each bundle embeds its JS loader; only the binary is fetched, from our own folder.
      ort.env.wasm.wasmPaths = { wasm: `${ORT_WASM_BASE}ort-wasm-simd-threaded${gpu ? '.asyncify' : ''}.wasm` };
      ort.env.wasm.proxy = false;
      // Threads need cross-origin isolation (COOP + COEP); otherwise one thread.
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
      ort.env.logLevel = 'error';
      // Transformers.js uses a pre-registered runtime instead of its own.
      (globalThis as Record<symbol, unknown>)[Symbol.for('onnxruntime')] = ort;
      return ort;
    });
    ortPromise.catch(() => (ortPromise = null));
  }
  return ortPromise;
}

let webgpuProbe: Promise<boolean> | null = null;

/** True when this browser exposes a usable WebGPU adapter. */
export function webgpuAvailable(): Promise<boolean> {
  webgpuProbe ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
      return (await gpu.requestAdapter()) != null;
    } catch {
      return false;
    }
  })();
  return webgpuProbe;
}

export interface CreatedSession {
  session: Ort.InferenceSession;
  backend: Backend;
}

/** Creates a session on WebGPU when available, falling back to WASM if that fails. */
export async function createSession(model: Uint8Array, prefer: Backend[] = ['webgpu', 'wasm']): Promise<CreatedSession> {
  const ort = await getOrt();
  const errors: string[] = [];
  for (const backend of prefer) {
    if (backend === 'webgpu' && !(await webgpuAvailable())) {
      errors.push('webgpu: not available in this browser');
      continue;
    }
    try {
      const session = await ort.InferenceSession.create(model, { executionProviders: [backend], graphOptimizationLevel: 'all' });
      return { session, backend };
    } catch (e) {
      errors.push(`${backend}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Could not start the AI runtime (${errors.join('; ')}).`);
}
