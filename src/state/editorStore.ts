/**
 * Editor state (Zustand). Holds the active photo's EditState, undo history,
 * UI state, and the actions that change them. GPU work lives in
 * engine/controller.ts, which subscribes to this store.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  defaultAdjustments,
  defaultEditState,
  defaultLocalAdjustments,
  getPath,
  leafPaths,
  mergeAdjustments,
  rangeForPath,
  setPath,
  type Adjustments,
  type EditState,
  type Geometry,
  type HealSpot,
  type LocalAdjustments,
  type MaskComponent,
  type MaskLayer,
  type PartialAdjustments,
  type Retouch,
} from '@/lib/schema/adjustments';
import { blendPreset } from '@/lib/presets/blend';
import { emptyHistory, record, redo as redoH, undo as undoH, type History } from '@/lib/history';
import type { Preset } from '@/lib/schema/preset';
import type { ExifInfo } from '@/lib/image/exif';
import { newId } from '@/lib/storage/db';

export interface PhotoMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  byteSize: number;
  mime: string;
  exif: ExifInfo;
  thumbUrl: string;
}

export type CompareMode = 'off' | 'split' | 'side' | 'before';
export type Tool = 'none' | 'crop' | 'brush' | 'linear' | 'radial' | 'heal';
export type RightTab = 'adjust' | 'color' | 'detail' | 'portrait' | 'masks' | 'geometry';
export type LeftTab = 'presets' | 'photos' | 'reference';
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export interface ClipboardData {
  adjustments: Adjustments;
  sourceName: string;
}

export const PASTE_GROUPS = [
  { id: 'basic', label: 'Light & white balance' },
  { id: 'presence', label: 'Presence' },
  { id: 'detail', label: 'Detail' },
  { id: 'hsl', label: 'HSL' },
  { id: 'curves', label: 'Curves' },
  { id: 'grading', label: 'Colour grading' },
  { id: 'mixer', label: 'Channel mixer' },
  { id: 'levels', label: 'Levels' },
  { id: 'effects', label: 'Vignette & grain' },
] as const;
export type PasteGroup = (typeof PASTE_GROUPS)[number]['id'];

interface Gesture {
  before: EditState;
  label: string;
}

export interface BrushSettings {
  size: number; // fraction of long edge
  softness: number;
  opacity: number;
  mode: 'add' | 'erase';
}

export interface EditorState {
  projectId: string | null;
  projectName: string;
  photos: PhotoMeta[];
  activePhotoId: string | null;
  edit: EditState;
  history: History<EditState>;
  /** Stashed edit/history for non-active photos in this session. */
  stash: Record<string, { edit: EditState; history: History<EditState> }>;
  gesture: Gesture | null;
  saveState: SaveState;
  lastSavedAt: number | null;
  clipboard: ClipboardData | null;

  // UI
  compare: CompareMode;
  split: number;
  zoom: number | 'fit';
  tool: Tool;
  activeLayerId: string | null;
  showMaskOverlay: boolean;
  leftTab: LeftTab;
  rightTab: RightTab;
  leftOpen: boolean;
  rightOpen: boolean;
  density: 'comfortable' | 'compact';
  brush: BrushSettings;
  /** Live (uncommitted) brush stroke for the active layer. */
  liveStroke: MaskComponent | null;
  toast: { id: number; message: string; tone: 'info' | 'error' | 'success' } | null;

  // Actions
  loadProject(projectId: string, name: string, photos: PhotoMeta[], edits: Record<string, EditState>, activeId: string | null): void;
  resetSession(): void;
  addPhotos(photos: PhotoMeta[], edits: Record<string, EditState>): void;
  removePhoto(id: string): void;
  renamePhotoMeta(id: string, name: string): void;
  setPhotoThumb(id: string, url: string): void;
  setActivePhoto(id: string): void;
  setProjectName(name: string): void;

  beginGesture(label: string): void;
  endGesture(): void;
  setAdjustment(path: string, value: unknown, label?: string): void;
  resetAdjustment(path: string): void;
  resetAll(): void;
  commitEdit(label: string, updater: (e: EditState) => EditState): void;
  undo(): void;
  redo(): void;

  applyPreset(preset: Pick<Preset, 'id' | 'name' | 'adjustments'>, amount?: number): void;
  setPresetAmount(amount: number): void;
  clearAppliedPreset(): void;
  toggleAdjustmentsVisible(): void;

  copyAdjustments(): void;
  pasteAdjustments(groups: PasteGroup[]): void;

  setGeometry(patch: Partial<Geometry>, label?: string): void;

  addLayer(name: string, components?: MaskComponent[], adjustments?: Partial<LocalAdjustments>): string;
  updateLayer(id: string, patch: Partial<Omit<MaskLayer, 'id'>>, label?: string): void;
  setLayerAdjustment(id: string, key: keyof LocalAdjustments, value: number): void;
  addMaskComponent(layerId: string, component: MaskComponent): void;
  removeMaskComponent(layerId: string, componentId: string): void;
  updateMaskComponent(layerId: string, component: MaskComponent): void;
  removeLayer(id: string): void;
  moveLayer(id: string, delta: -1 | 1): void;
  duplicateLayer(id: string): void;
  setActiveLayer(id: string | null): void;
  setLiveStroke(c: MaskComponent | null): void;

  setRetouch(key: keyof Omit<Retouch, 'spots'>, value: number): void;
  addSpot(spot: Omit<HealSpot, 'id'>): void;
  removeSpot(id: string): void;
  clearSpots(): void;

  setUi(patch: Partial<Pick<EditorState, 'compare' | 'split' | 'zoom' | 'tool' | 'showMaskOverlay' | 'leftTab' | 'rightTab' | 'leftOpen' | 'rightOpen' | 'density'>>): void;
  setBrush(patch: Partial<BrushSettings>): void;
  markSaved(at: number): void;
  setSaveState(s: SaveState): void;
  showToast(message: string, tone?: 'info' | 'error' | 'success'): void;
  dismissToast(): void;
}

let toastSeq = 0;

export const useEditor = create<EditorState>()(
  subscribeWithSelector((set, get) => {
    /** Apply a change to the edit, recording history unless inside a gesture. */
    const change = (label: string, updater: (e: EditState) => EditState) => {
      const { edit, gesture, history } = get();
      const next = updater(edit);
      if (next === edit) return;
      if (gesture) set({ edit: next, saveState: 'unsaved' });
      else set({ edit: next, history: record(history, edit, label), saveState: 'unsaved' });
    };

    /** Track manual edits of fields a live preset controls. */
    const withOverride = (e: EditState, path: string): EditState => {
      if (!e.appliedPreset) return e;
      const presetPaths = leafPaths(e.appliedPreset.values);
      const hit = presetPaths.find((p) => p === path || path.startsWith(`${p}.`) || p.startsWith(`${path}.`));
      if (!hit || e.appliedPreset.overrides.includes(path)) return e;
      return { ...e, appliedPreset: { ...e.appliedPreset, overrides: [...e.appliedPreset.overrides, path] } };
    };

    const updateLayers = (label: string, fn: (layers: MaskLayer[]) => MaskLayer[]) =>
      change(label, (e) => ({ ...e, layers: fn(e.layers) }));

    return {
      projectId: null,
      projectName: '',
      photos: [],
      activePhotoId: null,
      edit: defaultEditState(),
      history: emptyHistory(),
      stash: {},
      gesture: null,
      saveState: 'saved',
      lastSavedAt: null,
      clipboard: null,
      compare: 'off',
      split: 0.5,
      zoom: 'fit',
      tool: 'none',
      activeLayerId: null,
      showMaskOverlay: false,
      leftTab: 'presets',
      rightTab: 'adjust',
      leftOpen: true,
      rightOpen: true,
      density: 'comfortable',
      brush: { size: 0.06, softness: 0.6, opacity: 1, mode: 'add' },
      liveStroke: null,
      toast: null,

      loadProject(projectId, name, photos, edits, activeId) {
        const active = activeId && photos.some((p) => p.id === activeId) ? activeId : (photos[0]?.id ?? null);
        const stash: EditorState['stash'] = {};
        for (const p of photos) stash[p.id] = { edit: edits[p.id] ?? defaultEditState(), history: emptyHistory() };
        set({
          projectId,
          projectName: name,
          photos,
          activePhotoId: active,
          edit: active ? stash[active].edit : defaultEditState(),
          history: emptyHistory(),
          stash,
          gesture: null,
          saveState: 'saved',
          tool: 'none',
          activeLayerId: null,
          compare: 'off',
          zoom: 'fit',
        });
      },

      resetSession() {
        for (const p of get().photos) URL.revokeObjectURL(p.thumbUrl);
        set({ projectId: null, projectName: '', photos: [], activePhotoId: null, edit: defaultEditState(), history: emptyHistory(), stash: {} });
      },

      addPhotos(photos, edits) {
        const { stash, activePhotoId } = get();
        const nextStash = { ...stash };
        for (const p of photos) nextStash[p.id] = { edit: edits[p.id] ?? defaultEditState(), history: emptyHistory() };
        set({ photos: [...get().photos, ...photos], stash: nextStash });
        if (!activePhotoId && photos[0]) get().setActivePhoto(photos[0].id);
      },

      removePhoto(id) {
        const { photos, activePhotoId, stash } = get();
        const meta = photos.find((p) => p.id === id);
        if (meta) URL.revokeObjectURL(meta.thumbUrl);
        const rest = photos.filter((p) => p.id !== id);
        const nextStash = { ...stash };
        delete nextStash[id];
        set({ photos: rest, stash: nextStash });
        if (activePhotoId === id) {
          const next = rest[0]?.id ?? null;
          if (next) {
            set({ activePhotoId: null });
            get().setActivePhoto(next);
          } else set({ activePhotoId: null, edit: defaultEditState(), history: emptyHistory() });
        }
      },

      renamePhotoMeta(id, name) {
        set({ photos: get().photos.map((p) => (p.id === id ? { ...p, name } : p)) });
      },

      setPhotoThumb(id, url) {
        set({
          photos: get().photos.map((p) => {
            if (p.id !== id) return p;
            if (p.thumbUrl !== url) URL.revokeObjectURL(p.thumbUrl);
            return { ...p, thumbUrl: url };
          }),
        });
      },

      setActivePhoto(id) {
        const { activePhotoId, edit, history, stash } = get();
        if (id === activePhotoId) return;
        const nextStash = { ...stash };
        if (activePhotoId) nextStash[activePhotoId] = { edit, history };
        const target = nextStash[id] ?? { edit: defaultEditState(), history: emptyHistory() };
        set({
          stash: nextStash,
          activePhotoId: id,
          edit: target.edit,
          history: target.history,
          gesture: null,
          tool: 'none',
          activeLayerId: null,
          liveStroke: null,
          zoom: 'fit',
        });
      },

      setProjectName(name) {
        set({ projectName: name, saveState: 'unsaved' });
      },

      beginGesture(label) {
        if (get().gesture) return;
        set({ gesture: { before: get().edit, label } });
      },

      endGesture() {
        const { gesture, edit, history } = get();
        if (!gesture) return;
        if (gesture.before !== edit) {
          set({ gesture: null, history: record(history, gesture.before, gesture.label, Date.now(), undefined, 0) });
        } else set({ gesture: null });
      },

      setAdjustment(path, value, label) {
        change(label ?? path, (e) => {
          const current = getPath(e.adjustments, path);
          if (JSON.stringify(current) === JSON.stringify(value)) return e;
          return withOverride({ ...e, adjustments: setPath(e.adjustments, path, value) }, path);
        });
      },

      resetAdjustment(path) {
        const def = getPath(defaultAdjustments(), path);
        const range = rangeForPath(path);
        get().setAdjustment(path, structuredClone(def ?? range?.default ?? 0), `Reset ${path}`);
      },

      resetAll() {
        change('Reset all', (e) => ({
          ...e,
          adjustments: defaultAdjustments(),
          appliedPreset: null,
          layers: [],
          retouch: { ...e.retouch, skinSmoothing: 0, eyeEnhance: 0, teethWhitening: 0, faceLight: 0, underEye: 0, spots: [] },
          lut: null,
        }));
      },

      commitEdit(label, updater) {
        change(label, updater);
      },

      undo() {
        const { history, edit, gesture } = get();
        if (gesture) return;
        const r = undoH(history, edit);
        if (r) set({ history: r.history, edit: r.state, saveState: 'unsaved' });
      },

      redo() {
        const { history, edit, gesture } = get();
        if (gesture) return;
        const r = redoH(history, edit);
        if (r) set({ history: r.history, edit: r.state, saveState: 'unsaved' });
      },

      applyPreset(preset, amount = 100) {
        change(`Apply ${preset.name}`, (e) => {
          // Re-applying over a live preset starts from that preset's baseline.
          const baseline = e.appliedPreset ? e.appliedPreset.baseline : e.adjustments;
          const values = preset.adjustments as PartialAdjustments;
          return {
            ...e,
            adjustments: blendPreset(baseline, values, amount),
            appliedPreset: { id: preset.id, name: preset.name, amount, baseline, values, overrides: [] },
          };
        });
      },

      setPresetAmount(amount) {
        change('Preset amount', (e) => {
          const ap = e.appliedPreset;
          if (!ap) return e;
          return {
            ...e,
            adjustments: blendPreset(ap.baseline, ap.values, amount, e.adjustments, ap.overrides),
            appliedPreset: { ...ap, amount },
          };
        });
      },

      clearAppliedPreset() {
        change('Remove preset', (e) => (e.appliedPreset ? { ...e, adjustments: e.appliedPreset.baseline, appliedPreset: null } : e));
      },

      toggleAdjustmentsVisible() {
        change('Toggle adjustments', (e) => ({ ...e, adjustmentsVisible: !e.adjustmentsVisible }));
      },

      copyAdjustments() {
        const meta = get().photos.find((p) => p.id === get().activePhotoId);
        set({ clipboard: { adjustments: structuredClone(get().edit.adjustments), sourceName: meta?.name ?? 'photo' } });
        get().showToast('Settings copied. Paste them onto another photo.', 'success');
      },

      pasteAdjustments(groups) {
        const clip = get().clipboard;
        if (!clip || groups.length === 0) return;
        const partial: PartialAdjustments = {};
        for (const g of groups) (partial as Record<string, unknown>)[g] = structuredClone(clip.adjustments[g]);
        change('Paste settings', (e) => ({ ...e, adjustments: mergeAdjustments(e.adjustments, partial), appliedPreset: null }));
      },

      setGeometry(patch, label = 'Crop & rotate') {
        change(label, (e) => ({ ...e, geometry: { ...e.geometry, ...patch } }));
      },

      addLayer(name, components = [], adjustments = {}) {
        const id = newId('l_');
        updateLayers('Add mask', (layers) => [
          ...layers,
          {
            id,
            name,
            visible: true,
            opacity: 100,
            invert: false,
            components,
            adjustments: { ...defaultLocalAdjustments(), ...adjustments },
          },
        ]);
        set({ activeLayerId: id, rightTab: 'masks' });
        return id;
      },

      updateLayer(id, patch, label = 'Edit mask') {
        updateLayers(label, (layers) => layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      },

      setLayerAdjustment(id, key, value) {
        updateLayers(`Mask ${key}`, (layers) =>
          layers.map((l) => (l.id === id ? { ...l, adjustments: { ...l.adjustments, [key]: value } } : l)),
        );
      },

      addMaskComponent(layerId, component) {
        updateLayers(component.type === 'brush' ? 'Brush stroke' : 'Add mask shape', (layers) =>
          layers.map((l) => (l.id === layerId ? { ...l, components: [...l.components, component] } : l)),
        );
      },

      removeMaskComponent(layerId, componentId) {
        updateLayers('Remove mask shape', (layers) =>
          layers.map((l) => (l.id === layerId ? { ...l, components: l.components.filter((c) => c.id !== componentId) } : l)),
        );
      },

      updateMaskComponent(layerId, component) {
        updateLayers('Edit mask shape', (layers) =>
          layers.map((l) =>
            l.id === layerId ? { ...l, components: l.components.map((c) => (c.id === component.id ? component : c)) } : l,
          ),
        );
      },

      removeLayer(id) {
        updateLayers('Delete mask', (layers) => layers.filter((l) => l.id !== id));
        if (get().activeLayerId === id) set({ activeLayerId: null, tool: 'none' });
      },

      moveLayer(id, delta) {
        updateLayers('Reorder masks', (layers) => {
          const i = layers.findIndex((l) => l.id === id);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= layers.length) return layers;
          const next = [...layers];
          [next[i], next[j]] = [next[j], next[i]];
          return next;
        });
      },

      duplicateLayer(id) {
        const layer = get().edit.layers.find((l) => l.id === id);
        if (!layer) return;
        const copy: MaskLayer = { ...structuredClone(layer), id: newId('l_'), name: `${layer.name} copy` };
        updateLayers('Duplicate mask', (layers) => [...layers, copy]);
        set({ activeLayerId: copy.id });
      },

      setActiveLayer(id) {
        set({ activeLayerId: id });
      },

      setLiveStroke(c) {
        set({ liveStroke: c });
      },

      setRetouch(key, value) {
        change(`Retouch ${key}`, (e) => ({ ...e, retouch: { ...e.retouch, [key]: value } }));
      },

      addSpot(spot) {
        change('Heal spot', (e) => ({ ...e, retouch: { ...e.retouch, spots: [...e.retouch.spots, { ...spot, id: newId('s_') }].slice(-64) } }));
      },

      removeSpot(id) {
        change('Remove spot', (e) => ({ ...e, retouch: { ...e.retouch, spots: e.retouch.spots.filter((s) => s.id !== id) } }));
      },

      clearSpots() {
        change('Clear spots', (e) => ({ ...e, retouch: { ...e.retouch, spots: [] } }));
      },

      setUi(patch) {
        set(patch);
      },

      setBrush(patch) {
        set({ brush: { ...get().brush, ...patch } });
      },

      markSaved(at) {
        set({ saveState: 'saved', lastSavedAt: at });
      },

      setSaveState(s) {
        set({ saveState: s });
      },

      showToast(message, tone = 'info') {
        set({ toast: { id: ++toastSeq, message, tone } });
      },

      dismissToast() {
        set({ toast: null });
      },
    };
  }),
);

/** Effective adjustments including the global visibility toggle. */
export function effectiveAdjustments(e: EditState): Adjustments {
  return e.adjustmentsVisible ? e.adjustments : defaultAdjustments();
}
