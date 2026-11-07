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
    <div className={`theme-frame border-b border-line-soft px-3 ${slim ? 'pt-1 pb-2' : 'pt-2.5 pb-2'}`}>
      <button
        type="button"
        onClick={() => setMode(mode === 'rgb' ? 'luma' : 'rgb')}
        className="block w-full"
        aria-label={`Histogram (${mode === 'rgb' ? 'RGB channels' : 'luminance'}). Click to switch.`}
      >
        <svg viewBox="0 0 256 72" preserveAspectRatio="none" className={`w-full rounded-xs bg-well ${slim ? 'h-8' : 'h-[72px]'}`}>
          {paths &&
            (mode === 'rgb' ? (
              <g style={{ mixBlendMode: 'screen' }}>
                <path d={paths.r} fill="rgba(217,96,82,0.55)" />
                <path d={paths.g} fill="rgba(110,170,100,0.55)" />
                <path d={paths.b} fill="rgba(95,125,205,0.6)" />
              </g>
            ) : (
              <path d={paths.l} fill="rgba(236,230,218,0.55)" />
            ))}
        </svg>
      </button>
      {!slim && <HistogramFooter hist={hist} out={out} />}
    </div>
  );
});

type EngineState = ReturnType<typeof useEngine.getState>;

function HistogramFooter({ hist, out }: { hist: EngineState['histogram']; out: EngineState['outputSize'] }) {
  return (
    <>
      <div className="mt-[3px] flex h-[3px] gap-px" aria-hidden>
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className="flex-1" style={{ background: zoneGrey(i) }} />
        ))}
      </div>
      <div className="tabular mt-1.5 flex justify-between font-mono text-[10px] text-fg-4">
        <span title="Share of pixels clipped to black">
          <ChevronLeft size={10} className="-mr-0.5 inline align-[-1px]" aria-hidden /> {hist ? (hist.clippedShadows * 100).toFixed(1) : '–'}%
        </span>
        <span>
          {out ? `preview ${out.width}×${out.height}` : ''}
        </span>
        <span title="Share of pixels clipped to white">{hist ? (hist.clippedHighlights * 100).toFixed(1) : '–'}% <ChevronRight size={10} className="-ml-0.5 inline align-[-1px]" aria-hidden /></span>
      </div>
    </>
  );
}
