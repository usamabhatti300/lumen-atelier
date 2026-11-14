import { useEffect, useState } from 'react';
import { Section } from '@/components/ui/Section';
import { presetThumb, previewSourceId, thumbSourceListeners } from '@/engine/presetThumbs';
import { useEditor } from '@/state/editorStore';
import type { Adjustments, PartialAdjustments } from '@/lib/schema/adjustments';
import { AdjustmentSlider } from '../AdjustmentSlider';
import { useResetKeys, useSectionModified } from './LightPanel';

type EffectKey = keyof Pick<
  Adjustments['effects'],
  'lightLeak' | 'flare' | 'bloom' | 'halation' | 'flash' | 'dreamy' | 'fringe' | 'dust' | 'motionBlur' | 'shutterDrag' | 'softFocus'
>;

/**
 * Photo effects. Each is one strength; at 0 the photo is untouched.
 * `tap` is the strength a tile sets with one tap, and the strength its preview shows.
 */
const EFFECTS: { key: EffectKey; label: string; tap: number; group: 'light' | 'blur' | 'lens' }[] = [
  { key: 'flash', label: 'Flash', tap: 45, group: 'light' },
  { key: 'bloom', label: 'Bloom', tap: 50, group: 'light' },
  { key: 'halation', label: 'Halation', tap: 60, group: 'light' },
  { key: 'lightLeak', label: 'Light leak', tap: 45, group: 'light' },
  { key: 'flare', label: 'Lens flare', tap: 50, group: 'light' },
  { key: 'motionBlur', label: 'Motion blur', tap: 45, group: 'blur' },
  { key: 'shutterDrag', label: 'Shutter drag', tap: 50, group: 'blur' },
  { key: 'softFocus', label: 'Soft focus', tap: 50, group: 'blur' },
  { key: 'dreamy', label: 'Dreamy blur', tap: 50, group: 'blur' },
  { key: 'fringe', label: 'Colour fringe', tap: 60, group: 'lens' },
  { key: 'dust', label: 'Dust & scratches', tap: 55, group: 'lens' },
];
const keysOf = (group: string) => EFFECTS.filter((e) => e.group === group).map((e) => e.key as string);
const LIGHT = keysOf('light');
const BLUR = keysOf('blur');
const LENS = keysOf('lens');

export function EffectsPanel() {
  const lightMod = useSectionModified('effects', LIGHT);
  const blurMod = useSectionModified('effects', BLUR);
  const lensMod = useSectionModified('effects', LENS);
  const resetLight = useResetKeys('effects', LIGHT);
  const resetBlur = useResetKeys('effects', BLUR);
  const resetLens = useResetKeys('effects', LENS);
  return (
    <>
      {/* One tap adds an effect at a good strength (its tile shows what it does to this photo); tap
          it again to take it off. The sliders below set the exact strength. */}
      <ul className="grid grid-cols-3 gap-2 border-b border-line-soft px-4 pt-3 pb-4 sm:grid-cols-4 lg:grid-cols-3" aria-label="Effects">
        {EFFECTS.map((e) => (
          <EffectTile key={e.key} effect={e} />
        ))}
      </ul>
      <Section title="Light" modified={lightMod} onReset={resetLight}>
        <AdjustmentSlider path="effects.flash" label="Flash" />
        <AdjustmentSlider path="effects.bloom" label="Bloom" />
        <AdjustmentSlider path="effects.halation" label="Halation" />
        <AdjustmentSlider path="effects.lightLeak" label="Light leak" />
        <AdjustmentSlider path="effects.flare" label="Lens flare" />
      </Section>
      <Section title="Blur" modified={blurMod} onReset={resetBlur}>
        <AdjustmentSlider path="effects.motionBlur" label="Motion blur" />
        <AdjustmentSlider path="effects.shutterDrag" label="Shutter drag" />
        <AdjustmentSlider path="effects.softFocus" label="Soft focus" />
        <AdjustmentSlider path="effects.dreamy" label="Dreamy blur" />
      </Section>
      <Section title="Lens & film" modified={lensMod} onReset={resetLens}>
        <AdjustmentSlider path="effects.fringe" label="Colour fringe" />
        <AdjustmentSlider path="effects.dust" label="Dust & scratches" />
      </Section>
    </>
  );
}

function EffectTile({ effect }: { effect: (typeof EFFECTS)[number] }) {
  const value = useEditor((s) => s.edit.adjustments.effects[effect.key] ?? 0);
  const setAdj = useEditor((s) => s.setAdjustment);
  const hasPhoto = useEditor((s) => !!s.activePhotoId);
  const on = value > 0;

  // The preview: this effect alone, at its one-tap strength, on the open photo.
  const [sourceId, setSourceId] = useState(previewSourceId());
  useEffect(() => {
    const fn = (id: string) => setSourceId(id);
    thumbSourceListeners.add(fn);
    return () => void thumbSourceListeners.delete(fn);
  }, []);
  const [thumb, setThumb] = useState<{ key: string; url: string } | null>(null);
  const thumbKey = `${sourceId}:${effect.key}`;
  useEffect(() => {
    const ctrl = new AbortController();
    const adjustments = { effects: { [effect.key]: effect.tap } } as PartialAdjustments;
    presetThumb(`fx:${effect.key}:${effect.tap}`, adjustments, ctrl.signal).then(
      (url) => !ctrl.signal.aborted && setThumb({ key: thumbKey, url }),
      () => undefined,
    );
    return () => ctrl.abort();
  }, [effect.key, effect.tap, thumbKey]);
  const url = thumb?.key === thumbKey ? thumb.url : null;

  return (
    <li>
      <button
        type="button"
        disabled={!hasPhoto}
        aria-pressed={on}
        aria-label={on ? `Remove ${effect.label}` : `Add ${effect.label}`}
        data-testid={`effect-${effect.key}`}
        onClick={() => setAdj(`effects.${effect.key}`, on ? 0 : effect.tap, on ? `Remove ${effect.label}` : effect.label)}
        className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-md bg-raised-2 text-left transition-[transform,box-shadow] duration-200 enabled:active:scale-[0.96] disabled:opacity-50 ${
          on ? 'shadow-selected' : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]'
        }`}
      >
        {url ? <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" /> : <span className="skeleton absolute inset-0" />}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 px-1.5 pb-1.5">
          <span className="text-[12px] leading-[1.1] font-semibold tracking-[-0.01em] text-white">{effect.label}</span>
          {on && <span className="font-mono text-[11px] text-accent-fg">{Math.round(value)}</span>}
        </span>
      </button>
    </li>
  );
}
