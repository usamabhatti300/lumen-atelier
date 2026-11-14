/** Preset library state: built-in presets, user presets (IndexedDB), favourites. */
import { create } from 'zustand';
import { BUILTIN_PRESETS, migrateLookIds } from '@/lib/presets/library';
import { ROLLS } from '@/lib/presets/rolls';
import {
  deletePresetRecord,
  getSetting,
  listUserPresets,
  newId,
  putPreset,
  setSetting,
} from '@/lib/storage/db';
import { PRESET_CATEGORY_IDS, parsePresetFile, serializePresets, type Preset, type PresetCategoryId } from '@/lib/schema/preset';
import type { PartialAdjustments } from '@/lib/schema/adjustments';
import { useEditor } from './editorStore';

/** What a look's category is called on screen: its roll's name (Yours and Matched for your own). */
export const ALL_CATEGORY_LABELS = Object.fromEntries(PRESET_CATEGORY_IDS.map((c) => [c, ROLLS[c].name])) as Record<PresetCategoryId, string>;

/** The kinds of photo each built-in look was made for (recommend.ts). */
export const BUILTIN_SUITS = BUILTIN_PRESETS.map((p) => ({ id: p.id, category: p.category, suits: p.suits }));


/** Built-ins in shelf order: roll by roll, frame by frame. */
const BUILTINS: Preset[] = BUILTIN_PRESETS.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  description: p.description,
  tags: p.tags,
  origin: 'builtin' as const,
  adjustments: p.adjustments,
  createdAt: 0,
  updatedAt: 0,
}));

/** How many looks "Last roll" remembers. */
export const RECENT_LIMIT = 12;

interface PresetState {
  loaded: boolean;
  user: Preset[];
  favorites: string[];
  /** Looks applied most recently, newest first ("Last roll"). */
  recent: string[];
  noteApplied(id: string): void;
  load(): Promise<void>;
  all(): Preset[];
  byId(id: string): Preset | undefined;
  create(input: Omit<Preset, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & { origin?: Preset['origin'] }): Promise<Preset>;
  update(id: string, patch: Partial<Pick<Preset, 'name' | 'description' | 'category' | 'adjustments' | 'tags'>>): Promise<void>;
  duplicate(id: string): Promise<Preset | undefined>;
  remove(id: string): Promise<void>;
  toggleFavorite(id: string): void;
  importFile(text: string): Promise<{ added: number; warnings: string[]; rejected: number }>;
  exportJson(ids: string[]): string;
}

export const usePresets = create<PresetState>((set, get) => ({
  loaded: false,
  user: [],
  favorites: [],
  recent: [],

  async load() {
    if (get().loaded) return;
    // Storage can be unavailable (private mode, blocked site data): the built-in looks still work.
    const [user, storedFavorites, storedRecent] = await Promise.all([
      listUserPresets().catch(() => [] as Preset[]),
      getSetting<string[]>('favorites').catch(() => undefined),
      getSetting<string[]>('recentLooks').catch(() => undefined),
    ]);
    const known = new Set([...user.map((p) => p.id), ...BUILTINS.map((p) => p.id)]);
    const favorites = migrateLookIds(storedFavorites ?? [], known);
    // Looks applied before the store finished loading stay at the front.
    const recent = migrateLookIds([...get().recent, ...(storedRecent ?? [])], known).slice(0, RECENT_LIMIT);
    set({ user, favorites, recent, loaded: true });
    if (storedFavorites && favorites.length !== storedFavorites.length) void setSetting('favorites', favorites).catch(() => undefined);
    if (storedRecent && recent.join() !== storedRecent.join()) void setSetting('recentLooks', recent).catch(() => undefined);
  },

  noteApplied(id) {
    const next = [id, ...get().recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT);
    set({ recent: next });
    void setSetting('recentLooks', next).catch(() => undefined);
  },

  all() {
    return [...get().user, ...BUILTINS];
  },

  byId(id) {
    return get().user.find((p) => p.id === id) ?? BUILTINS.find((p) => p.id === id);
  },

  async create(input) {
    const now = Date.now();
    const preset: Preset = {
      ...input,
      origin: input.origin ?? 'user',
      id: newId('u_'),
      name: input.name.trim().slice(0, 80) || 'Untitled look',
      createdAt: now,
      updatedAt: now,
    };
    await putPreset(preset);
    set({ user: [preset, ...get().user] });
    return preset;
  },

  async update(id, patch) {
    const p = get().user.find((x) => x.id === id);
    if (!p) return;
    const next: Preset = { ...p, ...patch, updatedAt: Date.now() };
    await putPreset(next);
    set({ user: get().user.map((x) => (x.id === id ? next : x)) });
  },

  async duplicate(id) {
    const p = get().byId(id);
    if (!p) return undefined;
    return get().create({
      name: `${p.name} copy`,
      category: p.origin === 'builtin' ? 'custom' : p.category,
      description: p.description,
      tags: p.tags,
      adjustments: structuredClone(p.adjustments) as PartialAdjustments,
      reference: p.reference,
    });
  },

  async remove(id) {
    await deletePresetRecord(id);
    set({
      user: get().user.filter((p) => p.id !== id),
      favorites: get().favorites.filter((f) => f !== id),
      recent: get().recent.filter((r) => r !== id),
    });
    void setSetting('favorites', get().favorites).catch(() => undefined);
    void setSetting('recentLooks', get().recent).catch(() => undefined);
  },

  toggleFavorite(id) {
    const favs = get().favorites;
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    set({ favorites: next });
    void setSetting('favorites', next).catch(() => undefined);
  },

  async importFile(text) {
    const result = parsePresetFile(text, () => newId('u_'));
    for (const p of result.presets) await putPreset(p);
    set({ user: [...result.presets, ...get().user] });
    return { added: result.presets.length, warnings: result.warnings, rejected: result.rejected };
  },

  exportJson(ids) {
    const presets = ids.map((id) => get().byId(id)).filter((p): p is Preset => !!p);
    return serializePresets(presets);
  },
}));

// "Last roll": remember a look when it is put on the photo you are editing. Switching photos
// (which changes the applied look without anyone choosing one) is not recorded.
useEditor.subscribe(
  (s) => [s.activePhotoId, s.edit.appliedPreset?.id ?? null] as const,
  ([photo, look], [prevPhoto, prevLook]) => {
    if (look && look !== prevLook && photo === prevPhoto) usePresets.getState().noteApplied(look);
  },
  { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] },
);

export function downloadText(text: string, fileName: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
