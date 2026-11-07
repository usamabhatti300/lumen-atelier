/** Preset library: browse, favourite, import/export, manage presets (no photo needed). */
import { Download, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CartonBar } from '@/components/CartonBar';
import { PRESET_CATEGORY_IDS, type PresetCategoryId } from '@/lib/schema/preset';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PresetBrowser } from '@/features/presets/PresetBrowser';
import { usePresets, downloadText, ALL_CATEGORY_LABELS } from '@/state/presetStore';
import { useEditor } from '@/state/editorStore';
import { setPreviewSource } from '@/engine/presetThumbs';
import { leafPaths } from '@/lib/schema/adjustments';
import { BUILTIN_PRESETS } from '@/lib/presets/library';
import type { Preset } from '@/lib/schema/preset';

export default function PresetLibraryScreen() {
  const user = usePresets((s) => s.user);
  const load = usePresets((s) => s.load);
  const showToast = useEditor((s) => s.showToast);
  const file = useRef<HTMLInputElement>(null);
  const [detail, setDetail] = useState<Preset | null>(null);
  const [params] = useSearchParams();
  const fromShelf = params.get('category');
  const initialCategory = PRESET_CATEGORY_IDS.includes(fromShelf as PresetCategoryId) ? (fromShelf as PresetCategoryId) : undefined;
  const [report, setReport] = useState<{ added: number; warnings: string[]; rejected: number } | null>(null);

  useEffect(() => {
    void load();
    // No photo on this screen: previews use the built-in test scene.
    void setPreviewSource(null, null);
  }, [load]);

  return (
    <div className="flex h-full flex-col bg-ground">
      <CartonBar>
          <Button size="sm" variant="secondary" icon={<Upload size={13} />} onClick={() => file.current?.click()}>
            Import
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={13} />}
            disabled={user.length === 0}
            onClick={() => downloadText(usePresets.getState().exportJson(user.map((p) => p.id)), 'lumen-atelier-presets.json')}
          >
            Export mine
          </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="preset-import-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setReport(await usePresets.getState().importFile(await f.text()));
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Import failed.', 'error');
            }
          }}
        />
      </CartonBar>
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 sm:px-8">
        <div className="shrink-0 pt-4 pb-5">
          <h1 className="carton-title text-[3rem] text-fg sm:text-[4.5rem]">The shelf</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-2">
            {BUILTIN_PRESETS.length} original looks, led by the Signature Collection, plus the presets you save or build from references. Previews here
            use a built-in test scene; in a project they show your photo. All presets are free to use.
          </p>
        </div>
        <div className="min-h-0 flex-1 pb-6">
          <PresetBrowser variant="page" onApply={setDetail} actionVerb="View" initialFilter={initialCategory} />
        </div>
      </main>

      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="space-y-3 p-4 text-sm">
            <p className="carton-label text-xs text-fg-3">{ALL_CATEGORY_LABELS[detail.category]}</p>
            {detail.description && <p className="leading-relaxed text-fg-2">{detail.description}</p>}
            {detail.reference && (
              <div className="rounded-sm border border-line-soft p-3">
                <div className="flex gap-3">
                  {detail.reference.thumbnail && <img src={detail.reference.thumbnail} alt="Reference" className="h-20 w-auto rounded-xs" />}
                  <div>
                    <p className="text-xs text-fg-3">From a reference · {detail.reference.confidence} confidence · {detail.reference.aiInterpretation ? 'AI + measurements' : 'measurements only'}</p>
                    <div className="mt-2 flex h-4 overflow-hidden rounded-[2px]">
                      {detail.reference.palette.map((c) => (
                        <span key={c} className="flex-1" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </div>
                {detail.reference.notes.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-fg-3">
                    {detail.reference.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-xs text-fg-3">Sets {leafPaths(detail.adjustments).length} controls: {[...new Set(leafPaths(detail.adjustments).map((p) => p.split('.')[0]))].join(', ')}.</p>
            <p className="text-xs text-fg-4">Open a photo and pick this look from the Looks panel to load it.</p>
          </div>
        )}
      </Dialog>
      <Dialog open={!!report} onClose={() => setReport(null)} title="Import finished">
        {report && (
          <div className="space-y-2 p-4 text-sm text-fg-3">
            <p className="text-fg">
              Imported {report.added} preset{report.added === 1 ? '' : 's'}
              {report.rejected ? `, skipped ${report.rejected}` : ''}.
            </p>
            {report.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-xs">
                {report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
