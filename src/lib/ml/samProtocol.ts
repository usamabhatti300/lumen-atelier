/** Worker messages for "Select object" (SlimSAM). Kept apart from protocol.ts so features stay independent. */
import type { ObjectPoint } from '../schema/adjustments';

export const SAM_MODEL_ID = 'slimsam';

export type SamRequest =
  /** Downloads (verified) and starts SlimSAM; reports byte progress. */
  | { type: 'sam-load'; id: number }
  /** Computes the image embedding for `key` (once per photo). `rgba` is the photo at <= OBJECT_MASK_SIDE. */
  | { type: 'sam-embed'; id: number; key: string; width: number; height: number; rgba: Uint8ClampedArray }
  /** Decodes a mask for the clicked points (normalized source coordinates) of an embedded photo. */
  | { type: 'sam-decode'; id: number; key: string; points: ObjectPoint[] }
  | { type: 'sam-forget'; id: number; key: string };

export interface SamLoadResult {
  backend: 'webgpu' | 'wasm';
}

export interface SamEmbedResult {
  ms: number;
}

export interface SamDecodeResult {
  width: number;
  height: number;
  /** Coverage 0..255 in the embedded image's extent. */
  data: Uint8Array;
  /** Predicted IoU of the chosen mask. */
  score: number;
  ms: number;
}

export function isSamRequest(msg: { type: string }): msg is SamRequest {
  return msg.type.startsWith('sam-');
}
