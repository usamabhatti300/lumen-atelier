/** Export dialog: format, quality, output size, real progress, cancellation. */
import { create } from 'zustand';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Segmented, Progress } from '@/components/ui/misc';
import { Slider } from '@/components/ui/Slider';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { downloadBlob } from '@/state/presetStore';
import { exportMany, editFor, type BatchProgress } from '@/engine/batch';
import { exportSizeProblem, plannedExportSize, type ExportFormat } from '@/engine/exporter';

export const useExportDialog = create<{ ids: string[] | null; open(ids: string[]): void; close(): void }>((set) => ({
  ids: null,
  open: (ids) => set({ ids }),
  close: () => set({ ids: null }),
}));

const SCALES = [
  { value: '1', label: 'Full size' },
  { value: '0.75', label: '75%' },
  { value: '0.5', label: '50%' },
  { value: '0.25', label: '25%' },
];

export function ExportDialog() {
  const ids = useExportDialog((s) => s.ids);
  // Remount per export request so progress/result state starts fresh.
  return <ExportDialogBody key={ids ? ids.join(',') : 'closed'} ids={ids} />;
}

function ExportDialogBody({ ids }: { ids: string[] | null }) {
  const close = useExportDialog((s) => s.close);
  const photos = useEditor((s) => s.photos);
  const showToast = useEditor((s) => s.showToast);
  const settings = useSettings();
  const [format, setFormat] = useState<ExportFormat>(settings.exportFormat);
  const [quality, setQuality] = useState(settings.exportQuality);
  const [scale, setScale] = useState('1');
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<{ done: number; errors: string[]; cancelled: boolean } | null>(null);
  const [sizes, setSizes] = useState<{ name: string; w: number; h: number; problem: string | null }[]>([]);
  const ac = useRef<AbortController | null>(null);
  const open = !!ids;

  useEffect(() => {
    if (!ids) return;
    let alive = true;
    void (async () => {
      const list = [];
      for (const id of ids) {
        const meta = photos.find((p) => p.id === id);
        const edit = await editFor(id);
        if (!meta || !edit) continue;
        const s = plannedExportSize({ width: meta.width, height: meta.height }, edit, Number(scale));
        list.push({ name: meta.name, w: s.width, h: s.height, problem: exportSizeProblem(s) });
      }
      if (alive) setSizes(list);
    })();
    return () => {
      alive = false;
    };
  }, [ids, scale, photos]);

  const busy = progress !== null && result === null;

  const start = async () => {
    if (!ids) return;
    settings.update({ exportFormat: format, exportQuality: quality });
    ac.current = new AbortController();
    setResult(null);
    setProgress({ index: 0, total: ids.length, name: '', fraction: 0, stage: 'Starting' });
    const r = await exportMany(ids, { format, quality, scale: Number(scale) }, ac.current.signal, setProgress, (file) =>
      downloadBlob(file.blob, file.name),
    );
    setResult(r);
    if (r.errors.length) showToast(r.errors.join(' '), 'error');
  };

  const problem = sizes.find((s) => s.problem)?.problem;
  const many = (ids?.length ?? 0) > 1;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (busy) ac.current?.abort();
        close();
      }}
      dismissible
      title={many ? `Export ${ids?.length} photos` : 'Export photo'}
      footer={
        busy ? (
          <Button variant="secondary" onClick={() => ac.current?.abort()}>
            Cancel export
          </Button>
        ) : result ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!!problem || sizes.length === 0} onClick={() => void start()} data-testid="export-start">
              Export
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 p-4">
        <div>
          <p className="mb-1.5 text-xs text-mute">Format</p>
          <Segmented
            label="Export format"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'image/jpeg', label: 'JPEG' },
              { value: 'image/png', label: 'PNG' },
              { value: 'image/webp', label: 'WebP' },
            ]}
          />
          {format === 'image/jpeg' && <p className="mt-1.5 text-[11px] text-faint">Transparent areas are filled with white. Use PNG or WebP to keep transparency.</p>}
        </div>
        {format !== 'image/png' && (
          <Slider label="Quality" value={quality} range={{ min: 40, max: 100, default: 92, step: 1 }} onChange={setQuality} />
        )}
        <div>
          <p className="mb-1.5 text-xs text-mute">Size</p>
          <Segmented label="Export size" value={scale} onChange={setScale} options={SCALES} />
        </div>
        <ul className="tabular max-h-28 space-y-0.5 overflow-auto text-[11.5px] text-ivory-dim">
          {sizes.map((s, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{s.name}</span>
              <span className={s.problem ? 'text-safelight' : 'text-mute'}>
                {s.w} × {s.h}px
              </span>
            </li>
          ))}
        </ul>
        {problem && <p className="text-xs text-safelight" role="alert">{problem}</p>}
        <p className="text-[11px] leading-relaxed text-faint">
          Exports are rendered from the original at full resolution, in sRGB. Camera metadata (EXIF, GPS) is not copied
          into exported files.
        </p>
        {progress && (
          <div role="status" aria-live="polite">
            {result ? (
              <p className="flex items-center gap-2 text-sm text-ivory">
                <CheckCircle2 size={16} className="text-verdigris" />
                {result.cancelled
                  ? `Cancelled. ${result.done} file${result.done === 1 ? '' : 's'} saved.`
                  : `Exported ${result.done} file${result.done === 1 ? '' : 's'}. Check your downloads.`}
              </p>
            ) : (
              <>
                <p className="mb-1.5 truncate text-xs text-mute">
                  {many && `${progress.index + 1}/${progress.total} · `}
                  {progress.stage}
                </p>
                <Progress value={(progress.index + progress.fraction) / progress.total} label="Export progress" />
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
