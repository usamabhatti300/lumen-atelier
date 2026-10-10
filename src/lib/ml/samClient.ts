/** Main-thread API for "Select object" (SlimSAM) in the shared ML worker. */
import type { ObjectPoint } from '../schema/adjustments';
import { call } from './client';
import type { SamDecodeResult, SamEmbedResult, SamLoadResult } from './samProtocol';

export function samLoad(opts: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {}) {
  return call<SamLoadResult>({ type: 'sam-load' }, opts);
}

/** Sends the photo (<= OBJECT_MASK_SIDE, RGBA) to the worker and computes its embedding. The pixel buffer is transferred. */
export function samEmbed(key: string, image: ImageData, signal?: AbortSignal) {
  const rgba = image.data;
  return call<SamEmbedResult>({ type: 'sam-embed', key, width: image.width, height: image.height, rgba }, { signal, transfer: [rgba.buffer] });
}

export function samDecode(key: string, points: ObjectPoint[], signal?: AbortSignal) {
  return call<SamDecodeResult>({ type: 'sam-decode', key, points }, { signal });
}

export function samForget(key: string) {
  return call<boolean>({ type: 'sam-forget', key });
}
