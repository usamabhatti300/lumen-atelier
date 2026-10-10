/// <reference lib="webworker" />
/**
 * ML worker: downloads model files from our own origin (verified), creates
 * ONNX Runtime sessions (WebGPU first, WASM fallback) and runs inference off
 * the main thread. Progress is reported in real bytes; requests can be
 * cancelled.
 */
import type * as Ort from 'onnxruntime-web';
import { createSession, getOrt, type Backend } from './ort';
import type { BackendCheck, LoadResult, MlRequest, MlResponse, SelfTestResult, TensorData } from './protocol';
import { getModel } from './registry';
import { handleSam } from './sam';
import { isSamRequest } from './samProtocol';
import { SELFTEST_INPUT, buildSelfTestModel, selfTestPasses } from './selftest';
import { getTransformers } from './transformers';
import { fetchVerified, progressTracker } from './verify';

declare const self: DedicatedWorkerGlobalScope;

const sessions = new Map<string, Map<string, { session: Ort.InferenceSession; backend: Backend }>>();
const controllers = new Map<number, AbortController>();

const post = (msg: MlResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

async function selfTest(): Promise<SelfTestResult> {
  const ort = await getOrt();
  const model = buildSelfTestModel();
  const backends: BackendCheck[] = [];
  for (const backend of ['webgpu', 'wasm'] as const) {
    const t0 = performance.now();
    try {
      const { session } = await createSession(model, [backend]);
      const out = await session.run({ x: new ort.Tensor('float32', Float32Array.from(SELFTEST_INPUT), [SELFTEST_INPUT.length]) });
      const y = out.y.data as Float32Array;
      out.y.dispose();
      await session.release();
      backends.push(selfTestPasses(y) ? { backend, ok: true, ms: performance.now() - t0 } : { backend, ok: false, error: 'Wrong result.' });
    } catch (e) {
      backends.push({ backend, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  let transformers: SelfTestResult['transformers'];
  try {
    const tf = await getTransformers();
    transformers = { version: tf.env.version, remoteModelsDisabled: tf.env.allowRemoteModels === false };
  } catch (e) {
    transformers = { error: e instanceof Error ? e.message : String(e) };
  }
  return {
    ortVersion: ort.env.versions.web ?? 'unknown',
    crossOriginIsolated: self.crossOriginIsolated,
    threads: Number(ort.env.wasm.numThreads ?? 1),
    backends,
    transformers,
  };
}

async function load(id: number, modelId: string, signal: AbortSignal): Promise<LoadResult> {
  const model = getModel(modelId);
  if (model.runtime !== 'onnxruntime') throw new Error(`${model.name} is loaded through its own feature, not directly.`);
  const existing = sessions.get(modelId);
  if (existing) return { backends: Object.fromEntries([...existing].map(([k, v]) => [k, v.backend])) };

  const track = progressTracker(model.files, (loaded, total) => post({ type: 'progress', id, loaded, total }));
  const created = new Map<string, { session: Ort.InferenceSession; backend: Backend }>();
  try {
    for (const file of model.files) {
      const bytes = await fetchVerified(file, { origin: self.location.origin, signal, onBytes: (n) => track(file, n) });
      if (!file.path.endsWith('.onnx')) continue;
      signal.throwIfAborted();
      created.set(file.path, await createSession(bytes));
      signal.throwIfAborted();
    }
  } catch (e) {
    for (const s of created.values()) void s.session.release();
    throw e;
  }
  sessions.set(modelId, created);
  return { backends: Object.fromEntries([...created].map(([k, v]) => [k, v.backend])) };
}

async function run(modelId: string, file: string | undefined, feeds: Record<string, TensorData>) {
  const ort = await getOrt();
  const model = sessions.get(modelId);
  const entry = model && (file ? model.get(file) : model.values().next().value);
  if (!entry) throw new Error('The model is not loaded.');
  const inputs = Object.fromEntries(Object.entries(feeds).map(([k, t]) => [k, new ort.Tensor(t.type, t.data, t.dims)]));
  const out = await entry.session.run(inputs);
  const result: Record<string, TensorData> = {};
  for (const [k, t] of Object.entries(out)) {
    result[k] = { type: t.type as TensorData['type'], dims: [...t.dims], data: (await t.getData()) as TensorData['data'] };
    t.dispose();
  }
  return result;
}

async function release(modelId: string) {
  const model = sessions.get(modelId);
  sessions.delete(modelId);
  if (model) for (const s of model.values()) await s.session.release();
  return true;
}

self.onmessage = async (e: MessageEvent<MlRequest>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    controllers.get(msg.id)?.abort(new DOMException('Cancelled', 'AbortError'));
    return;
  }
  const ac = new AbortController();
  controllers.set(msg.id, ac);
  try {
    let result: unknown;
    let transfer: Transferable[] = [];
    if (isSamRequest(msg)) {
      ({ result, transfer } = await handleSam(msg, { signal: ac.signal, progress: (loaded, total) => post({ type: 'progress', id: msg.id, loaded, total }) }));
    } else if (msg.type === 'selftest') result = await selfTest();
    else if (msg.type === 'load') result = await load(msg.id, msg.modelId, ac.signal);
    else if (msg.type === 'run') result = await run(msg.modelId, msg.file, msg.feeds);
    else result = await release(msg.modelId);
    if (msg.type === 'run') transfer = Object.values(result as Record<string, TensorData>).map((t) => t.data.buffer as ArrayBuffer);
    post({ type: 'result', id: msg.id, result }, transfer);
  } catch (err) {
    const error = err instanceof Error ? { name: err.name, message: err.message } : { name: 'Error', message: String(err) };
    post({ type: 'error', id: msg.id, error });
  } finally {
    controllers.delete(msg.id);
  }
};
