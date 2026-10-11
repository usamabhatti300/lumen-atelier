/**
 * Lens blur focus tool: clicking the photo sets the focal plane to the depth
 * under the pointer (through the geometry matrix, so it works on cropped and
 * rotated photos). Shows the current focus point.
 */
import { useMemo } from 'react';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { engine } from '@/engine/controller';
import { apply, outputToSourceMatrix, sourceToOutputMatrix } from '@/lib/engine/geometry';
import { depthAt, focusFromNearness } from '@/lib/depth/raster';
import type { ViewBox } from '../Viewport';

export function FocusOverlay({ box }: { box: ViewBox }) {
  const geometry = useEditor((s) => s.edit.geometry);
  const point = useEditor((s) => s.edit.lensBlur?.focusPoint ?? null);
  const setLensBlur = useEditor((s) => s.setLensBlur);
  const full = useEngine((s) => s.fullSize);
  const m = useMemo(() => (full ? outputToSourceMatrix(full, geometry) : null), [full, geometry]);
  const inv = useMemo(() => (full ? sourceToOutputMatrix(full, geometry) : null), [full, geometry]);
  if (!m || !inv) return null;

  const marker = point
    ? (() => {
        const [u, v] = apply(inv, point[0], point[1]);
        return u >= 0 && v >= 0 && u <= 1 && v <= 1 ? { x: box.left + u * box.width, y: box.top + v * box.height } : null;
      })()
    : null;

  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: 'crosshair' }}
      data-testid="focus-overlay"
      aria-label="Tap or click the photo to set the focus"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const u = (e.clientX - rect.left - box.left) / box.width;
        const v = (e.clientY - rect.top - box.top) / box.height;
        const [sx, sy] = apply(m, u, v);
        if (sx < 0 || sy < 0 || sx > 1 || sy > 1) return;
        const d = engine.getDepthRaster();
        if (!d) return;
        setLensBlur({ focus: focusFromNearness(depthAt(d.raster, sx, sy)), focusPoint: [sx, sy] }, 'Set focus');
      }}
    >
      {marker && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <g transform={`translate(${marker.x} ${marker.y})`}>
            <circle r={15} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={3} />
            <circle r={15} fill="none" stroke="var(--color-amber)" strokeWidth={1.4} />
            {[0, 90, 180, 270].map((a) => (
              <line key={a} x1={0} y1={-19} x2={0} y2={-11} stroke="var(--color-amber)" strokeWidth={1.4} transform={`rotate(${a})`} />
            ))}
            <circle r={1.6} fill="var(--color-amber)" />
          </g>
        </svg>
      )}
    </div>
  );
}
