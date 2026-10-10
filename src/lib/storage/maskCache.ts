/**
 * Local cache of computed "Select object" mask rasters (IndexedDB). This is a
 * derived cache, separate from the main database: the edit state keeps only
 * the clicked points, so anything here can be evicted and recomputed.
 * Nothing here leaves the device.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ObjectMaskRaster } from '../masks/objectMask';

const CACHE_DB = 'lumen-atelier-mask-cache';
const MAX_ENTRIES = 300;

interface CacheRecord {
  key: string;
  width: number;
  height: number;
  data: Uint8Array;
  at: number;
}

interface CacheDB extends DBSchema {
  objectMasks: { key: string; value: CacheRecord; indexes: { byAt: number } };
}

let dbPromise: Promise<IDBPDatabase<CacheDB>> | null = null;

function db() {
  dbPromise ??= openDB<CacheDB>(CACHE_DB, 1, {
    upgrade(d) {
      d.createObjectStore('objectMasks', { keyPath: 'key' }).createIndex('byAt', 'at');
    },
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

export async function getCachedObjectMask(key: string): Promise<ObjectMaskRaster | null> {
  try {
    const r = await (await db()).get('objectMasks', key);
    if (!r || !(r.data instanceof Uint8Array) || r.data.length !== r.width * r.height) return null;
    return { width: r.width, height: r.height, data: r.data };
  } catch {
    return null;
  }
}

export async function putCachedObjectMask(key: string, raster: ObjectMaskRaster): Promise<void> {
  try {
    const d = await db();
    await d.put('objectMasks', { key, width: raster.width, height: raster.height, data: raster.data, at: Date.now() });
    const count = await d.count('objectMasks');
    if (count > MAX_ENTRIES) {
      const tx = d.transaction('objectMasks', 'readwrite');
      let cursor = await tx.store.index('byAt').openCursor();
      for (let n = count - MAX_ENTRIES; cursor && n > 0; n--) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  } catch {
    // The cache is optional (e.g. storage full or private mode): the mask is simply recomputed next time.
  }
}
