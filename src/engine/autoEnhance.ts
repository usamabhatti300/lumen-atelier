/**
 * Auto (Light), engine side: measures the open photo and sets the Light sliders in one undo step
 * (lib/analysis/autoEnhance.ts holds the rules). Returns what happened, for the toast.
 */
import { autoEnhance, type AutoKey } from '@/lib/analysis/autoEnhance';
import { useEditor } from '@/state/editorStore';
import { photoSample } from './lookAdapt';

export type AutoResult = { status: 'changed'; summary: string } | { status: 'balanced' | 'unavailable' };

const WORDS: Record<AutoKey, string> = {
  exposure: 'exposure',
  contrast: 'contrast',
  highlights: 'highlights',
  shadows: 'shadows',
  blacks: 'blacks',
  temperature: 'temperature',
  tint: 'tint',
  vibrance: 'vibrance',
};

export function runAutoEnhance(): AutoResult {
  const lin = photoSample();
  if (!lin) return { status: 'unavailable' };
  const st = useEditor.getState();
  // A look's colour is intended: on top of one, Auto sets tone only.
  const values = autoEnhance(lin, st.edit.adjustments, !st.edit.appliedPreset);
  const keys = Object.keys(values) as AutoKey[];
  if (keys.length === 0) return { status: 'balanced' };
  const before = st.edit.adjustments.basic;
  st.setAdjustments(Object.fromEntries(keys.map((k) => [`basic.${k}`, values[k]])), 'Auto');
  // "exposure +0.08 · shadows +18 · vibrance +16": the change, not the new value.
  const summary = keys
    .map((k) => {
      const d = (values[k] ?? 0) - before[k];
      const n = k === 'exposure' ? Math.abs(d).toFixed(2) : String(Math.abs(Math.round(d)));
      return `${WORDS[k]} ${d < 0 ? '−' : '+'}${n}`;
    })
    .join(' · ');
  return { status: 'changed', summary };
}
