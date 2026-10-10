import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  Brush,
  Circle,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  MousePointerClick,
  Plus,
  SquareDashedMousePointer,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Section } from '@/components/ui/Section';
import { Slider } from '@/components/ui/Slider';
import { Toggle } from '@/components/ui/misc';
import { useEditor } from '@/state/editorStore';
import { useEngine } from '@/engine/engineStore';
import { ensurePortraitAnalysis, usePortrait } from '@/features/portrait/portraitState';
import { LOCAL_RANGES, type LocalAdjustments, type MaskComponent, type SegmentTarget } from '@/lib/schema/adjustments';
import { newId } from '@/lib/storage/db';
import { SelectObjectPanel } from '@/features/masks/selectObject';
import { activateSelectObject } from '@/features/masks/selectObjectActions';

const LOCAL_LABELS: [keyof LocalAdjustments, string][] = [
  ['exposure', 'Exposure'],
  ['contrast', 'Contrast'],
  ['highlights', 'Highlights'],
  ['shadows', 'Shadows'],
  ['temperature', 'Temperature'],
  ['tint', 'Tint'],
  ['saturation', 'Saturation'],
  ['clarity', 'Clarity'],
  ['dehaze', 'Dehaze'],
  ['blur', 'Blur'],
  ['tintAmount', 'Colour amount'],
  ['tintHue', 'Colour hue'],
];

const SEGMENT_LABEL: Record<SegmentTarget, string> = {
  subject: 'Subject',
  background: 'Background',
  hair: 'Hair',
  skin: 'Skin',
  clothes: 'Clothes',
};

function componentLabel(c: MaskComponent) {
  if (c.type === 'brush') return `${c.mode === 'erase' ? 'Erase' : 'Brush'} stroke`;
  if (c.type === 'linear') return 'Linear gradient';
  if (c.type === 'radial') return `Radial gradient${c.invert ? ' (outside)' : ''}`;
  if (c.type === 'object') return `Selected object (${c.points.length} ${c.points.length === 1 ? 'point' : 'points'})`;
  return `${SEGMENT_LABEL[c.target]} (detected)`;
}

export function MasksPanel() {
  const layers = useEditor((s) => s.edit.layers);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const addLayer = useEditor((s) => s.addLayer);
  const setActive = useEditor((s) => s.setActiveLayer);
  const updateLayer = useEditor((s) => s.updateLayer);
  const removeLayer = useEditor((s) => s.removeLayer);
  const moveLayer = useEditor((s) => s.moveLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const setUi = useEditor((s) => s.setUi);
  const mode = useEngine((s) => s.mode);
  const warnings = useEngine((s) => s.maskWarnings);
  const portrait = usePortrait();
  const [menu, setMenu] = useState(false);
  const active = layers.find((l) => l.id === activeLayerId);

  const addSegmentLayer = async (target: SegmentTarget) => {
    setMenu(false);
    const id = addLayer(SEGMENT_LABEL[target], [{ type: 'segment', id: newId('c_'), mode: 'add', target }]);
    setActive(id);
    await ensurePortraitAnalysis();
  };

  const addObjectLayer = () => {
    setMenu(false);
    addLayer('Object');
    activateSelectObject();
  };

  const addDrawLayer = (kind: 'brush' | 'linear' | 'radial') => {
    setMenu(false);
    const name = kind === 'brush' ? 'Brush mask' : kind === 'linear' ? 'Linear gradient' : 'Radial gradient';
    addLayer(name);
    setUi({ tool: kind, showMaskOverlay: kind === 'brush' });
  };

  return (
    <>
      <Section
        title="Masks & layers"
        aside={
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            className="flex items-center gap-1 rounded-xs px-1.5 py-1 text-[11px] text-amber hover:bg-amber/10"
          >
            <Plus size={13} /> New mask
          </button>
        }
      >
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="mb-3 grid grid-cols-2 gap-1 rounded-sm border border-line bg-ink-900 p-1.5"
            >
              <button
                type="button"
                onClick={addObjectLayer}
                className="col-span-2 flex h-9 items-center gap-2 rounded-xs border border-amber/30 px-2 text-left text-xs text-ivory hover:border-amber/60 hover:bg-amber/5"
              >
                <MousePointerClick size={14} className="text-amber" />
                <span className="flex-1">Select object</span>
                <span className="text-[10px] text-faint">click anything</span>
              </button>
              <MenuItem icon={<Brush size={14} />} label="Brush" onClick={() => addDrawLayer('brush')} />
              <MenuItem icon={<SquareDashedMousePointer size={14} />} label="Linear" onClick={() => addDrawLayer('linear')} />
              <MenuItem icon={<Circle size={14} />} label="Radial" onClick={() => addDrawLayer('radial')} />
              {(['subject', 'background', 'hair', 'skin', 'clothes'] as SegmentTarget[]).map((t) => (
                <MenuItem key={t} icon={<UserRound size={14} />} label={SEGMENT_LABEL[t]} onClick={() => void addSegmentLayer(t)} />
              ))}
              <p className="col-span-2 px-1 pt-1 text-[10.5px] leading-snug text-faint">
                Subject, background, hair, skin and clothes use an on-device person segmentation model. It is built
                for people; other subjects are not detected.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {layers.length === 0 ? (
          <p className="py-2 text-xs leading-relaxed text-mute">
            Masks apply adjustments to part of the photo. Select any object by clicking it, paint with a brush, add a
            gradient, or use a detected subject or background.
          </p>
        ) : (
          <ul className="space-y-1" aria-label="Mask layers">
            {[...layers].reverse().map((l) => (
              <li key={l.id}>
                <div
                  className={`flex items-center gap-1 rounded-xs border px-1.5 py-1 ${
                    l.id === activeLayerId ? 'border-amber/50 bg-amber/5' : 'border-line-soft hover:border-line'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                    onClick={() => updateLayer(l.id, { visible: !l.visible }, 'Toggle mask')}
                    className="rounded-xs p-1 text-mute hover:text-ivory"
                  >
                    {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActive(l.id === activeLayerId ? null : l.id)}
                    aria-pressed={l.id === activeLayerId}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <Layers size={12} className="shrink-0 text-faint" />
                    <span className={`truncate text-xs ${l.visible ? 'text-ivory' : 'text-faint'}`}>{l.name}</span>
                    {warnings[l.id] && <span className="text-[10px] text-safelight">!</span>}
                  </button>
                  <span className="tabular text-[10px] text-faint">{Math.round(l.opacity)}%</span>
                  <button type="button" aria-label={`Move ${l.name} up`} onClick={() => moveLayer(l.id, 1)} className="rounded-xs p-0.5 text-faint hover:text-ivory">
                    <ArrowUp size={12} />
                  </button>
                  <button type="button" aria-label={`Move ${l.name} down`} onClick={() => moveLayer(l.id, -1)} className="rounded-xs p-0.5 text-faint hover:text-ivory">
                    <ArrowDown size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {active && (
        <Section
          title={active.name}
          aside={
            <div className="flex">
              <button type="button" aria-label="Duplicate mask" title="Duplicate" onClick={() => duplicateLayer(active.id)} className="rounded-xs p-1 text-faint hover:text-ivory">
                <Copy size={12} />
              </button>
              <button type="button" aria-label="Delete mask" title="Delete" onClick={() => removeLayer(active.id)} className="rounded-xs p-1 text-faint hover:text-safelight">
                <Trash2 size={12} />
              </button>
            </div>
          }
        >
          <ActiveLayerEditor layerId={active.id} gpu={mode === 'webgl'} portraitBusy={portrait.status === 'running'} warning={warnings[active.id]} />
        </Section>
      )}
    </>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-8 items-center gap-2 rounded-xs px-2 text-xs text-ivory-dim hover:bg-ink-700 hover:text-ivory">
      <span className="text-faint">{icon}</span>
      {label}
    </button>
  );
}

function ActiveLayerEditor({ layerId, gpu, portraitBusy, warning }: { layerId: string; gpu: boolean; portraitBusy: boolean; warning?: string }) {
  const layer = useEditor((s) => s.edit.layers.find((l) => l.id === layerId))!;
  const tool = useEditor((s) => s.tool);
  const brush = useEditor((s) => s.brush);
  const showOverlay = useEditor((s) => s.showMaskOverlay);
  const setUi = useEditor((s) => s.setUi);
  const setBrush = useEditor((s) => s.setBrush);
  const updateLayer = useEditor((s) => s.updateLayer);
  const setLocal = useEditor((s) => s.setLayerAdjustment);
  const removeComponent = useEditor((s) => s.removeMaskComponent);
  const updateComponent = useEditor((s) => s.updateMaskComponent);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const [name, setName] = useState(layer.name);

  const toolBtn = (t: 'brush' | 'linear' | 'radial', label: string, icon: React.ReactNode, eraseMode?: boolean) => {
    const on = tool === t && (eraseMode === undefined || (brush.mode === 'erase') === eraseMode);
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          if (eraseMode !== undefined) setBrush({ mode: eraseMode ? 'erase' : 'add' });
          setUi({ tool: on ? 'none' : t });
        }}
        className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xs border text-xs ${
          on ? 'border-amber/60 bg-amber/10 text-amber' : 'border-line text-ivory-dim hover:border-line-strong'
        }`}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <div>
      <label className="mb-1 block text-[11px] text-mute" htmlFor={`name-${layerId}`}>
        Name
      </label>
      <input
        id={`name-${layerId}`}
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== layer.name && updateLayer(layerId, { name: name.trim() }, 'Rename mask')}
        className="mb-3 h-7 w-full rounded-xs border border-line bg-ink-950 px-2 text-xs text-ivory outline-none focus:border-amber/60"
      />

      <button
        type="button"
        aria-pressed={tool === 'object'}
        onClick={() => (tool === 'object' ? setUi({ tool: 'none' }) : activateSelectObject())}
        className={`mb-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-xs border text-xs ${
          tool === 'object' ? 'border-amber/60 bg-amber/10 text-amber' : 'border-line text-ivory-dim hover:border-line-strong'
        }`}
      >
        <MousePointerClick size={13} />
        Select object
      </button>
      {tool === 'object' && <SelectObjectPanel layerId={layerId} />}
      <div className="mb-2 flex gap-1">
        {toolBtn('brush', 'Paint', <Brush size={13} />, false)}
        {toolBtn('brush', 'Erase', <Eraser size={13} />, true)}
      </div>
      <div className="mb-3 flex gap-1">
        {toolBtn('linear', 'Linear', <SquareDashedMousePointer size={13} />)}
        {toolBtn('radial', 'Radial', <Circle size={13} />)}
      </div>

      {tool === 'brush' && (
        <div className="mb-3 rounded-xs bg-ink-900 px-2 py-1">
          <Slider label="Brush size" value={Math.round(brush.size * 1000) / 10} range={{ min: 0.2, max: 40, default: 6, step: 0.1 }} format={(v) => `${v.toFixed(1)}%`} onChange={(v) => setBrush({ size: v / 100 })} />
          <Slider label="Softness" value={Math.round(brush.softness * 100)} range={{ min: 0, max: 100, default: 60, step: 1 }} onChange={(v) => setBrush({ softness: v / 100 })} />
          <Slider label="Flow" value={Math.round(brush.opacity * 100)} range={{ min: 1, max: 100, default: 100, step: 1 }} onChange={(v) => setBrush({ opacity: v / 100 })} />
        </div>
      )}

      <Toggle checked={showOverlay} onChange={(v) => setUi({ showMaskOverlay: v })} label="Show mask overlay" />
      <Toggle checked={layer.invert} onChange={(v) => updateLayer(layerId, { invert: v }, 'Invert mask')} label="Invert mask" />
      <Slider
        label="Layer opacity"
        value={layer.opacity}
        range={{ min: 0, max: 100, default: 100, step: 1 }}
        onGestureStart={() => begin('Mask opacity')}
        onGestureEnd={end}
        onChange={(v) => updateLayer(layerId, { opacity: v }, 'Mask opacity')}
      />

      {portraitBusy && (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-mute">
          <Loader2 size={12} className="animate-spin" /> Detecting subject…
        </p>
      )}
      {warning && !portraitBusy && (
        <p className="mt-2 text-[11px] text-safelight">
          {warning}
          {warning.startsWith('Subject detection') ? ' Open the Portrait tab to run detection.' : ''}
        </p>
      )}

      {layer.components.length > 0 && (
        <ul className="mt-3 space-y-0.5" aria-label="Mask shapes">
          {layer.components.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xs px-1 py-0.5 text-[11px] text-mute hover:bg-ink-800">
              <span>{componentLabel(c)}</span>
              <span className="flex items-center gap-1">
                {c.type === 'radial' && (
                  <button type="button" onClick={() => updateComponent(layerId, { ...c, invert: !c.invert })} className="rounded-xs px-1 text-faint hover:text-ivory">
                    {c.invert ? 'inside' : 'outside'}
                  </button>
                )}
                {c.type !== 'brush' && (
                  <button type="button" onClick={() => updateComponent(layerId, { ...c, mode: c.mode === 'add' ? 'erase' : 'add' })} className="rounded-xs px-1 text-faint hover:text-ivory">
                    {c.mode === 'add' ? 'add' : 'subtract'}
                  </button>
                )}
                <button type="button" aria-label={`Remove ${componentLabel(c)}`} onClick={() => removeComponent(layerId, c.id)} className="rounded-xs p-0.5 text-faint hover:text-safelight">
                  <X size={11} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-line-soft pt-2">
        <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-ivory-dim uppercase">Adjust masked area</p>
        {LOCAL_LABELS.map(([key, label]) => (
          <Slider
            key={key}
            label={label}
            value={layer.adjustments[key]}
            range={LOCAL_RANGES[key]}
            disabled={key === 'blur' && !gpu}
            hint={key === 'blur' && !gpu ? 'Mask blur needs WebGL2' : undefined}
            onGestureStart={() => begin(`Mask ${label}`)}
            onGestureEnd={end}
            onChange={(v) => setLocal(layerId, key, v)}
          />
        ))}
      </div>
    </div>
  );
}
