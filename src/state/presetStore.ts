/** Preset library state: built-in presets, user presets (IndexedDB), favourites. */
import { create } from 'zustand';
import { BUILTIN_PRESETS, CATEGORY_LABELS } from '@/lib/presets/library';
import {
  deletePresetRecord,
  getSetting,
  listUserPresets,
  newId,
  putPreset,
  setSetting,
} from '@/lib/storage/db';
import { parsePresetFile, serializePresets, type Preset, type PresetCategoryId } from '@/lib/schema/preset';
import type { PartialAdjustments } from '@/lib/schema/adjustments';
import { useEditor } from './editorStore';

export const ALL_CATEGORY_LABELS: Record<PresetCategoryId, string> = {
  ...CATEGORY_LABELS,
  custom: 'My presets',
  reference: 'From references',
};

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
    const [user, favorites, recent] = await Promise.all([
      listUserPresets(),
      getSetting<string[]>('favorites'),
      getSetting<string[]>('recentLooks'),
    ]);
    // Looks applied before the store finished loading stay at the front.
    const early = get().recent;
    set({
      user,
      favorites: favorites ?? [],
      recent: [...new Set([...early, ...(recent ?? [])])].slice(0, RECENT_LIMIT),
      loaded: true,
    });
  },

  noteApplied(id) {
    const next = [id, ...get().recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT);
    set({ recent: next });
    void setSetting('recentLooks', next);
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
      name: input.name.trim().slice(0, 80) || 'Untitled preset',
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
    void setSetting('favorites', get().favorites);
    void setSetting('recentLooks', get().recent);
  },

  toggleFavorite(id) {
    const favs = get().favorites;
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    set({ favorites: next });
    void setSetting('favorites', next);
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
