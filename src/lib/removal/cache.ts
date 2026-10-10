/**
 * Cache of filled removal patches. A patch is fully determined by the photo,
 * the working size and the strokes of the removal and of every removal before
 * it (see removalChainKeys), so it can always be recomputed; the cache only
 * saves the inference time.
 *
 * Two tiers: an in-memory LRU, and (for preview patches) the browser's Cache
 * Storage on this device, so removals reappear instantly after a reload. The
 * persisted tier is cleared with the photo and with "Delete all local data".
 * Nothing in it is ever sent anywhere: Cache Storage is local, and no service
 * worker serves it.
 */
import type { RemovalPatch } from './removal';

const MEMORY_LIMIT_BYTES = 128 * 1024 * 1024;
const CACHE_NAME = 'lumen-removals-v1';
const PREFIX = '/__lumen-removal-cache/';
/** Persisted entries kept per browser profile (oldest dropped first). */
const PERSIST_LIMIT = 300;

const memory = new Map<string, RemovalPatch>();
let memoryBytes = 0;

const memKey = (scope: string, key: string) => `${scope}/${key}`;

function remember(k: string, patch: RemovalPatch) {
  const old = memory.get(k);
  if (old) {
    memory.delete(k);
    memoryBytes -= old.data.byteLength;
  }
  memory.set(k, patch);
  memoryBytes += patch.data.byteLength;
  for (const [key, p] of memory) {
    if (memoryBytes <= MEMORY_LIMIT_BYTES || key === k) break;
    memory.delete(key);
    memoryBytes -= p.data.byteLength;
  }
}

function storage(): CacheStorage | null {
  try {
    return typeof caches !== 'undefined' && globalThis.isSecureContext ? caches : null;
  } catch {
    return null;
  }
}

const urlFor = (scope: string, key: string) => `${PREFIX}${scope.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(key)}`;

export async function getPatch(scope: string, key: string, persist: boolean): Promise<RemovalPatch | null> {
  const k = memKey(scope, key);
  const hit = memory.get(k);
  if (hit) {
    remember(k, hit);
    return hit;
  }
  const cs = persist ? storage() : null;
  if (!cs) return null;
  try {
    const cache = await cs.open(CACHE_NAME);
    const res = await cache.match(urlFor(scope, key));
    if (!res) return null;
    const rect = (res.headers.get('x-rect') ?? '').split(',').map(Number);
    if (rect.length !== 4 || rect.some((v) => !Number.isInteger(v) || v < 0)) return null;
    const [x, y, w, h] = rect;
    const data = new Uint8ClampedArray(await res.arrayBuffer());
    if (data.length !== w * h * 4) return null;
    const patch = { x, y, w, h, data };
    remember(k, patch);
    return patch;
  } catch {
    return null;
  }
}

export async function putPatch(scope: string, key: string, patch: RemovalPatch, persist: boolean): Promise<void> {
  remember(memKey(scope, key), patch);
  const cs = persist ? storage() : null;
  if (!cs) return;
  try {
    const cache = await cs.open(CACHE_NAME);
    const body = new Uint8Array(patch.data.buffer as ArrayBuffer, patch.data.byteOffset, patch.data.byteLength).slice();
    await cache.put(
      urlFor(scope, key),
      new Response(body, { headers: { 'content-type': 'application/octet-stream', 'x-rect': `${patch.x},${patch.y},${patch.w},${patch.h}` } }),
    );
    const keys = await cache.keys();
    for (const req of keys.slice(0, Math.max(0, keys.length - PERSIST_LIMIT))) await cache.delete(req);
  } catch {
    /* Storage full or unavailable: the patch stays in memory only. */
  }
}

/** Forgets cached patches for one scope (a photo), or all of them. */
export async function clearPatches(scope?: string): Promise<void> {
  for (const k of [...memory.keys()]) {
    if (scope === undefined || k.startsWith(`${scope}/`)) {
      memoryBytes -= memory.get(k)!.data.byteLength;
      memory.delete(k);
    }
  }
  const cs = storage();
  if (!cs) return;
  try {
    if (scope === undefined) {
      await cs.delete(CACHE_NAME);
      return;
    }
    const cache = await cs.open(CACHE_NAME);
    const prefix = `${PREFIX}${encodeURIComponent(scope)}/`;
    for (const req of await cache.keys()) if (new URL(req.url).pathname.startsWith(prefix)) await cache.delete(req);
  } catch {
    /* ignore */
  }
}
