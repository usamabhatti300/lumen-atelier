/// <reference lib="webworker" />
/**
 * Depth estimation (Depth Anything V2 Small, Apache-2.0) inside the ML worker,
 * through Transformers.js' "depth-estimation" pipeline. The model is loaded
 * once per worker (WebGPU first, WASM fallback) from this app's /models/
 * folder; every file goes through the verified, same-origin fetch guard.
 *
 * Output: relative inverse depth, robustly normalized to "nearness"
 * 0 (far) .. 65535 (near) at the size of the image that was sent.
 */
import { webgpuAvailable, type Backend } from './ort';
import type { DepthImage, DepthResult } from './protocol';
import { getModel } from './registry';
import { getTransformers, setTransformersContext } from './transformers';
import { progressTracker } from './verify';

export const DEPTH_MODEL_ID = 'depth-anything-v2-small';
const REPO = 'onnx-community/depth-anything-v2-small';
/** fp16 weights with float32 inputs/outputs: 50 MB, runs on WebGPU and on the WASM CPU backend. */
const DTYPE = 'fp16';

type DepthPipe = (image: unknown) => Promise<{ predicted_depth: { data: ArrayLike<number>; dims: number[] } }>;

let loading: Promise<{ pipe: DepthPipe; backend: Backend }> | null = null;

/** fp16 weights on WebGPU need the adapter's shader-f16 feature; otherwise the WASM backend is used. */
async function webgpuFp16(): Promise<boolean> {
  if (!(await webgpuAvailable())) return false;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    return !!(await gpu?.requestAdapter())?.features.has('shader-f16');
  } catch {
    return false;
  }
}

async function load(signal: AbortSignal, onProgress: (loaded: number, total: number) => void) {
  const tf = await getTransformers();
  const model = getModel(DEPTH_MODEL_ID);
  const track = progressTracker(model.files, onProgress);
  setTransformersContext({
    signal,
    onBytes: (path, n) => {
      const file = model.files.find((f) => f.path === path);
      if (file) track(file, n);
    },
  });
  const errors: string[] = [];
  try {
    const devices: Backend[] = (await webgpuFp16()) ? ['webgpu', 'wasm'] : ['wasm'];
    for (const device of devices) {
      signal.throwIfAborted();
      try {
        // Transformers.js 4.3.1 lists no devices when it uses a pre-registered ONNX Runtime (ours, see
        // ort.ts), so naming one throws "Unsupported device". "auto" passes that check and the backend is
        // chosen through session_options instead.
        const pipe = (await tf.pipeline('depth-estimation', REPO, {
          device: 'auto',
          dtype: DTYPE,
          session_options: { executionProviders: [device] },
        })) as unknown as DepthPipe;
        return { pipe, backend: device };
      } catch (e) {
        if (signal.aborted || (e instanceof Error && /^(ModelMissingError|ModelIntegrityError|ForeignRequestError|AbortError)$/.test(e.name))) throw e;
        errors.push(`${device}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    throw new Error(`Could not start the depth model (${errors.join('; ')}).`);
  } finally {
    setTransformersContext({});
  }
}

function getPipe(signal: AbortSignal, onProgress: (loaded: number, total: number) => void) {
  if (!loading) {
    loading = load(signal, onProgress);
    loading.catch(() => (loading = null));
  }
  return loading;
}

/** Robust min/max (0.5th / 99.5th percentiles) mapped to 0..65535. */
export function normalizeNearness(pred: ArrayLike<number>): Uint16Array {
  const n = pred.length;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = pred[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const out = new Uint16Array(n);
  if (!(hi > lo)) return out;
  const BINS = 4096;
  const hist = new Uint32Array(BINS);
  const scale = (BINS - 1) / (hi - lo);
  for (let i = 0; i < n; i++) hist[Math.round((pred[i] - lo) * scale)]++;
  const pick = (q: number) => {
    let acc = 0;
    for (let b = 0; b < BINS; b++) {
      acc += hist[b];
      if (acc >= q * n) return lo + b / scale;
    }
    return hi;
  };
  const p0 = pick(0.005);
  const p1 = Math.max(pick(0.995), p0 + 1e-6);
  const k = 65535 / (p1 - p0);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(65535, Math.round((pred[i] - p0) * k)));
  return out;
}

export async function estimateDepth(image: DepthImage, signal: AbortSignal, onProgress: (loaded: number, total: number) => void): Promise<DepthResult> {
  const { pipe, backend } = await getPipe(signal, onProgress);
  signal.throwIfAborted();
  const tf = await getTransformers();
  const { width, height, data } = image;
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  const t0 = performance.now();
  const out = await pipe(new tf.RawImage(rgb, width, height, 3));
  signal.throwIfAborted();
  const pred = out.predicted_depth;
  const [h, w] = pred.dims.slice(-2);
  return { width: w, height: h, data: normalizeNearness(pred.data), backend, ms: performance.now() - t0 };
}
