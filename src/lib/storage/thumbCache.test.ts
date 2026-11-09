import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  THUMB_CACHE_MAX,
  _resetDbForTests,
  clearAllData,
  deleteCachedThumbs,
  getCachedThumb,
  getDb,
  putCachedThumb,
} from './db';

beforeEach(() => {
  // A fresh, empty browser database for every test.
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

const jpeg = (n = 3) => new Blob([new Uint8Array(n)], { type: 'image/jpeg' });

describe('look-preview cache (IndexedDB v2)', () => {
  it('upgrades an existing v1 database without touching its data', async () => {
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' }).createIndex('byUpdated', 'updatedAt');
        db.createObjectStore('photos', { keyPath: 'id' }).createIndex('byProject', 'projectId');
        for (const s of ['originals', 'presets', 'luts']) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
    await v1.put('projects', { id: 'p1', name: 'Mine', updatedAt: 1 });
    v1.close();
    const db = await getDb();
    expect(db.version).toBe(2);
    expect(await db.get('projects', 'p1')).toMatchObject({ name: 'Mine' });
    expect([...db.objectStoreNames]).toContain('thumbs');
  });

  it('stores and returns a preview', async () => {
    expect(await getCachedThumb('k')).toBeNull();
    await putCachedThumb('k', 'photo1', jpeg(5));
    const b = await getCachedThumb('k');
    expect(b?.size).toBe(5);
  });

  it('drops the oldest previews when it grows past the cap', async () => {
    const db = await getDb();
    const tx = db.transaction('thumbs', 'readwrite');
    for (let i = 0; i < THUMB_CACHE_MAX; i++) void tx.store.put({ key: `k${i}`, source: 's', blob: jpeg(1), at: i });
    await tx.done;
    await putCachedThumb('newest', 's', jpeg(1));
    const count = await db.count('thumbs');
    expect(count).toBeLessThanOrEqual(THUMB_CACHE_MAX - THUMB_CACHE_MAX / 5 + 1);
    expect(await db.get('thumbs', 'k0')).toBeUndefined();
    expect(await db.get('thumbs', 'newest')).toBeDefined();
    expect(await db.get('thumbs', `k${THUMB_CACHE_MAX - 1}`)).toBeDefined();
  }, 30_000); // 2,000 records in the in-memory fake; slow when the whole suite runs in parallel

  it('deletes a photo’s previews with it, and everything on "delete all data"', async () => {
    await putCachedThumb('a1', 'photoA', jpeg());
    await putCachedThumb('a2', 'photoA', jpeg());
    await putCachedThumb('b1', 'photoB', jpeg());
    await deleteCachedThumbs(['photoA']);
    expect(await getCachedThumb('a1')).toBeNull();
    expect(await getCachedThumb('a2')).toBeNull();
    expect(await getCachedThumb('b1')).not.toBeNull();
    await clearAllData().catch(() => undefined); // other caches may be unavailable under Node
    expect(await (await getDb()).count('thumbs')).toBe(0);
  });
});
