/**
 * Local-first persistence in IndexedDB. Nothing here leaves the device.
 *
 * Stores
 *   projects   project metadata (name, photo order, active photo)
 *   photos     per-photo metadata, thumbnail and versioned EditState
 *   originals  the untouched original file bytes (never modified)
 *   presets    user-created presets (built-ins ship with the app)
 *   luts       imported 3D LUTs
 *   settings   key/value app settings
 *
 * Records carry a schema version and are validated with Zod when loaded, so
 * corrupted or older records are repaired or skipped instead of crashing.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import { EditStateSchema, defaultEditState, type EditState } from '../schema/adjustments';
import { PresetSchema, type Preset } from '../schema/preset';
import type { ExifInfo } from '../image/exif';
import { clearPatches } from '../removal/cache';
import { clearDepthCache, deleteCachedDepth } from './depthCache';

export const DB_NAME = 'lumen-atelier';
/** 2: adds `thumbs` (look-preview cache per photo, roadmap 1.5). */
export const DB_VERSION = 2;
export const PROJECT_SCHEMA_VERSION = 1;

export interface ProjectRecord {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  photoIds: string[];
  activePhotoId: string | null;
}

export interface PhotoRecord {
  schemaVersion: number;
  id: string;
  projectId: string;
  name: string;
  mime: string;
  width: number;
  height: number;
  byteSize: number;
  exif: ExifInfo;
  createdAt: number;
  updatedAt: number;
  thumbnail: Blob;
  edit: EditState;
}

export interface LutRecord {
  id: string;
  name: string;
  size: number;
  /** size^3 * 3 floats, red fastest. */
  data: Float32Array;
  createdAt: number;
}

interface AtelierDB extends DBSchema {
  projects: { key: string; value: ProjectRecord; indexes: { byUpdated: number } };
  photos: { key: string; value: PhotoRecord; indexes: { byProject: string } };
  originals: { key: string; value: { id: string; blob: Blob } };
  presets: { key: string; value: Preset };
  luts: { key: string; value: LutRecord };
  settings: { key: string; value: { key: string; value: unknown } };
  thumbs: { key: string; value: ThumbRecord; indexes: { byAt: number; bySource: string } };
}

/** A cached look preview (JPEG) for one source photo; `key` covers the photo, size, look and pipeline. */
export interface ThumbRecord {
  key: string;
  /** The photo id (or 'sample' / 'scene') the preview was rendered from, so deleting a photo deletes its previews. */
  source: string;
  blob: Blob;
  /** Last written or read (ms), for eviction. */
  at: number;
}

/** At most this many cached previews (~15–25 KB each); the oldest fifth goes when it's exceeded. */
export const THUMB_CACHE_MAX = 2000;

let dbPromise: Promise<IDBPDatabase<AtelierDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AtelierDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AtelierDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' });
          projects.createIndex('byUpdated', 'updatedAt');
          const photos = db.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('byProject', 'projectId');
          db.createObjectStore('originals', { keyPath: 'id' });
          db.createObjectStore('presets', { keyPath: 'id' });
          db.createObjectStore('luts', { keyPath: 'id' });
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          const thumbs = db.createObjectStore('thumbs', { keyPath: 'key' });
          thumbs.createIndex('byAt', 'at');
          thumbs.createIndex('bySource', 'source');
        }
      },
    });
  }
  return dbPromise;
}

/** For tests: reset the cached connection. */
export function _resetDbForTests() {
  dbPromise = null;
}

export const newId = (prefix = '') =>
  `${prefix}${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

// --- Projects ----------------------------------------------------------------

const ProjectRecordSchema = z.object({
  schemaVersion: z.number(),
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  photoIds: z.array(z.string()),
  activePhotoId: z.string().nullable(),
});

export async function listProjects(): Promise<ProjectRecord[]> {
  const db = await getDb();
  const all = await db.getAll('projects');
  return all
    .map((p) => ProjectRecordSchema.safeParse(p))
    .flatMap((r) => (r.success ? [r.data] : []))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const db = await getDb();
  const p = await db.get('projects', id);
  const parsed = ProjectRecordSchema.safeParse(p);
  return parsed.success ? parsed.data : undefined;
}

export async function createProject(name: string): Promise<ProjectRecord> {
  const now = Date.now();
  const project: ProjectRecord = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('p_'),
    name,
    createdAt: now,
    updatedAt: now,
    photoIds: [],
    activePhotoId: null,
  };
  const db = await getDb();
  await db.put('projects', project);
  return project;
}

export async function saveProject(project: ProjectRecord): Promise<void> {
  const db = await getDb();
  await db.put('projects', { ...project, updatedAt: Date.now() });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  const photos = await db.getAllFromIndex('photos', 'byProject', id);
  const tx = db.transaction(['projects', 'photos', 'originals'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').delete(id),
    ...photos.map((p) => tx.objectStore('photos').delete(p.id)),
    ...photos.map((p) => tx.objectStore('originals').delete(p.id)),
    tx.done,
  ]);
  for (const p of photos) await clearPatches(p.id);
  await deleteCachedDepth(photos.map((p) => p.id));
  await deleteCachedThumbs(photos.map((p) => p.id));
}

// --- Photos ------------------------------------------------------------------

/** Validates a stored EditState, falling back to defaults for corrupted records. */
export function reviveEdit(raw: unknown): { edit: EditState; repaired: boolean } {
  const parsed = EditStateSchema.safeParse(raw);
  if (parsed.success) return { edit: parsed.data as EditState, repaired: false };
  return { edit: defaultEditState(), repaired: true };
}

export async function addPhoto(record: Omit<PhotoRecord, 'schemaVersion'>, original: Blob): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['photos', 'originals'], 'readwrite');
  await Promise.all([
    tx.objectStore('photos').put({ ...record, schemaVersion: PROJECT_SCHEMA_VERSION }),
    tx.objectStore('originals').put({ id: record.id, blob: original }),
    tx.done,
  ]);
}

export async function getPhotos(projectId: string): Promise<PhotoRecord[]> {
  const db = await getDb();
  const photos = await db.getAllFromIndex('photos', 'byProject', projectId);
  return photos.map((p) => ({ ...p, edit: reviveEdit(p.edit).edit }));
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const db = await getDb();
  const p = await db.get('photos', id);
  return p ? { ...p, edit: reviveEdit(p.edit).edit } : undefined;
}

export async function getOriginal(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  return (await db.get('originals', id))?.blob;
}

export async function updatePhotoEdit(id: string, edit: EditState, thumbnail?: Blob): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('photos', 'readwrite');
  const existing = await tx.store.get(id);
  if (existing) {
    await tx.store.put({ ...existing, edit, updatedAt: Date.now(), ...(thumbnail ? { thumbnail } : {}) });
  }
  await tx.done;
}

export async function renamePhoto(id: string, name: string): Promise<void> {
  const db = await getDb();
  const p = await db.get('photos', id);
  if (p) await db.put('photos', { ...p, name, updatedAt: Date.now() });
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['photos', 'originals'], 'readwrite');
  await Promise.all([tx.objectStore('photos').delete(id), tx.objectStore('originals').delete(id), tx.done]);
  await clearPatches(id);
  await deleteCachedDepth([id]);
  await deleteCachedThumbs([id]);
}

// --- Presets -----------------------------------------------------------------

export async function listUserPresets(): Promise<Preset[]> {
  const db = await getDb();
  const all = await db.getAll('presets');
  return all
    .map((p) => PresetSchema.safeParse(p))
    .flatMap((r) => (r.success ? [r.data as Preset] : []))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putPreset(preset: Preset): Promise<void> {
  const db = await getDb();
  await db.put('presets', preset);
}

export async function deletePresetRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('presets', id);
}

// --- LUTs --------------------------------------------------------------------

export async function putLut(lut: LutRecord): Promise<void> {
  const db = await getDb();
  await db.put('luts', lut);
}

export async function getLut(id: string): Promise<LutRecord | undefined> {
  const db = await getDb();
  return db.get('luts', id);
}

export async function listLuts(): Promise<LutRecord[]> {
  const db = await getDb();
  return db.getAll('luts');
}

// --- Settings ----------------------------------------------------------------

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get('settings', key))?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key, value });
}

/** Rough storage usage (where the browser supports it). */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

/** Deletes every project, photo, preset, LUT and setting stored by the app. */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const stores = ['projects', 'photos', 'originals', 'presets', 'luts', 'settings'] as const;
  const tx = db.transaction([...stores], 'readwrite');
  await Promise.all([...stores.map((s) => tx.objectStore(s).clear()), tx.done]);
  await clearPatches();
  await clearDepthCache();
  await db.clear('thumbs');
}

// ---------------------------------------------------------------------------
// Look-preview cache (roadmap 1.5). Best effort: failures just mean a re-render.
// ---------------------------------------------------------------------------

export async function getCachedThumb(key: string): Promise<Blob | null> {
  try {
    const db = await getDb();
    const rec = await db.get('thumbs', key);
    if (!rec) return null;
    void db.put('thumbs', { ...rec, at: Date.now() }).catch(() => undefined);
    return rec.blob;
  } catch {
    return null;
  }
}

export async function putCachedThumb(key: string, source: string, blob: Blob): Promise<void> {
  try {
    const db = await getDb();
    await db.put('thumbs', { key, source, blob, at: Date.now() });
    const count = await db.count('thumbs');
    if (count > THUMB_CACHE_MAX) {
      const tx = db.transaction('thumbs', 'readwrite');
      let cursor = await tx.store.index('byAt').openCursor();
      let drop = Math.ceil(THUMB_CACHE_MAX / 5) + (count - THUMB_CACHE_MAX);
      while (cursor && drop-- > 0) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  } catch {
    /* storage full or unavailable: previews still render, they just aren't kept */
  }
}

/** Previews show the photo, so they go with it. */
export async function deleteCachedThumbs(sources: string[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction('thumbs', 'readwrite');
    for (const src of sources) {
      for (const key of await tx.store.index('bySource').getAllKeys(src)) await tx.store.delete(key);
    }
    await tx.done;
  } catch {
    /* best effort */
  }
}
