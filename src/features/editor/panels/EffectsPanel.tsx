import { Section } from '@/components/ui/Section';
import { AdjustmentSlider } from '../AdjustmentSlider';
import { useResetKeys, useSectionModified } from './LightPanel';

/** Photo effects (roadmap 2.5). Each is one strength; at 0 the photo is untouched. */
const LIGHT = ['lightLeak', 'flare', 'bloom', 'halation', 'flash'];
const LENS = ['dreamy', 'fringe', 'dust'];

export function EffectsPanel() {
  const lightMod = useSectionModified('effects', LIGHT);
  const lensMod = useSectionModified('effects', LENS);
  const resetLight = useResetKeys('effects', LIGHT);
  const resetLens = useResetKeys('effects', LENS);
  return (
    <>
      <Section title="Light" modified={lightMod} onReset={resetLight}>
        <AdjustmentSlider path="effects.lightLeak" label="Light leak" />
        <AdjustmentSlider path="effects.flare" label="Lens flare" />
        <AdjustmentSlider path="effects.bloom" label="Bloom" />
        <AdjustmentSlider path="effects.halation" label="Halation" />
        <AdjustmentSlider path="effects.flash" label="Flash" />
      </Section>
      <Section title="Lens & film" modified={lensMod} onReset={resetLens}>
        <AdjustmentSlider path="effects.dreamy" label="Dreamy blur" />
        <AdjustmentSlider path="effects.fringe" label="Colour fringe" />
        <AdjustmentSlider path="effects.dust" label="Dust & scratches" />
      </Section>
    </>
  );
}
