/** RGB histogram with clipping readouts and a zone-system strip beneath. */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useEngine } from '@/engine/engineStore';
import { zoneGrey } from '@/components/ZoneScale';

type Mode = 'rgb' | 'luma';

/** `slim`: phones' short sheet. A 32 px graph without the zone strip and readouts. */
export const Histogram = memo(function Histogram({ slim = false }: { slim?: boolean }) {
  const hist = useEngine((s) => s.histogram);
  const out = useEngine((s) => s.outputSize);
  const [mode, setMode] = useState<Mode>('rgb');

  const paths = useMemo(() => {
    if (!hist) return null;
    const W = 256;
    const H = 72;
    // Scale to the 99th percentile bin so a few spikes don't flatten the graph.
    const all = [...hist.r, ...hist.g, ...hist.b, ...hist.l].slice().sort((a, b) => a - b);
    const max = Math.max(1, all[Math.floor(all.length * 0.995)]);
    const mk = (bins: Uint32Array) => {
      let d = `M0,${H}`;
      for (let i = 0; i < 256; i++) d += `L${((i / 255) * W).toFixed(1)},${(H - Math.min(1, bins[i] / max) * (H - 2)).toFixed(1)}`;
      return `${d}L${W},${H}Z`;
    };
    return { r: mk(hist.r), g: mk(hist.g), b: mk(hist.b), l: mk(hist.l) };
  }, [hist]);

  return (
    <div className={`px-3 ${slim ? 'pt-1 pb-2' : 'pt-3 pb-2.5'}`}>
      <button
        type="button"
        onClick={() => setMode(mode === 'rgb' ? 'luma' : 'rgb')}
        className="block w-full"
        aria-label={`Histogram (${mode === 'rgb' ? 'RGB channels' : 'luminance'}). Click to switch.`}
      >
        <svg viewBox="0 0 256 72" preserveAspectRatio="none" className={`w-full rounded-md bg-well ring-1 ring-line-soft ${slim ? 'h-8' : 'h-[76px]'}`}>
          {paths &&
            (mode === 'rgb' ? (
              <g style={{ mixBlendMode: 'screen' }}>
                <path d={paths.r} fill="rgba(255,92,122,0.55)" />
                <path d={paths.g} fill="rgba(120,230,140,0.5)" />
                <path d={paths.b} fill="rgba(63,160,255,0.6)" />
              </g>
            ) : (
              <path d={paths.l} fill="rgba(240,240,236,0.5)" />
            ))}
        </svg>
      </button>
      {!slim && <HistogramFooter hist={hist} out={out} />}
    </div>
  );
});

type EngineState = ReturnType<typeof useEngine.getState>;

/**
 * Below the graph: only what needs attention. Clipping shows when more than 0.5% of the photo is
 * pure black or pure white; the preview size is a tooltip, not a reading.
 */
function HistogramFooter({ hist, out }: { hist: EngineState['histogram']; out: EngineState['outputSize'] }) {
  const lo = hist ? hist.clippedShadows * 100 : 0;
  const hi = hist ? hist.clippedHighlights * 100 : 0;
  return (
    <>
      <div className="mt-1 flex h-[3px] gap-px overflow-hidden rounded-full" aria-hidden>
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className="flex-1" style={{ background: zoneGrey(i) }} />
        ))}
      </div>
      {(lo > 0.5 || hi > 0.5) && (
        <div className="mt-2 flex justify-between text-[11.5px] text-fg-3" title={out ? `Preview ${out.width} × ${out.height}` : undefined}>
          <span>
            {lo > 0.5 && (
              <>
                <ChevronLeft size={11} className="-mr-0.5 inline align-[-1px]" aria-hidden /> {lo.toFixed(1)}% pure black
              </>
            )}
          </span>
          <span>
            {hi > 0.5 && (
              <>
                {hi.toFixed(1)}% pure white <ChevronRight size={11} className="-ml-0.5 inline align-[-1px]" aria-hidden />
              </>
            )}
          </span>
        </div>
      )}
    </>
  );
}
