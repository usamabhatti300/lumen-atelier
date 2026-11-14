import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { applyAspect, fitCropToRotation, frameSize } from '@/lib/engine/geometry';
import { defaultGeometry, type EditState, type Geometry, type Rotate90 } from '@/lib/schema/adjustments';

const ASPECTS: { label: string; value: number | 'original' | null }[] = [
  { label: 'Free', value: null },
  { label: 'Original', value: 'original' },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '5:4', value: 5 / 4 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

/**
 * The geometry from the moment the crop tool opened, so Cancel (or Escape) can put it back.
 * Kept outside React: the tool can be opened from the panel, a shortcut or the More grid.
 */
let beforeCrop: { photoId: string | null; geometry: Geometry; edit: EditState; history: ReturnType<typeof useEditor.getState>['history'] } | null = null;
useEditor.subscribe(
  (s) => s.tool,
  (tool, prev) => {
    const s = useEditor.getState();
    if (tool === 'crop' && prev !== 'crop') beforeCrop = { photoId: s.activePhotoId, geometry: structuredClone(s.edit.geometry), edit: s.edit, history: s.history };
    else if (tool !== 'crop') beforeCrop = null;
  },
);

/** Leaves the crop tool and restores the crop, rotation and flips it started with. */
export function cancelCrop() {
  const s = useEditor.getState();
  const saved = beforeCrop;
  if (saved && saved.photoId === s.activePhotoId && JSON.stringify(saved.geometry) !== JSON.stringify(s.edit.geometry)) {
    // Only the crop changed since the tool opened (the usual case): rewind, so a cancelled crop
    // leaves nothing to undo back into. Otherwise keep the other edits and just put the crop back.
    const onlyCrop = JSON.stringify({ ...s.edit, geometry: null }) === JSON.stringify({ ...saved.edit, geometry: null });
    if (onlyCrop) s.rewind(saved.edit, saved.history);
    else s.setGeometry(saved.geometry, 'Cancel crop');
  }
  s.setUi({ tool: 'none' });
}

/** Largest crop for the current aspect that fits the straightened image. */
export function maximalCrop(g: Geometry, full: { width: number; height: number }) {
  const frame = frameSize(full, g);
  const aspect = g.aspect ?? (g.crop.w * frame.width) / (g.crop.h * frame.height);
  const base = applyAspect({ x: 0, y: 0, w: 1, h: 1 }, aspect, frame);
  return fitCropToRotation(base, g.straighten, frame);
}

export function GeometryPanel() {
  const geometry = useEditor((s) => s.edit.geometry);
  const setGeometry = useEditor((s) => s.setGeometry);
  const tool = useEditor((s) => s.tool);
  const setUi = useEditor((s) => s.setUi);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const full = useEngine((s) => s.fullSize);
  if (!full) return <p className="p-4 text-xs text-fg-3">Open a photo to crop and rotate it.</p>;

  const frame = frameSize(full, geometry);
  const activeAspect = (v: (typeof ASPECTS)[number]['value']) => {
    if (v === null) return geometry.aspect === null;
    const target = v === 'original' ? frame.width / frame.height : v;
    return geometry.aspect !== null && Math.abs(geometry.aspect - target) < 1e-3;
  };

  const setAspect = (v: (typeof ASPECTS)[number]['value']) => {
    const aspect = v === 'original' ? frame.width / frame.height : v;
    const crop = aspect ? fitCropToRotation(applyAspect(geometry.crop, aspect, frame), geometry.straighten, frame) : geometry.crop;
    setGeometry({ aspect, crop }, 'Crop aspect');
  };

  const rotate = (dir: 1 | -1) => {
    const rotate90 = (((geometry.rotate90 + dir) % 4) + 4) % 4 as Rotate90;
    const next: Geometry = { ...geometry, rotate90, aspect: geometry.aspect ? 1 / geometry.aspect : null };
    // Rotate the crop rectangle with the frame.
    const c = geometry.crop;
    next.crop = dir === 1 ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w } : { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
    setGeometry(next, dir === 1 ? 'Rotate right' : 'Rotate left');
  };

  return (
    <>
      <Section title="Crop">
        <div className="mb-3 flex gap-2">
          {tool === 'crop' && (
            <Button variant="secondary" size="sm" className="flex-1" onClick={cancelCrop} data-testid="crop-cancel">
              Cancel
            </Button>
          )}
          <Button
            variant={tool === 'crop' ? 'primary' : 'secondary'}
            size="sm"
            icon={<Crop size={14} />}
            className="flex-1"
            onClick={() => setUi({ tool: tool === 'crop' ? 'none' : 'crop' })}
          >
            {tool === 'crop' ? 'Done' : 'Adjust crop on photo'}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {ASPECTS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => setAspect(a.value)}
              aria-pressed={activeAspect(a.value)}
              className={`h-7 rounded-xs border text-xs transition-colors coarse:h-10 ${
                activeAspect(a.value) ? 'border-accent-fg/60 bg-accent/10 text-accent-fg' : 'border-line text-fg-2 hover:border-line-strong'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="tabular mt-2 text-[11px] text-fg-4">
          Output {Math.round(geometry.crop.w * frame.width)} × {Math.round(geometry.crop.h * frame.height)} px
        </p>
      </Section>
      <Section title="Rotate & flip">
        <div className="mb-3 grid grid-cols-4 gap-1">
          <Button size="sm" variant="secondary" aria-label="Rotate left" onClick={() => rotate(-1)} icon={<RotateCcw size={14} />} />
          <Button size="sm" variant="secondary" aria-label="Rotate right" onClick={() => rotate(1)} icon={<RotateCw size={14} />} />
          <Button
            size="sm"
            variant={geometry.flipH ? 'primary' : 'secondary'}
            aria-label="Flip horizontal"
            aria-pressed={geometry.flipH}
            onClick={() => setGeometry({ flipH: !geometry.flipH }, 'Flip horizontal')}
            icon={<FlipHorizontal2 size={14} />}
          />
          <Button
            size="sm"
            variant={geometry.flipV ? 'primary' : 'secondary'}
            aria-label="Flip vertical"
            aria-pressed={geometry.flipV}
            onClick={() => setGeometry({ flipV: !geometry.flipV }, 'Flip vertical')}
            icon={<FlipVertical2 size={14} />}
          />
        </div>
        <Slider
          label="Straighten"
          value={geometry.straighten}
          range={{ min: -45, max: 45, default: 0, step: 0.1 }}
          format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`}
          onGestureStart={() => begin('Straighten')}
          onGestureEnd={end}
          onChange={(v) => {
            const g = { ...geometry, straighten: v };
            setGeometry({ straighten: v, crop: maximalCrop(g, full) }, 'Straighten');
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => setGeometry(defaultGeometry(), 'Reset crop & rotation')}
        >
          Reset crop &amp; rotation
        </Button>
      </Section>
    </>
  );
}
