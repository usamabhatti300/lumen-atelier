/** Messages between the main thread (client.ts) and the ML worker (ml.worker.ts). */
import type { Backend } from './ort';

export type TensorType = 'float32' | 'uint8' | 'int64' | 'int32' | 'bool';

export interface TensorData {
  type: TensorType;
  dims: number[];
  data: Float32Array | Uint8Array | BigInt64Array | Int32Array;
}

export type MlRequest =
  | { type: 'selftest'; id: number }
  | { type: 'load'; id: number; modelId: string }
  | { type: 'run'; id: number; modelId: string; file?: string; feeds: Record<string, TensorData> }
  | { type: 'release'; id: number; modelId: string }
  | { type: 'depth'; id: number; image: DepthImage }
  | { type: 'cancel'; id: number };

export interface BackendCheck {
  backend: Backend;
  ok: boolean;
  ms?: number;
  error?: string;
}

export interface SelfTestResult {
  ortVersion: string;
  crossOriginIsolated: boolean;
  threads: number;
  backends: BackendCheck[];
  transformers: { version: string; remoteModelsDisabled: boolean } | { error: string };
}

export interface LoadResult {
  /** Backend chosen for each ONNX file of the model. */
  backends: Record<string, Backend>;
}

/** RGBA pixels sent for depth estimation. */
export interface DepthImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Normalized nearness (0 far .. 65535 near), row-major, at the size of the image sent. */
export interface DepthResult {
  width: number;
  height: number;
  data: Uint16Array;
  backend: Backend;
  /** Inference time (excluding model download and start-up). */
  ms: number;
}

export type MlResponse =
  | { type: 'progress'; id: number; loaded: number; total: number }
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; id: number; error: { name: string; message: string } };
