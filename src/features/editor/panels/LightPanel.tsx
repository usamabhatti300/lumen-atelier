import { Section } from '@/components/ui/Section';
import { AdjustmentSlider, TRACKS, fmtEv } from '../AdjustmentSlider';
import { useEditor } from '@/state/editorStore';
import { defaultAdjustments, type Adjustments } from '@/lib/schema/adjustments';

function useSectionModified(section: keyof Adjustments, keys?: string[]) {
  return useEditor((s) => {
    const cur = s.edit.adjustments[section] as unknown as Record<string, unknown>;
    const def = defaultAdjustments()[section] as unknown as Record<string, unknown>;
    return (keys ?? Object.keys(def)).some((k) => JSON.stringify(cur[k]) !== JSON.stringify(def[k]));
  });
}

function useResetKeys(section: keyof Adjustments, keys: string[]) {
  const commit = useEditor((s) => s.commitEdit);
  return () =>
    commit('Reset section', (e) => {
      const def = defaultAdjustments()[section] as unknown as Record<string, unknown>;
      const next = { ...(e.adjustments[section] as unknown as Record<string, unknown>) };
      for (const k of keys) next[k] = structuredClone(def[k]);
      return { ...e, adjustments: { ...e.adjustments, [section]: next } };
    });
}

const WB = ['temperature', 'tint'];
const TONE = ['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'];
const COLOR = ['vibrance', 'saturation', 'monochrome'];

export function LightPanel() {
  const wbMod = useSectionModified('basic', WB);
  const toneMod = useSectionModified('basic', TONE);
  const colorMod = useSectionModified('basic', COLOR);
  const presenceMod = useSectionModified('presence');
  const resetWb = useResetKeys('basic', WB);
  const resetTone = useResetKeys('basic', TONE);
  const resetColor = useResetKeys('basic', COLOR);
  const resetPresence = useResetKeys('presence', ['texture', 'clarity', 'dehaze']);
  const mono = useEditor((s) => s.edit.adjustments.basic.monochrome >= 100);
  const setAdj = useEditor((s) => s.setAdjustment);

  return (
    <>
      <Section title="White balance" modified={wbMod} onReset={resetWb}>
        <AdjustmentSlider path="basic.temperature" label="Temperature" track={TRACKS.temperature} />
        <AdjustmentSlider path="basic.tint" label="Tint" track={TRACKS.tint} />
      </Section>
      <Section title="Tone" modified={toneMod} onReset={resetTone}>
        <AdjustmentSlider path="basic.exposure" label="Exposure" format={fmtEv} />
        <AdjustmentSlider path="basic.brightness" label="Brightness" />
        <AdjustmentSlider path="basic.contrast" label="Contrast" />
        <div className="my-1.5 h-px bg-line-soft" />
        <AdjustmentSlider path="basic.highlights" label="Highlights" />
        <AdjustmentSlider path="basic.shadows" label="Shadows" />
        <AdjustmentSlider path="basic.whites" label="Whites" />
        <AdjustmentSlider path="basic.blacks" label="Blacks" />
      </Section>
      <Section title="Presence" modified={presenceMod} onReset={resetPresence}>
        <AdjustmentSlider path="presence.texture" label="Texture" />
        <AdjustmentSlider path="presence.clarity" label="Clarity" />
        <AdjustmentSlider path="presence.dehaze" label="Dehaze" />
      </Section>
      <Section
        title="Colour"
        modified={colorMod}
        onReset={resetColor}
        aside={
          <button
            type="button"
            onClick={() => setAdj('basic.monochrome', mono ? 0 : 100, 'Black & white')}
            aria-pressed={mono}
            className={`mr-1 rounded-xs px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
              mono ? 'bg-ivory text-ink-950' : 'text-faint hover:text-ivory'
            }`}
          >
            B&amp;W
          </button>
        }
      >
        <AdjustmentSlider path="basic.vibrance" label="Vibrance" />
        <AdjustmentSlider path="basic.saturation" label="Saturation" track={TRACKS.saturation} />
        <AdjustmentSlider path="basic.monochrome" label="Monochrome" />
      </Section>
    </>
  );
}

export { useSectionModified, useResetKeys };
