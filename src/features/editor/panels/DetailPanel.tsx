import { Section } from '@/components/ui/Section';
import { AdjustmentSlider } from '../AdjustmentSlider';
import { useResetKeys, useSectionModified } from './LightPanel';
import { useEngine } from '@/engine/engineStore';
import { LensBlurSection } from './LensBlurSection';

const VIGNETTE_GRAIN = ['vignette', 'vignetteMidpoint', 'vignetteRoundness', 'vignetteFeather', 'grain', 'grainSize', 'grainRoughness'];

export function DetailPanel() {
  const detailMod = useSectionModified('detail');
  const effectsMod = useSectionModified('effects', VIGNETTE_GRAIN);
  const resetDetail = useResetKeys('detail', ['sharpening', 'sharpenMasking', 'noiseReduction', 'colorNoiseReduction']);
  const resetEffects = useResetKeys('effects', VIGNETTE_GRAIN);
  const preview = useEngine((s) => s.previewSize);
  const full = useEngine((s) => s.fullSize);
  const downscaled = preview && full && preview.width < full.width;
  return (
    <>
      <LensBlurSection />
      <Section title="Sharpening" modified={detailMod} onReset={resetDetail}>
        <AdjustmentSlider path="detail.sharpening" label="Amount" />
        <AdjustmentSlider path="detail.sharpenMasking" label="Edge masking" />
        <div className="my-1.5 h-px bg-line-soft" />
        <AdjustmentSlider path="detail.noiseReduction" label="Noise reduction" />
        <AdjustmentSlider path="detail.colorNoiseReduction" label="Colour noise" />
        {downscaled && (
          <p className="mt-2 text-[11px] leading-relaxed text-fg-4">
            The preview is downscaled ({preview.width}px wide), so fine detail is approximate. Export renders detail at
            full resolution.
          </p>
        )}
      </Section>
      <Section title="Vignette & grain" modified={effectsMod} onReset={resetEffects}>
        <AdjustmentSlider path="effects.vignette" label="Vignette" />
        <AdjustmentSlider path="effects.vignetteMidpoint" label="Midpoint" />
        <AdjustmentSlider path="effects.vignetteRoundness" label="Roundness" />
        <AdjustmentSlider path="effects.vignetteFeather" label="Feather" />
        <div className="my-1.5 h-px bg-line-soft" />
        <AdjustmentSlider path="effects.grain" label="Grain" />
        <AdjustmentSlider path="effects.grainSize" label="Size" />
        <AdjustmentSlider path="effects.grainRoughness" label="Roughness" />
      </Section>
    </>
  );
}
