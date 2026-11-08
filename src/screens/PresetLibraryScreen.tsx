/** Preset library: browse, favourite, import/export, manage presets (no photo needed). */
import { Download, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AppBar } from '@/components/AppBar';
import { PRESET_CATEGORY_IDS, type PresetCategoryId } from '@/lib/schema/preset';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PresetBrowser } from '@/features/presets/PresetBrowser';
import { usePresets, downloadText, ALL_CATEGORY_LABELS } from '@/state/presetStore';
import { useEditor } from '@/state/editorStore';
import { setPreviewSource } from '@/engine/presetThumbs';
import { leafPaths } from '@/lib/schema/adjustments';
import { BUILTIN_PRESETS } from '@/lib/presets/library';
import { categoryTint } from '@/lib/presets/codes';
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
    <div className="scroll-quiet h-full overflow-y-auto bg-ground">
      <AppBar>
          <Button size="sm" variant="secondary" aria-label="Import" className="max-sm:w-10 max-sm:px-0" icon={<Upload size={14} />} onClick={() => file.current?.click()}>
            <span className="max-sm:sr-only">Import</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-label="Export mine"
            className="max-sm:w-10 max-sm:px-0"
            icon={<Download size={14} />}
            disabled={user.length === 0}
            onClick={() => downloadText(usePresets.getState().exportJson(user.map((p) => p.id)), 'lumen-atelier-presets.json')}
          >
            <span className="max-sm:sr-only">Export mine</span>
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
      </AppBar>
      <main className="screen-enter mx-auto w-full max-w-7xl px-4 sm:px-8">
        <div className="relative pt-8 pb-7 sm:pt-12 sm:pb-9">
          <div aria-hidden className="pointer-events-none absolute -top-10 -left-20 h-56 w-56 rounded-full bg-accent/[0.06] blur-3xl" />
          <p className="label-caps relative text-fg-4">
            {BUILTIN_PRESETS.length} original looks{user.length > 0 ? ` · ${user.length} of yours` : ''} · all free
          </p>
          <h1 className="display relative mt-3 text-[3.2rem] text-fg sm:text-[5rem]">
            The <span className="serif text-[1.08em]">shelf</span>
          </h1>
          <p className="relative mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-3">
            Led by the Signature Collection, plus the presets you save or build from references. Previews here use a built-in test scene; in
            a project they show your photo.
          </p>
        </div>
        <div className="pb-16">
          <PresetBrowser variant="page" onApply={setDetail} actionVerb="View" initialFilter={initialCategory} />
        </div>
      </main>

      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="space-y-4 px-5 pb-5 text-sm">
            <p className="label-caps flex items-center gap-2 text-fg-3">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: categoryTint(detail.category) }} />
              {ALL_CATEGORY_LABELS[detail.category]}
            </p>
            {detail.description && <p className="leading-relaxed text-fg-2">{detail.description}</p>}
            {detail.reference && (
              <div className="rounded-md bg-raised-2 p-3.5">
                <div className="flex gap-3">
                  {detail.reference.thumbnail && <img src={detail.reference.thumbnail} alt="Reference" className="h-20 w-auto rounded-sm" />}
                  <div>
                    <p className="text-xs text-fg-3">From a reference · {detail.reference.confidence} confidence · {detail.reference.aiInterpretation ? 'AI + measurements' : 'measurements only'}</p>
                    <div className="mt-2.5 flex h-5 overflow-hidden rounded-full">
                      {detail.reference.palette.map((c) => (
                        <span key={c} className="flex-1" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </div>
                {detail.reference.notes.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-fg-3">
                    {detail.reference.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-[13px] text-fg-3">Sets {leafPaths(detail.adjustments).length} controls: {[...new Set(leafPaths(detail.adjustments).map((p) => p.split('.')[0]))].join(', ')}.</p>
            <p className="text-[13px] text-fg-4">Open a photo and pick this look from the Looks panel to load it.</p>
          </div>
        )}
      </Dialog>
      <Dialog open={!!report} onClose={() => setReport(null)} title="Import finished">
        {report && (
          <div className="space-y-2 px-5 pb-5 text-sm text-fg-3">
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
