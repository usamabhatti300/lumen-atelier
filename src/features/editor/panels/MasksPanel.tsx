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

  // With no masks yet, the tools are the content: show them instead of an empty list.
  const showMenu = menu || layers.length === 0;
  return (
    <>
      <Section
        title="Masks & layers"
        aside={
          <button
            type="button"
            onClick={() => setMenu(layers.length === 0 ? true : !menu)}
            aria-expanded={showMenu}
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium text-fg-2 transition-colors hover:bg-control hover:text-fg"
          >
            <Plus size={14} /> New mask
          </button>
        }
      >
        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mb-3 grid grid-cols-3 gap-1.5"
            >
              <button
                type="button"
                onClick={addObjectLayer}
                className="group col-span-3 flex h-14 items-center gap-3 rounded-md bg-raised-2 px-3.5 text-left ring-1 ring-line transition-[background-color,box-shadow,transform] hover:bg-control hover:ring-line-strong active:scale-[0.98]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-ground">
                  <MousePointerClick size={15} />
                </span>
                <span className="flex-1 text-sm font-medium text-fg">Select object</span>
                <span className="text-[11px] text-fg-3">
                  <span className="coarse:hidden">click anything</span>
                  <span className="hidden coarse:inline">tap anything</span>
                </span>
              </button>
              <MenuItem icon={<Brush size={16} />} label="Brush" onClick={() => addDrawLayer('brush')} />
              <MenuItem icon={<SquareDashedMousePointer size={16} />} label="Linear" onClick={() => addDrawLayer('linear')} />
              <MenuItem icon={<Circle size={16} />} label="Radial" onClick={() => addDrawLayer('radial')} />
              {(['subject', 'background', 'hair', 'skin', 'clothes'] as SegmentTarget[]).map((t) => (
                <MenuItem key={t} icon={<UserRound size={16} />} label={SEGMENT_LABEL[t]} onClick={() => void addSegmentLayer(t)} />
              ))}
              <p className="col-span-3 px-1 pt-1.5 text-[11px] leading-snug text-fg-4">
                Subject, background, hair, skin and clothes use an on-device person segmentation model. It is built
                for people; other subjects are not detected.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {layers.length === 0 ? (
          <p className="py-1 text-[13px] leading-relaxed text-fg-3">
            Masks apply adjustments to part of the photo. Pick a way to make one above.
          </p>
        ) : (
          <ul className="space-y-1" aria-label="Mask layers">
            {[...layers].reverse().map((l) => (
              <li key={l.id}>
                <div
                  className={`flex items-center gap-1 rounded-md border px-2 py-1.5 transition-colors ${
                    l.id === activeLayerId ? 'border-accent/50 bg-accent/[0.06]' : 'border-line-soft bg-raised-2 hover:border-line'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                    onClick={() => updateLayer(l.id, { visible: !l.visible }, 'Toggle mask')}
                    className="coarse:p-2.5 rounded-xs p-1 text-fg-3 hover:text-fg"
                  >
                    {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActive(l.id === activeLayerId ? null : l.id)}
                    aria-pressed={l.id === activeLayerId}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <Layers size={12} className="shrink-0 text-fg-4" />
                    <span className={`truncate text-xs ${l.visible ? 'text-fg' : 'text-fg-4'}`}>{l.name}</span>
                    {warnings[l.id] && <span className="text-[11px] text-danger">!</span>}
                  </button>
                  <span className="tabular text-[11px] text-fg-4">{Math.round(l.opacity)}%</span>
                  <button type="button" aria-label={`Move ${l.name} up`} onClick={() => moveLayer(l.id, 1)} className="coarse:p-2.5 rounded-xs p-0.5 text-fg-4 hover:text-fg">
                    <ArrowUp size={12} />
                  </button>
                  <button type="button" aria-label={`Move ${l.name} down`} onClick={() => moveLayer(l.id, -1)} className="coarse:p-2.5 rounded-xs p-0.5 text-fg-4 hover:text-fg">
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
              <button type="button" aria-label="Duplicate mask" title="Duplicate" onClick={() => duplicateLayer(active.id)} className="coarse:p-2.5 rounded-xs p-1 text-fg-4 hover:text-fg">
                <Copy size={12} />
              </button>
              <button type="button" aria-label="Delete mask" title="Delete" onClick={() => removeLayer(active.id)} className="coarse:p-2.5 rounded-xs p-1 text-fg-4 hover:text-danger">
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
    <button type="button" onClick={onClick} className="flex h-[60px] flex-col items-center justify-center gap-1.5 rounded-md bg-raised-2 px-1 text-xs text-fg-2 ring-1 ring-line-soft transition-[background-color,color,transform] hover:bg-control hover:text-fg active:scale-95">
      <span className="text-fg-3">{icon}</span>
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
          on ? 'border-accent-fg/60 bg-accent/10 text-accent-fg' : 'border-line text-fg-2 hover:border-line-strong'
        }`}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <div>
      <label className="mb-1 block text-[11px] text-fg-3" htmlFor={`name-${layerId}`}>
        Name
      </label>
      <input
        id={`name-${layerId}`}
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== layer.name && updateLayer(layerId, { name: name.trim() }, 'Rename mask')}
        className="mb-3 h-7 w-full rounded-xs border border-line bg-well px-2 text-xs text-fg outline-none focus:border-accent-fg/60"
      />

      <button
        type="button"
        aria-pressed={tool === 'object'}
        onClick={() => (tool === 'object' ? setUi({ tool: 'none' }) : activateSelectObject())}
        className={`mb-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-xs border text-xs ${
          tool === 'object' ? 'border-accent-fg/60 bg-accent/10 text-accent-fg' : 'border-line text-fg-2 hover:border-line-strong'
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
        <div className="mb-3 rounded-xs bg-ground px-2 py-1">
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
        <p className="mt-2 flex items-center gap-2 text-[11px] text-fg-3">
          <Loader2 size={12} className="animate-spin" /> Detecting subject…
        </p>
      )}
      {warning && !portraitBusy && (
        <p className="mt-2 text-[11px] text-danger">
          {warning}
          {warning.startsWith('Subject detection') ? ' Open the Portrait tab to run detection.' : ''}
        </p>
      )}

      {layer.components.length > 0 && (
        <ul className="mt-3 space-y-0.5" aria-label="Mask shapes">
          {layer.components.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xs px-1 py-0.5 text-[11px] text-fg-3 hover:bg-raised">
              <span>{componentLabel(c)}</span>
              <span className="flex items-center gap-1">
                {c.type === 'radial' && (
                  <button type="button" onClick={() => updateComponent(layerId, { ...c, invert: !c.invert })} className="rounded-xs px-1 coarse:px-2.5 coarse:py-2 text-fg-4 hover:text-fg">
                    {c.invert ? 'inside' : 'outside'}
                  </button>
                )}
                {c.type !== 'brush' && (
                  <button type="button" onClick={() => updateComponent(layerId, { ...c, mode: c.mode === 'add' ? 'erase' : 'add' })} className="rounded-xs px-1 coarse:px-2.5 coarse:py-2 text-fg-4 hover:text-fg">
                    {c.mode === 'add' ? 'add' : 'subtract'}
                  </button>
                )}
                <button type="button" aria-label={`Remove ${componentLabel(c)}`} onClick={() => removeComponent(layerId, c.id)} className="coarse:p-2.5 rounded-xs p-0.5 text-fg-4 hover:text-danger">
                  <X size={11} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-line-soft pt-2">
        <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-fg-2 uppercase">Adjust masked area</p>
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
