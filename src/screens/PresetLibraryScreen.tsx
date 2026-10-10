/** Preset library: browse, favourite, import/export, manage presets (no photo needed). */
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PresetBrowser } from '@/features/presets/PresetBrowser';
import { usePresets, downloadText, ALL_CATEGORY_LABELS } from '@/state/presetStore';
import { useEditor } from '@/state/editorStore';
import { setPreviewSource } from '@/engine/presetThumbs';
import { leafPaths } from '@/lib/schema/adjustments';
import type { Preset } from '@/lib/schema/preset';
import { Wordmark } from './GalleryScreen';

export default function PresetLibraryScreen() {
  const user = usePresets((s) => s.user);
  const load = usePresets((s) => s.load);
  const showToast = useEditor((s) => s.showToast);
  const file = useRef<HTMLInputElement>(null);
  const [detail, setDetail] = useState<Preset | null>(null);
  const [report, setReport] = useState<{ added: number; warnings: string[]; rejected: number } | null>(null);

  useEffect(() => {
    void load();
    // No photo on this screen: previews use the built-in test scene.
    void setPreviewSource(null, null);
  }, [load]);

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <header className="mx-auto flex h-14 w-full max-w-7xl shrink-0 items-center gap-3 px-4 sm:px-8">
        <Link to="/" className="rounded-xs p-1.5 text-mute hover:bg-ink-700 hover:text-ivory" aria-label="Back">
          <ArrowLeft size={17} />
        </Link>
        <Wordmark />
        <div className="ml-auto flex gap-2">
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
        </div>
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
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 sm:px-8">
        <div className="shrink-0 pt-4 pb-5">
          <h1 className="font-display text-5xl text-ivory">Preset library</h1>
          <p className="mt-2 max-w-2xl text-sm text-mute">
            Seventy original looks in seven families, plus the presets you save or build from references. Previews here
            use a built-in test scene; in a project they show your photo. All presets are free to use.
          </p>
        </div>
        <div className="min-h-0 flex-1 pb-6">
          <PresetBrowser variant="page" onApply={setDetail} actionVerb="View" />
        </div>
      </main>

      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="space-y-3 p-4 text-sm">
            <p className="text-xs tracking-wide text-faint uppercase">{ALL_CATEGORY_LABELS[detail.category]}</p>
            {detail.description && <p className="leading-relaxed text-ivory-dim">{detail.description}</p>}
            {detail.reference && (
              <div className="rounded-sm border border-line-soft p-3">
                <div className="flex gap-3">
                  {detail.reference.thumbnail && <img src={detail.reference.thumbnail} alt="Reference" className="h-20 w-auto rounded-xs" />}
                  <div>
                    <p className="text-xs text-mute">From a reference · {detail.reference.confidence} confidence · {detail.reference.aiInterpretation ? 'AI + measurements' : 'measurements only'}</p>
                    <div className="mt-2 flex h-4 overflow-hidden rounded-[2px]">
                      {detail.reference.palette.map((c) => (
                        <span key={c} className="flex-1" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </div>
                {detail.reference.notes.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-mute">
                    {detail.reference.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-xs text-mute">Sets {leafPaths(detail.adjustments).length} controls: {[...new Set(leafPaths(detail.adjustments).map((p) => p.split('.')[0]))].join(', ')}.</p>
            <p className="text-xs text-faint">Open a project and pick this preset from the Presets panel to apply it.</p>
          </div>
        )}
      </Dialog>
      <Dialog open={!!report} onClose={() => setReport(null)} title="Import finished">
        {report && (
          <div className="space-y-2 p-4 text-sm text-mute">
            <p className="text-ivory">
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
