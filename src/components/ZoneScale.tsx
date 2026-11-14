/**
 * Zone System scale (Ansel Adams): eleven zones from 0 (pure black) to X
 * (pure white), one stop apart with Zone V at 18% grey. Optionally shows a
 * measured distribution of an image's tones across the zones.
 */
import { linearToSrgb } from '@/lib/color/srgb';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function zoneGrey(zone: number): string {
  if (zone <= 0) return '#000';
  if (zone >= 10) return '#fff';
  const v = Math.round(linearToSrgb(0.18 * Math.pow(2, zone - 5)) * 255);
  return `rgb(${v},${v},${v})`;
}

/** Zone index (0..10) for a linear luminance value. */
export function zoneOf(linearY: number): number {
  if (linearY <= 0.18 / 32 / 1.414) return 0;
  const z = Math.round(Math.log2(linearY / 0.18) + 5);
  return Math.max(0, Math.min(10, z));
}

export function ZoneScale({
  distribution,
  compareDistribution,
  className = '',
  labels = true,
}: {
  /** Fractions per zone (11 values). */
  distribution?: number[];
  compareDistribution?: number[];
  className?: string;
  labels?: boolean;
}) {
  const max = Math.max(1e-6, ...(distribution ?? []), ...(compareDistribution ?? []));
  return (
    <div className={className} aria-label={distribution ? 'Tonal distribution by zone' : 'Zone system scale'} role="img">
      {distribution && (
        <div className="mb-1 flex h-10 items-end gap-[2px]">
          {distribution.map((v, i) => (
            <div key={i} className="relative flex h-full flex-1 items-end">
              <div className="w-full rounded-t-[1px] bg-selected/70 transition-[height] duration-500" style={{ height: `${(v / max) * 100}%` }} />
              {compareDistribution && (
                <div
                  className="absolute inset-x-0 border-t border-dashed border-success"
                  style={{ bottom: `${(compareDistribution[i] / max) * 100}%` }}
                />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-[2px]">
        {ROMAN.map((r, i) => (
          <div key={r} className="flex-1">
            <div className="h-3 rounded-[1px] ring-1 ring-black/10" style={{ background: zoneGrey(i) }} />
            {labels && <div className="mt-1 text-center font-mono text-[9.5px] tracking-wider text-fg-4">{r}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
