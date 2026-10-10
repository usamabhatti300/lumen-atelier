/**
 * Browser-side analysis helpers: worker-backed statistics and the AI
 * interpretation request. The API key never reaches the browser; the request
 * goes to this app's own server (/api), which calls the provider.
 */
import {
  AnalyzeResponseSchema,
  ApiErrorSchema,
  HealthResponseSchema,
  type ApiErrorCode,
  type MeasuredSummary,
  type StyleInterpretation,
} from '@shared/ai-schema';
import type { ImageStats, PixelImage } from './stats';
import { canvasToBlob, createCanvas } from '../image/decode';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (s: ImageStats) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; stats?: ImageStats; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.stats) p.resolve(e.data.stats);
      else p.reject(new Error(e.data.error ?? 'Analysis failed.'));
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(new Error('The analysis worker crashed.'));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

export function statsInWorker(image: PixelImage, detail?: PixelImage, signal?: AbortSignal): Promise<ImageStats> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    signal?.addEventListener('abort', () => {
      if (pending.delete(id)) reject(new DOMException('Cancelled', 'AbortError'));
    });
    getWorker().postMessage({ id, image, detail });
  });
}

/** Pixel data at reduced size plus a native-resolution centre crop for grain. */
export function samplesFor(bitmap: ImageBitmap): { image: PixelImage; detail: PixelImage } {
  const k = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const dw = Math.min(640, bitmap.width);
  const dh = Math.min(640, bitmap.height);
  const d = createCanvas(dw, dh);
  const dctx = d.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  dctx.drawImage(bitmap, Math.floor((bitmap.width - dw) / 2), Math.floor((bitmap.height - dh) / 2), dw, dh, 0, 0, dw, dh);
  return {
    image: { width: w, height: h, data: image.data },
    detail: { width: dw, height: dh, data: dctx.getImageData(0, 0, dw, dh).data },
  };
}

export class AiError extends Error {
  readonly code: ApiErrorCode | 'network' | 'unreachable';
  readonly retryable: boolean;
  constructor(code: AiError['code'], message: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export interface AiHealth {
  reachable: boolean;
  configured: boolean;
  model: string | null;
}

let healthCache: { at: number; value: AiHealth } | null = null;

export async function getAiHealth(force = false): Promise<AiHealth> {
  if (!force && healthCache && Date.now() - healthCache.at < 30_000) return healthCache.value;
  const attempt = async (): Promise<AiHealth | null> => {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(10_000) });
      const parsed = HealthResponseSchema.safeParse(await res.json());
      return parsed.success ? { reachable: true, configured: parsed.data.ai.configured, model: parsed.data.ai.model } : null;
    } catch {
      return null;
    }
  };
  // One retry: a busy device can delay the first request.
  const value = (await attempt()) ?? (await attempt());
  if (value) {
    healthCache = { at: Date.now(), value };
    return value;
  }
  // Failures are not cached, so the next analysis checks again.
  return { reachable: false, configured: false, model: null };
}

/** Downscaled JPEG of the reference for the vision model (max 1024 px long edge). */
export async function encodeForAi(bitmap: ImageBitmap): Promise<{ mediaType: 'image/jpeg'; data: string }> {
  const k = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const c = createCanvas(Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k)));
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.85);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { mediaType: 'image/jpeg', data: btoa(bin) };
}

export async function interpretWithAi(
  image: { mediaType: 'image/jpeg'; data: string },
  measured: MeasuredSummary,
  signal: AbortSignal,
): Promise<{ interpretation: StyleInterpretation; model: string }> {
  let res: Response;
  try {
    res = await fetch('/api/analyze-style', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image, measured }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(110_000)]),
    });
  } catch (e) {
    if (signal.aborted) throw new AiError('cancelled', 'Cancelled.', true);
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new AiError('upstream_timeout', 'The AI request timed out.', true);
    throw new AiError('unreachable', 'Could not reach the app server. Is it running (npm run dev)?', true);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiError('network', `The server returned an unreadable response (${res.status}).`, true);
  }
  if (!res.ok) {
    const err = ApiErrorSchema.safeParse(body);
    if (err.success) throw new AiError(err.data.error.code, err.data.error.message, err.data.error.retryable);
    throw new AiError('network', `The server returned an error (${res.status}).`, res.status >= 500);
  }
  const parsed = AnalyzeResponseSchema.safeParse(body);
  if (!parsed.success) throw new AiError('invalid_model_output', 'The AI response failed validation and was discarded.', true);
  return parsed.data;
}
