/**
 * "Select object" inside the ML worker: SlimSAM-77 (Apache-2.0) through
 * Transformers.js (SamModel + AutoProcessor + post_process_masks).
 *
 * The heavy image embedding is computed once per photo and kept here; each
 * click only runs the small prompt decoder. Masks are returned as refined
 * soft coverage in the embedded image's extent.
 */
import type { PreTrainedModel, Processor, Tensor as TfTensor } from '@huggingface/transformers';
import { OBJECT_MASK_SIDE, refineObjectMask } from '../masks/objectMask';
import type { ObjectPoint } from '../schema/adjustments';
import { webgpuAvailable, type Backend } from './ort';
import { getModel } from './registry';
import type { SamDecodeResult, SamEmbedResult, SamLoadResult, SamRequest } from './samProtocol';
import { SAM_MODEL_ID } from './samProtocol';
import { getTransformers, setTransformersContext } from './transformers';
import { ModelMissingError, SETUP_HINT, fetchVerified, modelUrl, progressTracker } from './verify';

interface SamRuntime {
  model: PreTrainedModel;
  processor: Processor;
  backend: Backend;
}

interface Embedding {
  inputs: { image_embeddings: TfTensor; image_positional_embeddings: TfTensor };
  originalSizes: [number, number][];
  reshapedSizes: [number, number][];
  width: number;
  height: number;
}

let runtime: Promise<SamRuntime> | null = null;
const embeddings = new Map<string, Embedding>();
const MAX_EMBEDDINGS = 2;

export interface SamContext {
  signal: AbortSignal;
  progress: (loaded: number, total: number) => void;
}

async function loadOn(backend: Backend, ctx: SamContext): Promise<SamRuntime> {
  const tf = await getTransformers();
  const info = getModel(SAM_MODEL_ID);
  const track = progressTracker(info.files, ctx.progress);
  setTransformersContext({
    signal: ctx.signal,
    onBytes: (path, n) => {
      const f = info.files.find((x) => x.path === path);
      if (f) track(f, n);
    },
  });
  try {
    const repo = info.source;
    // fp32 on both backends: the registry ships exactly these two graphs (WASM would default to q8).
    // Transformers.js lists no devices when it uses our pre-registered ONNX Runtime (src/lib/ml/ort.ts),
    // so any named device throws "Unsupported device"; 'auto' plus explicit execution providers works.
    const opts = { dtype: 'fp32' as const, device: 'auto' as const, session_options: { executionProviders: [backend], graphOptimizationLevel: 'all' as const } };
    const [model, processor] = await Promise.all([
      tf.SamModel.from_pretrained(repo, opts),
      tf.AutoProcessor.from_pretrained(repo),
    ]);
    return { model, processor, backend };
  } finally {
    setTransformersContext({});
  }
}

/** Transformers.js reports every failed file as "not found"; find the real reason. */
async function explainLoadFailure(e: unknown, signal: AbortSignal): Promise<never> {
  signal.throwIfAborted();
  const origin = self.location.origin;
  for (const f of getModel(SAM_MODEL_ID).files) {
    const head = await fetch(modelUrl(f, origin), { method: 'HEAD', signal }).catch(() => null);
    if (!head || !head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) {
      throw new ModelMissingError(`The Select object model (SlimSAM) is not installed. ${SETUP_HINT}`);
    }
  }
  // Present but rejected: re-verify to surface the integrity error.
  for (const f of getModel(SAM_MODEL_ID).files) await fetchVerified(f, { origin, signal });
  throw e instanceof Error ? e : new Error(String(e));
}

export async function samLoad(ctx: SamContext): Promise<SamLoadResult> {
  if (!runtime) {
    runtime = (async () => {
      const order: Backend[] = (await webgpuAvailable()) ? ['webgpu', 'wasm'] : ['wasm'];
      let last: unknown;
      for (const backend of order) {
        try {
          return await loadOn(backend, ctx);
        } catch (e) {
          if (ctx.signal.aborted) throw ctx.signal.reason;
          last = e;
        }
      }
      return explainLoadFailure(last, ctx.signal);
    })();
    runtime.catch(() => (runtime = null));
  }
  const r = await runtime;
  return { backend: r.backend };
}

async function getRuntime(): Promise<SamRuntime> {
  if (!runtime) throw new Error('Select object is not loaded yet.');
  return runtime;
}

export async function samEmbed(key: string, width: number, height: number, rgba: Uint8ClampedArray, signal: AbortSignal): Promise<SamEmbedResult> {
  const t0 = performance.now();
  if (embeddings.has(key)) return { ms: 0 };
  if (Math.max(width, height) > OBJECT_MASK_SIDE || rgba.length !== width * height * 4) throw new Error('Unexpected image size for Select object.');
  const tf = await getTransformers();
  const { model, processor } = await getRuntime();
  const image = new tf.RawImage(rgba, width, height, 4);
  const inputs = (await processor(image)) as { pixel_values: TfTensor; original_sizes: [number, number][]; reshaped_input_sizes: [number, number][] };
  signal.throwIfAborted();
  const emb = (await (model as unknown as { get_image_embeddings(i: unknown): Promise<Embedding['inputs']> }).get_image_embeddings(inputs));
  inputs.pixel_values.dispose?.();
  // ONNX Runtime cannot interrupt a running graph; a cancelled request just discards the result.
  signal.throwIfAborted();
  embeddings.set(key, {
    inputs: emb,
    originalSizes: inputs.original_sizes,
    reshapedSizes: inputs.reshaped_input_sizes,
    width,
    height,
  });
  while (embeddings.size > MAX_EMBEDDINGS) forget(embeddings.keys().next().value!);
  return { ms: performance.now() - t0 };
}

export async function samDecode(key: string, points: ObjectPoint[]): Promise<SamDecodeResult> {
  const t0 = performance.now();
  const emb = embeddings.get(key);
  if (!emb) throw Object.assign(new Error('This photo has not been analysed for Select object yet.'), { name: 'SamNotEmbeddedError' });
  if (!points.length || !points.some((p) => p.include)) throw new Error('A selection needs at least one point on the object.');
  const tf = await getTransformers();
  const { model, processor } = await getRuntime();
  const proc = processor as unknown as {
    reshape_input_points(p: number[][][], o: [number, number][], r: [number, number][]): TfTensor;
    post_process_masks(m: TfTensor, o: [number, number][], r: [number, number][], opts: { binarize: boolean }): Promise<TfTensor[]>;
  };
  // [point_batch=1][n][x,y] in embedded-image pixels; the processor rescales to the 1024 model space.
  const input_points = proc.reshape_input_points(
    [points.map((p) => [p.x * emb.width, p.y * emb.height])],
    emb.originalSizes,
    emb.reshapedSizes,
  );
  const input_labels = new tf.Tensor('int64', BigInt64Array.from(points.map((p) => (p.include ? 1n : 0n))), [1, 1, points.length]);
  const out = (await (model as unknown as (i: unknown) => Promise<{ pred_masks: TfTensor; iou_scores: TfTensor }>)({
    ...emb.inputs,
    input_points,
    input_labels,
  }));
  // Three candidate masks (whole / part / sub-part); keep the one with the best predicted IoU.
  const scores = out.iou_scores.data as Float32Array;
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  const [, , , mh, mw] = out.pred_masks.dims;
  const plane = mh * mw;
  const all = out.pred_masks.data as Float32Array;
  const chosen = new tf.Tensor('float32', all.slice(best * plane, (best + 1) * plane), [1, 1, 1, mh, mw]);
  const [logits] = await proc.post_process_masks(chosen, emb.originalSizes, emb.reshapedSizes, { binarize: false });
  const [h, w] = emb.originalSizes[0];
  const data = refineObjectMask(logits.data as Float32Array, w, h);
  for (const t of [input_points, input_labels, out.pred_masks, out.iou_scores, chosen, logits]) t.dispose?.();
  return { width: w, height: h, data, score: scores[best], ms: performance.now() - t0 };
}

function forget(key: string) {
  const e = embeddings.get(key);
  embeddings.delete(key);
  e?.inputs.image_embeddings.dispose?.();
  e?.inputs.image_positional_embeddings.dispose?.();
  return true;
}

/** Dispatch for SAM worker messages. Returns the result and any buffers to transfer. */
export async function handleSam(msg: SamRequest, ctx: SamContext): Promise<{ result: unknown; transfer: Transferable[] }> {
  switch (msg.type) {
    case 'sam-load':
      return { result: await samLoad(ctx), transfer: [] };
    case 'sam-embed':
      return { result: await samEmbed(msg.key, msg.width, msg.height, msg.rgba, ctx.signal), transfer: [] };
    case 'sam-decode': {
      const r = await samDecode(msg.key, msg.points);
      return { result: r, transfer: [r.data.buffer as ArrayBuffer] };
    }
    case 'sam-forget':
      return { result: forget(msg.key), transfer: [] };
  }
}
