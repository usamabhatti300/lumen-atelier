import { useCallback, useState } from 'react';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/misc';
import { Slider } from '@/components/ui/Slider';
import { AdjustmentSlider } from '../AdjustmentSlider';
import { ColorWheel } from '../ColorWheel';
import { CurveEditor } from '../CurveEditor';
import { useResetKeys, useSectionModified } from './LightPanel';
import { LookInterop } from './LookInterop';
import { useEditor } from '@/state/editorStore';
import { HSL_BANDS, RANGES, type CurveChannel, type GradeZone } from '@/lib/schema/adjustments';
import { BAND_LABEL, hslTrack } from './colorBands';

export function ColorPanel() {
  const [hslMode, setHslMode] = useState<'hue' | 'saturation' | 'luminance'>('saturation');
  const [curve, setCurve] = useState<CurveChannel>('master');
  const hslMod = useSectionModified('hsl');
  const gradeMod = useSectionModified('grading');
  const curvesMod = useSectionModified('curves');
  const mixerMod = useSectionModified('mixer');
  const levelsMod = useSectionModified('levels');
  const resetHsl = useResetKeys('hsl', [...HSL_BANDS]);
  const resetGrade = useResetKeys('grading', ['shadows', 'midtones', 'highlights', 'global', 'blending', 'balance']);
  const resetCurves = useResetKeys('curves', ['master', 'red', 'green', 'blue']);
  const resetMixer = useResetKeys('mixer', ['red', 'green', 'blue']);
  const resetLevels = useResetKeys('levels', ['inBlack', 'inWhite', 'gamma', 'outBlack', 'outWhite']);

  return (
    <>
      <Section title="Tone curve" modified={curvesMod} onReset={resetCurves}>
        <div className="mb-2">
          <Segmented
            label="Curve channel"
            size="xs"
            value={curve}
            onChange={setCurve}
            options={[
              { value: 'master', label: 'RGB' },
              { value: 'red', label: 'R' },
              { value: 'green', label: 'G' },
              { value: 'blue', label: 'B' },
            ]}
          />
        </div>
        <CurveEditor channel={curve} />
      </Section>

      <Section title="HSL" modified={hslMod} onReset={resetHsl}>
        <div className="mb-2">
          <Segmented
            label="HSL mode"
            size="xs"
            value={hslMode}
            onChange={setHslMode}
            options={[
              { value: 'hue', label: 'Hue' },
              { value: 'saturation', label: 'Saturation' },
              { value: 'luminance', label: 'Luminance' },
            ]}
          />
        </div>
        {HSL_BANDS.map((b) => (
          <AdjustmentSlider key={`${b}-${hslMode}`} path={`hsl.${b}.${hslMode}`} label={BAND_LABEL[b]} track={hslTrack(b, hslMode)} />
        ))}
      </Section>

      <Section title="Colour grading" modified={gradeMod} onReset={resetGrade}>
        <GradingWheels />
      </Section>

      <Section title="Channel mixer" modified={mixerMod} onReset={resetMixer} defaultOpen={false}>
        {(['red', 'green', 'blue'] as const).map((row) => (
          <div key={row} className="mb-2">
            <p className="mb-0.5 text-[11px] font-medium tracking-wide text-fg-2 uppercase">{row} output</p>
            <AdjustmentSlider path={`mixer.${row}.r`} label="Red" />
            <AdjustmentSlider path={`mixer.${row}.g`} label="Green" />
            <AdjustmentSlider path={`mixer.${row}.b`} label="Blue" />
          </div>
        ))}
      </Section>

      <Section title="Levels" modified={levelsMod} onReset={resetLevels} defaultOpen={false}>
        <AdjustmentSlider path="levels.inBlack" label="Input black" />
        <AdjustmentSlider path="levels.inWhite" label="Input white" />
        <AdjustmentSlider path="levels.gamma" label="Midtone gamma" />
        <AdjustmentSlider path="levels.outBlack" label="Output black" />
        <AdjustmentSlider path="levels.outWhite" label="Output white" />
      </Section>

      <Section title="LUT & export look" defaultOpen={false}>
        <LookInterop />
      </Section>
    </>
  );
}

function GradingWheels() {
  const [zone, setZone] = useState<GradeZone | 'three'>('three');
  return (
    <div>
      <div className="mb-3">
        <Segmented
          label="Grading view"
          size="xs"
          value={zone}
          onChange={setZone}
          options={[
            { value: 'three', label: '3-way' },
            { value: 'shadows', label: 'Shadows' },
            { value: 'midtones', label: 'Mids' },
            { value: 'highlights', label: 'Highs' },
            { value: 'global', label: 'Global' },
          ]}
        />
      </div>
      {zone === 'three' ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="col-span-2 flex justify-center">
            <WheelControl zone="midtones" size={104} />
          </div>
          <WheelControl zone="shadows" size={96} />
          <WheelControl zone="highlights" size={96} />
        </div>
      ) : (
        <div className="flex justify-center">
          <WheelControl zone={zone} size={168} />
        </div>
      )}
      <div className="mt-3">
        <AdjustmentSlider path="grading.blending" label="Blending" />
        <AdjustmentSlider path="grading.balance" label="Balance" />
      </div>
    </div>
  );
}

const ZONE_LABEL: Record<GradeZone, string> = { shadows: 'Shadows', midtones: 'Midtones', highlights: 'Highlights', global: 'Global' };

export function WheelControl({ zone, size }: { zone: GradeZone; size: number }) {
  const wheel = useEditor((s) => s.edit.adjustments.grading[zone]);
  const commit = useEditor((s) => s.commitEdit);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const setAdj = useEditor((s) => s.setAdjustment);
  const label = ZONE_LABEL[zone];
  const onChange = useCallback(
    (v: typeof wheel) =>
      commit(`${label} wheel`, (e) => ({
        ...e,
        adjustments: { ...e.adjustments, grading: { ...e.adjustments.grading, [zone]: v } },
        appliedPreset: e.appliedPreset && {
          ...e.appliedPreset,
          overrides: [...new Set([...e.appliedPreset.overrides, `grading.${zone}.hue`, `grading.${zone}.saturation`])],
        },
      })),
    [commit, zone, label],
  );
  return (
    <div className="flex flex-col items-center">
      <p className="mb-1.5 text-[11px] text-fg-3">
        {label}
        <span className="tabular ml-1.5 text-fg-4">
          {Math.round(wheel.hue)}° · {Math.round(wheel.saturation)}
        </span>
      </p>
      <ColorWheel value={wheel} onChange={onChange} onStart={() => begin(`${label} wheel`)} onEnd={end} size={size} label={label} />
      <div className="mt-1 w-full">
        <Slider
          label="Luminance"
          value={wheel.luminance}
          range={RANGES.grading.luminance}
          onChange={(v) => setAdj(`grading.${zone}.luminance`, v, `${label} luminance`)}
          onGestureStart={() => begin(`${label} luminance`)}
          onGestureEnd={end}
        />
      </div>
    </div>
  );
}
