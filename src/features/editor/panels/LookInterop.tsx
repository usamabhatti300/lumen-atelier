import { FileDown, FileUp, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { useEditor } from '@/state/editorStore';
import { downloadText } from '@/state/presetStore';
import { CUBE_OMITTED, generateCube, parseCube } from '@/lib/interop/cube';
import { generateXmp } from '@/lib/interop/xmp';
import { newId, putLut } from '@/lib/storage/db';
import { serializePresets } from '@/lib/schema/preset';
import { adjustmentsToPresetValues } from '@/lib/presets/blend';

export function LookInterop() {
  const lut = useEditor((s) => s.edit.lut);
  const commit = useEditor((s) => s.commitEdit);
  const begin = useEditor((s) => s.beginGesture);
  const end = useEditor((s) => s.endGesture);
  const showToast = useEditor((s) => s.showToast);
  const photoName = useEditor((s) => s.photos.find((p) => p.id === s.activePhotoId)?.name ?? 'look');
  const input = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<{ title: string; items: string[] } | null>(null);
  const base = photoName.replace(/\.[a-z0-9]+$/i, '').replace(/[^\w-]+/g, '_');

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-fg-2 uppercase">Creative LUT</p>
      {lut ? (
        <div className="mb-3 rounded-xs bg-ground px-2 py-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-fg">{lut.name}</span>
            <button type="button" aria-label="Remove LUT" onClick={() => commit('Remove LUT', (e) => ({ ...e, lut: null }))} className="coarse:p-2.5 p-0.5 text-fg-4 hover:text-fg">
              <X size={12} />
            </button>
          </div>
          <Slider
            label="LUT amount"
            value={lut.amount}
            range={{ min: 0, max: 100, default: 100, step: 1 }}
            onGestureStart={() => begin('LUT amount')}
            onGestureEnd={end}
            onChange={(v) => commit('LUT amount', (e) => (e.lut ? { ...e, lut: { ...e.lut, amount: v } } : e))}
          />
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="mb-3" icon={<FileUp size={13} />} onClick={() => input.current?.click()}>
          Import .cube LUT
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept=".cube,text/plain"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const parsed = parseCube(await f.text());
            const id = newId('lut_');
            await putLut({ id, name: parsed.title, size: parsed.size, data: parsed.data, createdAt: Date.now() });
            commit('Apply LUT', (ed) => ({ ...ed, lut: { id, name: parsed.title, amount: 100 } }));
            showToast(`Applied LUT “${parsed.title}” (${parsed.size}³).`, 'success');
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not read this LUT.', 'error');
          }
        }}
      />

      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-fg-2 uppercase">Export this look</p>
      <div className="grid grid-cols-3 gap-1">
        <Button
          size="sm"
          variant="secondary"
          icon={<FileDown size={13} />}
          onClick={() => {
            const adj = useEditor.getState().edit.adjustments;
            downloadText(generateCube(adj, `${base} look`), `${base}.cube`, 'text/plain');
            setNotes({ title: '.cube LUT exported. Not included:', items: [...CUBE_OMITTED, ...(lut ? ['The imported LUT itself'] : [])] });
          }}
        >
          .cube
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<FileDown size={13} />}
          onClick={() => {
            const { xml, omitted } = generateXmp(useEditor.getState().edit.adjustments, `${base} (Lumen Atelier)`);
            downloadText(xml, `${base}.xmp`, 'application/rdf+xml');
            setNotes({ title: 'Lightroom XMP exported (approximate). Notes:', items: omitted });
          }}
        >
          XMP
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<FileDown size={13} />}
          onClick={() => {
            const now = Date.now();
            const json = serializePresets([
              { id: 'x', name: `${base} look`, category: 'custom', description: '', tags: [], origin: 'user', adjustments: adjustmentsToPresetValues(useEditor.getState().edit.adjustments), createdAt: now, updatedAt: now },
            ]);
            downloadText(json, `${base}.lumen-preset.json`);
            setNotes({ title: 'Preset JSON exported. Import it on the Presets screen.', items: ['Masks, retouching, crop and LUTs are photo-specific and not included.'] });
          }}
        >
          JSON
        </Button>
      </div>
      {notes && (
        <div className="mt-2 rounded-xs border border-line-soft p-2 text-[11px] leading-relaxed text-fg-3" role="status">
          <p className="text-fg-2">{notes.title}</p>
          <ul className="mt-1 list-disc pl-4">
            {notes.items.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
