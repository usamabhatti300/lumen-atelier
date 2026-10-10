/** App settings, persisted to IndexedDB (settings store). */
import { create } from 'zustand';
import { getSetting, setSetting } from '@/lib/storage/db';

export type PreviewQuality = 'performance' | 'balanced' | 'high';

export const PREVIEW_SIZES: Record<PreviewQuality, number> = {
  performance: 1280,
  balanced: 2048,
  high: 3072,
};

export interface Settings {
  previewQuality: PreviewQuality;
  /** Use the CPU renderer even if WebGL2 is available (diagnostics). */
  forceCpu: boolean;
  /** The user agreed that reference images may be sent to the configured AI provider. */
  aiConsent: boolean;
  motion: 'system' | 'reduced' | 'full';
  exportFormat: 'image/jpeg' | 'image/png' | 'image/webp';
  exportQuality: number;
  lastProjectId: string | null;
}

const DEFAULTS: Settings = {
  previewQuality: typeof window !== 'undefined' && window.innerWidth < 900 ? 'performance' : 'balanced',
  forceCpu: false,
  aiConsent: false,
  motion: 'system',
  exportFormat: 'image/jpeg',
  exportQuality: 92,
  lastProjectId: null,
};

interface SettingsState extends Settings {
  loaded: boolean;
  load(): Promise<void>;
  update(patch: Partial<Settings>): void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  async load() {
    try {
      const stored = await getSetting<Partial<Settings>>('app');
      set({ ...DEFAULTS, ...(stored ?? {}), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update(patch) {
    set(patch);
    const { loaded: _l, load: _a, update: _b, ...values } = { ...get(), ...patch };
    void setSetting('app', values).catch(() => undefined);
  },
}));
