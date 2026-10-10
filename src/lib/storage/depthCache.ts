/**
 * Per-photo cache of depth maps (Depth Anything V2 Small output) in its own
 * IndexedDB database, so the main database's schema is untouched. A depth map
 * is derived data: it is never baked into the photo, can be deleted at any
 * time, and is recomputed on demand when missing. Entries record the model
 * file they came from and are ignored if the model changes.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DepthMap } from '../depth/raster';
import { getModel } from '../ml/registry';

interface DepthRecord {
  photoId: string;
  model: string;
  width: number;
  height: number;
  data: Uint16Array;
  createdAt: number;
}

interface DepthDB extends DBSchema {
  depth: { key: string; value: DepthRecord };
}

export const DEPTH_DB_NAME = 'lumen-atelier-depth';

let dbPromise: Promise<IDBPDatabase<DepthDB>> | null = null;

function db() {
  dbPromise ??= openDB<DepthDB>(DEPTH_DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('depth', { keyPath: 'photoId' });
    },
  });
  return dbPromise;
}

/** Identifies the exact model file a depth map came from. */
export function depthModelKey(): string {
  const m = getModel('depth-anything-v2-small');
  const onnx = m.files.find((f) => f.path.endsWith('.onnx'));
  return `${m.id}@${onnx?.sha256.slice(0, 16) ?? 'unknown'}`;
}

export async function getCachedDepth(photoId: string): Promise<DepthMap | null> {
  try {
    const r = await (await db()).get('depth', photoId);
    if (!r || r.model !== depthModelKey() || !(r.data instanceof Uint16Array) || r.data.length !== r.width * r.height) return null;
    return { width: r.width, height: r.height, data: r.data };
  } catch {
    return null;
  }
}

export async function putCachedDepth(photoId: string, depth: DepthMap): Promise<void> {
  try {
    await (await db()).put('depth', { photoId, model: depthModelKey(), width: depth.width, height: depth.height, data: depth.data, createdAt: Date.now() });
  } catch {
    /* A full or unavailable cache only means the depth is recomputed next time. */
  }
}

export async function deleteCachedDepth(photoIds: string[]): Promise<void> {
  try {
    const tx = (await db()).transaction('depth', 'readwrite');
    await Promise.all([...photoIds.map((id) => tx.store.delete(id)), tx.done]);
  } catch {
    /* ignore */
  }
}

export async function clearDepthCache(): Promise<void> {
  try {
    await (await db()).clear('depth');
  } catch {
    /* ignore */
  }
}
