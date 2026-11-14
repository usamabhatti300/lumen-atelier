/**
 * Export dialog: the Finish step first (share format, date stamp, live preview), then format,
 * quality, output size, optional AI upscale, real progress and cancellation.
 */
import { create } from 'zustand';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Check, Download, Share2 } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/misc';
import { Slider } from '@/components/ui/Slider';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { downloadBlob } from '@/state/presetStore';
import { exportContactSheet, exportMany, editFor, stampDateFor, type BatchProgress } from '@/engine/batch';
import { MAX_SHEET_FRAMES, sheetSize, type SheetRatio } from '@/lib/finish/contactSheet';
import type { StampPlacement } from '@/lib/finish/stamp';
import { stampAllowed, type OverlayKind } from '@/lib/finish/overlay';
import { FinishPreview, OverlayControls, SheetControls, StampControls, type FinishMode } from './Finish';
import { exportPlanProblem, plannedRenderSize, upscaleTileCount, type ExportFormat } from '@/engine/exporter';
import { UPSCALE_MODEL_ID } from '@/engine/aiUpscale';
import { installedModelFiles, modelInstallState } from '@/lib/ml/client';
import { getModel, modelBytes } from '@/lib/ml/registry';
import type { UpscaleFactor } from '@/lib/ml/upscale';

export const useExportDialog = create<{ ids: string[] | null; open(ids: string[]): void; close(): void }>((set) => ({
  ids: null,
  open: (ids) => set({ ids }),
  close: () => set({ ids: null }),
}));

const UPSCALES = [
  { value: 'off', label: 'Off' },
  { value: '2', label: '2×', title: 'Twice the width and height' },
  { value: '4', label: '4×', title: 'Four times the width and height' },
] as const;
type UpscaleChoice = (typeof UPSCALES)[number]['value'];

const upscaler = getModel(UPSCALE_MODEL_ID);

/** Up to this many exports are kept for the share sheet on phones; larger batches go straight to downloads. */
const SHARE_MAX_FILES = 10;

/** Phones and tablets that can hand image files to the system share sheet ("Save to Photos", messaging apps). */
function canShareImages(type: string): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !window.matchMedia('(pointer: coarse)').matches) return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'x', { type })] });
  } catch {
    return false;
  }
}

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
  const [upscale, setUpscale] = useState<UpscaleChoice>('off');
  const [modelMissing, setModelMissing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<{ done: number; errors: string[]; cancelled: boolean } | null>(null);
  const [shareFiles, setShareFiles] = useState<File[]>([]);
  const [sizes, setSizes] = useState<{ name: string; w: number; h: number; tiles: number; problem: string | null }[]>([]);
  const ac = useRef<AbortController | null>(null);
  const open = !!ids;
  // Finish step. The stamp is opt-in each time; a contact sheet needs at least two photos.
  const [mode, setMode] = useState<FinishMode>('photo');
  const [stampOn, setStampOn] = useState(false);
  const [placement, setPlacement] = useState<StampPlacement>('bottom-right');
  const [stampDate, setStampDate] = useState<string | null>(null);
  const [ratio, setRatio] = useState<SheetRatio>('4:5');
  const [sheetIds, setSheetIds] = useState<string[]>(() => {
    const pick = ids && ids.length > 1 ? new Set(ids) : null;
    return photos.filter((p) => !pick || pick.has(p.id)).map((p) => p.id).slice(0, MAX_SHEET_FRAMES);
  });
  const canSheet = photos.length >= 2;
  const sheet = mode === 'sheet' && canSheet;
  // The overlay is opt-in each time too, and is left off the contact sheet (it has its own numbering).
  const [overlayKind, setOverlayKind] = useState<OverlayKind>('none');
  const overlay = !sheet && overlayKind !== 'none' ? { kind: overlayKind, date: stampDate } : null;
  // One date at most: the camcorder shows the date itself, so the orange stamp is left out.
  const stamp = stampOn && stampAllowed(overlay?.kind) ? { placement, date: stampDate } : null;

  useEffect(() => {
    if (!ids) return;
    let alive = true;
    const factor: UpscaleFactor | 1 = upscale === 'off' ? 1 : (Number(upscale) as UpscaleFactor);
    void (async () => {
      const list = [];
      for (const id of ids) {
        const meta = photos.find((p) => p.id === id);
        const edit = await editFor(id);
        if (!meta || !edit) continue;
        const r = plannedRenderSize({ width: meta.width, height: meta.height }, edit, Number(scale));
        list.push({
          name: meta.name,
          w: r.width * factor,
          h: r.height * factor,
          tiles: factor === 1 ? 0 : upscaleTileCount(r),
          problem: exportPlanProblem(r, factor),
        });
      }
      if (alive) setSizes(list);
    })();
    return () => {
      alive = false;
    };
  }, [ids, scale, upscale, photos]);

  useEffect(() => {
    if (upscale === 'off') return;
    let alive = true;
    void installedModelFiles().then((files) => {
      const state = modelInstallState(upscaler, files);
      // 'unknown' (no app server, e.g. a static build) is left to the loader, which reports a missing file clearly.
      if (alive) setModelMissing(state === 'missing' || state === 'partial');
    });
    return () => {
      alive = false;
    };
  }, [upscale]);

  const busy = progress !== null && result === null;

  const start = async () => {
    if (!ids) return;
    settings.update({ exportFormat: format, exportQuality: quality });
    ac.current = new AbortController();
    setResult(null);
    setProgress({ index: 0, total: ids.length, name: '', fraction: 0, stage: 'Starting' });
    const aiUpscale = upscale === 'off' ? undefined : (Number(upscale) as UpscaleFactor);
    // On phones, keep the files for the share sheet (Save to Photos) instead of dropping them in Downloads.
    const share = ids.length <= SHARE_MAX_FILES && canShareImages(format);
    const kept: File[] = [];
    const deliver = (file: { name: string; blob: Blob }) => {
      if (share) kept.push(new File([file.blob], file.name, { type: file.blob.type || format }));
      else downloadBlob(file.blob, file.name);
    };
    let r: { done: number; errors: string[]; cancelled: boolean };
    if (sheet) {
      setProgress({ index: 0, total: sheetIds.length + 1, name: '', fraction: 0, stage: 'Starting' });
      const s = await exportContactSheet(sheetIds, { ratio, format, quality, stamp: stamp ?? undefined }, ac.current.signal, setProgress);
      if (s.file) deliver(s.file);
      r = { done: s.file ? 1 : 0, errors: s.errors, cancelled: s.cancelled };
    } else {
      r = await exportMany(ids, { format, quality, scale: aiUpscale ? 1 : Number(scale), aiUpscale, stamp: stamp ?? undefined, overlay: overlay ?? undefined }, ac.current.signal, setProgress, deliver);
    }
    setShareFiles(kept);
    setResult(r);
    if (r.errors.length) showToast(r.errors.join(' '), 'error');
  };

  const ai = upscale !== 'off';
  const problem =
    sizes.find((s) => s.problem)?.problem ??
    (ai && modelMissing ? `The AI upscaler model is not installed. Run "npm run setup:models" in the project folder, then reload.` : undefined);
  const tiles = sizes.reduce((n, s) => n + s.tiles, 0);
  const many = (ids?.length ?? 0) > 1;
  const sheetPx = sheetSize(ratio);

  const first = ids ? photos.find((p) => p.id === ids[0]) : undefined;
  const fraction = progress ? Math.min(1, (progress.index + progress.fraction) / Math.max(1, progress.total)) : 0;
  const finished = !!result && !result.cancelled && result.done > 0;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (busy) ac.current?.abort();
        close();
      }}
      dismissible
      title={sheet ? 'Export contact sheet' : many ? `Export ${ids?.length} photos` : 'Export photo'}
      footer={
        busy ? (
          <Button variant="secondary" onClick={() => ac.current?.abort()}>
            Cancel export
          </Button>
        ) : result && shareFiles.length ? (
          <>
            <Button variant="ghost" onClick={close}>
              Done
            </Button>
            <Button variant="secondary" icon={<Download size={15} />} onClick={() => shareFiles.forEach((f) => downloadBlob(f, f.name))}>
              Download
            </Button>
            <Button
              variant="accent"
              icon={<Share2 size={15} />}
              data-testid="export-share"
              onClick={() =>
                void navigator.share({ files: shareFiles }).catch((e: unknown) => {
                  if (!(e instanceof DOMException && e.name === 'AbortError')) showToast('Sharing failed. Use Download instead.', 'error');
                })
              }
            >
              Save / Share
            </Button>
          </>
        ) : result ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="accent"
              className="min-w-32"
              icon={<Download size={15} />}
              disabled={sheet ? sheetIds.length === 0 : !!problem || sizes.length === 0}
              onClick={() => void start()}
              data-testid="export-start"
            >
              Export
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5 px-5 pb-5">
        {/* Finish: what goes on the exported image, previewed as it will come out. */}
        {!progress && (
          <section aria-label="Finish" className="space-y-3" data-testid="finish">
            <div className="flex items-center justify-between gap-3">
              <h3 className="label-caps text-fg-3">finish</h3>
              {canSheet && (
                <Segmented
                  label="Share format"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'photo', label: many ? 'Photos' : 'This photo' },
                    { value: 'sheet', label: 'Contact sheet', title: 'Several edits on one image, as numbered, dated frames' },
                  ]}
                />
              )}
            </div>
            <FinishPreview mode={sheet ? 'sheet' : 'photo'} photoId={ids?.[0]} sheetIds={sheetIds} stamp={stamp} overlay={overlay} ratio={ratio} />
            {sheet && <SheetControls ratio={ratio} setRatio={setRatio} selected={sheetIds} setSelected={setSheetIds} />}
            {!sheet && <OverlayControls value={overlayKind} onChange={setOverlayKind} />}
            <StampControls
              overlay={overlay?.kind ?? 'none'}
              on={stampOn}
              setOn={setStampOn}
              placement={placement}
              setPlacement={setPlacement}
              date={stampDate}
              setDate={setStampDate}
              shownDate={!sheet && !many && ids?.[0] ? stampDateFor(ids[0], null) : ''}
            />
          </section>
        )}
        {/* What comes out: the photo, its name and the output size. */}
        {sheet ? (
          <p className="flex items-baseline justify-between gap-3 rounded-lg border border-line-soft bg-well px-3 py-2.5 text-[13px]" data-testid="export-size">
            <span className="text-fg">
              Contact sheet · {sheetIds.length} frame{sheetIds.length === 1 ? '' : 's'}
            </span>
            <span className="shrink-0 font-mono text-xs text-fg-3">
              {sheetPx.width} × {sheetPx.height}px
            </span>
          </p>
        ) : (
        <div className="flex items-center gap-3.5 rounded-lg border border-line-soft bg-well p-2.5">
          {/* The Finish preview shows the photo; the thumbnail stays only while exporting (preview hidden). */}
          <div className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-raised-2 ${progress ? '' : 'hidden'}`}>
            {first?.thumbUrl && <img src={first.thumbUrl} alt="" className="h-full w-full object-cover" />}
            {many && (
              <span className="absolute right-1 bottom-1 rounded-full bg-black/70 px-1.5 font-mono text-[11px] text-white">+{(ids?.length ?? 1) - 1}</span>
            )}
          </div>
          <ul className="scroll-quiet max-h-24 min-w-0 flex-1 space-y-1 overflow-auto">
            {sizes.map((s, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]" data-testid="export-size">
                <span className="truncate text-fg">{s.name}</span>
                <span className={`shrink-0 font-mono text-xs ${s.problem ? 'text-danger' : 'text-fg-3'}`}>
                  {s.w} × {s.h}px
                </span>
              </li>
            ))}
            {sizes.length === 0 && <li className="skeleton h-4 w-2/3 rounded-full" aria-hidden />}
          </ul>
        </div>
        )}

        {progress ? (
          <div role="status" aria-live="polite">
            {result ? (
              <ExportFinish result={result} share={shareFiles.length > 0} ok={finished} />
            ) : (
              <div className="py-2">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm text-fg-2">
                    {many && `${progress.index + 1}/${progress.total} · `}
                    {progress.stage}
                  </p>
                  <span className="font-mono text-sm text-accent-fg">{Math.round(fraction * 100)}%</span>
                </div>
                <div
                  className="relative h-1.5 w-full overflow-hidden rounded-full bg-control"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(fraction * 100)}
                  aria-label="Export progress"
                >
                  <div className="spectrum h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${Math.round(fraction * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <Field label="Format" note={format === 'image/jpeg' ? 'Transparent areas are filled with white. Use PNG or WebP to keep transparency.' : undefined}>
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
            </Field>
            {format !== 'image/png' && (
              <Slider label="Quality" value={quality} range={{ min: 40, max: 100, default: 92, step: 1 }} onChange={setQuality} />
            )}
            {!sheet && (
            <>
            <Field label="Size">
              {ai ? (
                <p className="flex h-9 items-center text-[13px] text-fg-2">Full size, then AI upscale</p>
              ) : (
                <Segmented label="Export size" value={scale} onChange={setScale} options={SCALES} />
              )}
            </Field>
            <Field label="AI upscale">
              <Segmented
                label="AI upscale"
                value={upscale}
                onChange={(v) => {
                  setUpscale(v);
                  if (v !== 'off') setScale('1');
                }}
                options={[...UPSCALES]}
              />
              {ai && (
                <p className="mt-2 text-xs leading-relaxed text-fg-3" data-testid="upscale-note">
                  Recovers detail with Real-ESRGAN on this device ({upscaler.licence}, {(modelBytes(upscaler) / 1e6).toFixed(1)} MB model). Runs{' '}
                  {tiles} tile{tiles === 1 ? '' : 's'} after rendering, so it takes longer than a normal export
                  {format !== 'image/jpeg' ? '; transparency is kept' : ''}.
                </p>
              )}
            </Field>
            </>
            )}
            {problem && !sheet && (
              <p className="flex gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-fg" role="alert">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
                {problem}
              </p>
            )}
            <p className="text-xs leading-relaxed text-fg-4">
              Exports are rendered from the original at full resolution, in sRGB. Camera metadata (EXIF, GPS) is not copied
              into exported files.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <p className="label-caps mb-2 text-fg-3">{label}</p>
      {children}
      {note && <p className="mt-2 text-xs leading-relaxed text-fg-4">{note}</p>}
    </div>
  );
}

/** The finish: a check inside a ring of split light springs in, then what happened and where the file went. */
function ExportFinish({ result, share, ok }: { result: { done: number; cancelled: boolean }; share: boolean; ok: boolean }) {
  const files = `${result.done} file${result.done === 1 ? '' : 's'}`;
  return (
    <div className="flex flex-col items-center py-3 text-center">
      <motion.span
        initial={{ scale: 0.4, opacity: 0, rotate: -120 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full p-[3px] ${ok ? '' : 'bg-control-2'}`}
        style={
          ok
            ? { background: 'var(--color-accent)', boxShadow: 'var(--shadow-offset)' }
            : undefined
        }
        aria-hidden
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-raised">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 520, damping: 16 }}>
            <Check size={26} strokeWidth={2.6} className={ok ? 'text-accent' : 'text-fg-3'} />
          </motion.span>
        </span>
      </motion.span>
      <p className="mt-3 max-w-xs text-[15px] font-medium text-fg">
        {result.cancelled
          ? `Cancelled. ${files} saved.`
          : share
            ? `Exported ${files}. Tap Save / Share to save to Photos or send it.`
            : `Exported ${files}. Check your downloads.`}
      </p>
    </div>
  );
}
