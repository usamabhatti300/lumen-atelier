/**
 * Phones: "one slider at a time" for Light and Colour (the Halide / Lightroom mobile pattern).
 * A sideways row of tools picks what the single large slider controls, so the sheet stays short
 * and the photo stays big. Every control is still in the full panel (`onExpand`).
 */
import { motion } from 'motion/react';
import { ChevronsUp } from 'lucide-react';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/misc';
import { useEditor } from '@/state/editorStore';
import { getPath, HSL_BANDS, HSL_BAND_HUES, rangeForPath, type CurveChannel, type GradeZone, type HslBandName as HslBand } from '@/lib/schema/adjustments';
import { CurveEditor } from '../CurveEditor';
import { AdjustmentSlider, TRACKS, fmtEv } from '../AdjustmentSlider';
import { BAND_LABEL, bandColor, hslTrack } from './colorBands';
import { WheelControl } from './ColorPanel';

interface Tool {
  path: string;
  label: string;
  track?: string;
  format?: (v: number) => string;
}

/** Order follows how people edit: light first, then white balance and colour, then effects. */
const LIGHT_TOOLS: Tool[] = [
  { path: 'basic.exposure', label: 'Exposure', format: fmtEv },
  { path: 'basic.contrast', label: 'Contrast' },
  { path: 'basic.highlights', label: 'Highlights' },
  { path: 'basic.shadows', label: 'Shadows' },
  { path: 'basic.whites', label: 'Whites' },
  { path: 'basic.blacks', label: 'Blacks' },
  { path: 'basic.brightness', label: 'Brightness' },
  { path: 'basic.temperature', label: 'Temperature', track: TRACKS.temperature },
  { path: 'basic.tint', label: 'Tint', track: TRACKS.tint },
  { path: 'basic.vibrance', label: 'Vibrance' },
  { path: 'basic.saturation', label: 'Saturation', track: TRACKS.saturation },
  { path: 'presence.texture', label: 'Texture' },
  { path: 'presence.clarity', label: 'Clarity' },
  { path: 'presence.dehaze', label: 'Dehaze' },
  { path: 'basic.monochrome', label: 'Monochrome' },
];

// Remember the last tool while the app is open, like the phone editors do.
const last = { light: LIGHT_TOOLS[0].path, colorMode: 'mix' as ColorMode, band: 'orange' as HslBand, hsl: 'saturation' as HslMode, zone: 'midtones' as GradeZone, curve: 'master' as CurveChannel };

const remember = (patch: Partial<typeof last>) => Object.assign(last, patch);

type ColorMode = 'mix' | 'grade' | 'curve';
type HslMode = 'hue' | 'saturation' | 'luminance';

export function FocusTools({ tab, onExpand }: { tab: 'adjust' | 'color'; onExpand: () => void }) {
  return (
    <div className="px-3 pb-3" data-testid="focus-tools">
      {tab === 'adjust' ? <LightFocus onExpand={onExpand} /> : <ColorFocus onExpand={onExpand} />}
    </div>
  );
}

function LightFocus({ onExpand }: { onExpand: () => void }) {
  const [path, setPath] = useState(last.light);
  const tool = LIGHT_TOOLS.find((t) => t.path === path) ?? LIGHT_TOOLS[0];
  const pick = (p: string) => {
    remember({ light: p });
    setPath(p);
  };
  return (
    <>
      <ToolRow label="Light tools" onExpand={onExpand}>
        {LIGHT_TOOLS.map((t) => (
          <ToolChip key={t.path} path={t.path} label={t.label} selected={t.path === path} onSelect={() => pick(t.path)} />
        ))}
      </ToolRow>
      <motion.div key={tool.path} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <AdjustmentSlider size="lg" path={tool.path} label={tool.label} track={tool.track} format={tool.format} />
      </motion.div>
    </>
  );
}

function ColorFocus({ onExpand }: { onExpand: () => void }) {
  const [mode, setMode] = useState<ColorMode>(last.colorMode);
  const [band, setBand] = useState<HslBand>(last.band);
  const [hsl, setHsl] = useState<HslMode>(last.hsl);
  const [zone, setZone] = useState<GradeZone>(last.zone);
  const [curve, setCurve] = useState<CurveChannel>(last.curve);
  const pickMode = (m: ColorMode) => {
    remember({ colorMode: m });
    setMode(m);
  };
  return (
    <>
      <ToolRow label="Colour tools" onExpand={onExpand}>
        <ModeChip selected={mode === 'mix'} onSelect={() => pickMode('mix')}>
          Mix
        </ModeChip>
        <ModeChip selected={mode === 'grade'} onSelect={() => pickMode('grade')}>
          Grade
        </ModeChip>
        <ModeChip selected={mode === 'curve'} onSelect={() => pickMode('curve')}>
          Curve
        </ModeChip>
      </ToolRow>

      {mode === 'curve' ? (
        // A compact curve that leaves the photo in view (the full panel has the larger one).
        <>
          <div className="mt-1 mb-2 flex justify-center">
            <Segmented
              label="Curve channel"
              size="xs"
              value={curve}
              onChange={(v) => {
                remember({ curve: v });
                setCurve(v);
              }}
              options={[
                { value: 'master', label: 'RGB' },
                { value: 'red', label: 'Red' },
                { value: 'green', label: 'Green' },
                { value: 'blue', label: 'Blue' },
              ]}
            />
          </div>
          <div className="mx-auto w-full max-w-[min(180px,22dvh)] [&_p]:hidden">
            <CurveEditor channel={curve} />
          </div>
        </>
      ) : mode === 'mix' ? (
        <>
          <div className="mt-1 flex items-center justify-between gap-1" role="radiogroup" aria-label="Colour band">
            {HSL_BANDS.map((b) => (
              <BandSwatch
                key={b}
                band={b}
                selected={b === band}
                onSelect={() => {
                  remember({ band: b });
                  setBand(b);
                }}
              />
            ))}
          </div>
          <div className="mt-3 flex justify-center">
            <Segmented
              label="HSL mode"
              size="xs"
              value={hsl}
              onChange={(v) => {
                remember({ hsl: v });
                setHsl(v);
              }}
              options={[
                { value: 'hue', label: 'Hue' },
                { value: 'saturation', label: 'Saturation' },
                { value: 'luminance', label: 'Luminance' },
              ]}
            />
          </div>
          <AdjustmentSlider
            key={`${band}-${hsl}`}
            size="lg"
            path={`hsl.${band}.${hsl}`}
            label={`${BAND_LABEL[band]} ${hsl}`}
            track={hslTrack(band, hsl)}
          />
        </>
      ) : (
        <>
          <div className="mt-1 mb-2 flex justify-center">
            <Segmented
              label="Grading zone"
              size="xs"
              value={zone}
              onChange={(v) => {
                remember({ zone: v });
                setZone(v);
              }}
              options={[
                { value: 'shadows', label: 'Shadows' },
                { value: 'midtones', label: 'Mids' },
                { value: 'highlights', label: 'Highs' },
                { value: 'global', label: 'Global' },
              ]}
            />
          </div>
          <div className="mx-auto max-w-[260px]">
            <WheelControl key={zone} zone={zone} size={128} />
          </div>
        </>
      )}
    </>
  );
}

const CHIP =
  'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,transform] duration-200 active:scale-95';

/** The sideways tool row, ending with "All" (the full panel). Keeps the selected tool in view. */
function ToolRow({ label, onExpand, children }: { label: string; onExpand: () => void; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const box = row.current;
    if (el && box) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
  }, []);
  return (
    <div ref={row} role="tablist" aria-label={label} className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto overscroll-x-contain px-3 pt-0.5 pb-2">
      {children}
      <button type="button" onClick={onExpand} className={`${CHIP} border border-line text-fg-3`}>
        <ChevronsUp size={14} /> All
      </button>
    </div>
  );
}

function ModeChip({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`${CHIP} ${selected ? 'bg-fg text-ground' : 'bg-control text-fg-2'}`}
    >
      {children}
    </button>
  );
}

/** A tool chip; a dot marks tools that differ from their default, so edits are easy to find again. */
const ToolChip = memo(function ToolChip({ path, label, selected, onSelect }: { path: string; label: string; selected: boolean; onSelect: () => void }) {
  const changed = useEditor((s) => {
    const r = rangeForPath(path);
    const v = getPath(s.edit.adjustments, path) as number;
    return !!r && Math.abs(v - r.default) > r.step / 2;
  });
  return (
    <ModeChip selected={selected} onSelect={onSelect}>
      {label}
      {changed && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-on-accent' : 'bg-accent shadow-offset-sm'}`} />}
      {changed && <span className="sr-only">(edited)</span>}
    </ModeChip>
  );
});

function BandSwatch({ band, selected, onSelect }: { band: HslBand; selected: boolean; onSelect: () => void }) {
  const changed = useEditor((s) => {
    const v = s.edit.adjustments.hsl[band];
    return v.hue !== 0 || v.saturation !== 0 || v.luminance !== 0;
  });
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={BAND_LABEL[band]}
      onClick={onSelect}
      className="relative flex h-10 w-10 items-center justify-center"
    >
      <span
        className={`h-7 w-7 rounded-full transition-[box-shadow,transform] ${selected ? 'scale-110 ring-2 ring-fg ring-offset-2 ring-offset-raised' : ''}`}
        style={{ background: bandColor(HSL_BAND_HUES[band]) }}
      />
      {changed && <span aria-hidden className="absolute right-0.5 bottom-0.5 h-1.5 w-1.5 rounded-full bg-accent" />}
    </button>
  );
}
