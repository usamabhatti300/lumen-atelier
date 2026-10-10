/**
 * Integrity-checked model downloads from this app's own origin. A file is
 * accepted only if it is a registered, safe-format path, is served by our
 * origin, has exactly the registered size and matches its SHA-256.
 */
import { MODELS_BASE, isSafeModelPath, type ModelFile } from './registry';

export class ModelMissingError extends Error {
  override name = 'ModelMissingError';
}
export class ModelIntegrityError extends Error {
  override name = 'ModelIntegrityError';
}
export class ForeignRequestError extends Error {
  override name = 'ForeignRequestError';
}

export const SETUP_HINT = 'Run "npm run setup:models" in the project folder, then reload.';

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Absolute URL of a model file on `origin`; throws for unsafe or traversal paths. */
export function modelUrl(file: ModelFile, origin: string): string {
  if (!isSafeModelPath(file.path)) throw new ModelIntegrityError(`Refusing to load "${file.path}": not an allowed model file.`);
  return new URL(MODELS_BASE + file.path, origin).href;
}

/** Throws unless `url` points at `origin`. Used to keep every ML request on-device. */
export function assertSameOrigin(url: string, origin: string): URL {
  const u = new URL(url, origin);
  if (u.origin !== new URL(origin).origin) {
    throw new ForeignRequestError(`Blocked a request to ${u.origin}: AI models load only from this app.`);
  }
  return u;
}

export interface FetchVerifiedOptions {
  origin: string;
  signal?: AbortSignal;
  /** Bytes received so far for this file. */
  onBytes?: (received: number) => void;
  fetchImpl?: typeof fetch;
}

export async function fetchVerified(file: ModelFile, opts: FetchVerifiedOptions): Promise<Uint8Array> {
  const url = modelUrl(file, opts.origin);
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(url, { signal: opts.signal });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || type.includes('text/html') || !res.body) {
    throw new ModelMissingError(`Model file "${file.path}" is not installed. ${SETUP_HINT}`);
  }
  const out = new Uint8Array(file.bytes);
  let received = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      opts.signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.byteLength > file.bytes) {
        throw new ModelIntegrityError(`"${file.path}" is larger than expected; it may be corrupt or replaced. ${SETUP_HINT}`);
      }
      out.set(value, received);
      received += value.byteLength;
      opts.onBytes?.(received);
    }
  } finally {
    reader.releaseLock();
  }
  if (received !== file.bytes) {
    throw new ModelIntegrityError(`"${file.path}" is incomplete (${received} of ${file.bytes} bytes). ${SETUP_HINT}`);
  }
  if ((await sha256Hex(out)) !== file.sha256) {
    throw new ModelIntegrityError(`"${file.path}" failed its checksum; it may be corrupt or tampered with. ${SETUP_HINT}`);
  }
  return out;
}

/** Sums per-file byte counts into one overall progress figure. */
export function progressTracker(files: readonly ModelFile[], onProgress: (loaded: number, total: number) => void) {
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const got = new Map<string, number>();
  return (file: ModelFile, received: number) => {
    got.set(file.path, received);
    let loaded = 0;
    for (const v of got.values()) loaded += v;
    onProgress(loaded, total);
  };
}
