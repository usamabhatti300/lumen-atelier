/** Main editor: top bar, presets/photos panel, canvas, adjustment panels, filmstrip. */
import { AnimatePresence, motion } from 'motion/react';
import { Layers, Palette, SlidersHorizontal, SwatchBook, Wand2, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useEditor, type PhotoMeta, type RightTab } from '@/state/editorStore';
import { engine } from '@/engine/controller';
import { initLensBlurAutoload } from '@/features/depth/depthState';
import { startAutosave, saveNow } from '@/engine/autosave';
import { importFiles } from '@/engine/importer';
import { setPreviewSource } from '@/engine/presetThumbs';
import { useEngine } from '@/engine/engineStore';
import { getPhotos, getProject, saveProject } from '@/lib/storage/db';
import type { EditState } from '@/lib/schema/adjustments';
import { TopBar } from '@/features/editor/TopBar';
import { LeftPanel } from '@/features/editor/LeftPanel';
import { RightPanel, PanelContent } from '@/features/editor/RightPanel';
import { selectRightTab } from '@/features/editor/rightTabs';
import { Histogram } from '@/features/editor/Histogram';
import { Viewport } from '@/features/editor/Viewport';
import { Filmstrip } from '@/features/editor/Filmstrip';
import { PasteDialog } from '@/features/editor/PasteDialog';
import { useShortcuts } from '@/features/editor/useShortcuts';
import { ExportDialog } from '@/features/export/ExportDialog';
import { Progress } from '@/components/ui/misc';
import { useMediaQuery } from '@/lib/useMediaQuery';

const ReferenceStudio = lazy(() => import('@/features/reference/ReferenceStudio'));

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export default function EditorScreen() {
  const { projectId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const loadProject = useEditor((s) => s.loadProject);
  const addPhotos = useEditor((s) => s.addPhotos);
  const showToast = useEditor((s) => s.showToast);
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  const loadedId = useEditor((s) => s.projectId);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const referenceOpen = search.get('reference') === '1';
  const fileInput = useRef<HTMLInputElement>(null);
  const desktop = useMediaQuery('(min-width: 1024px)');
  // Phones held sideways: panels go beside the photo instead of under it.
  const landscape = useMediaQuery('(orientation: landscape) and (max-height: 540px)');
  const [sheet, setSheet] = useState<Sheet | null>(null);

  // Load the project.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    engine.init();
    initLensBlurAutoload();
    startAutosave();
    void (async () => {
      const project = await getProject(projectId);
      if (!project) {
        showToast('That project no longer exists.', 'error');
        navigate('/');
        return;
      }
      const records = await getPhotos(projectId);
      const order = new Map(project.photoIds.map((id, i) => [id, i]));
      records.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
      if (cancelled) return;
      const metas: PhotoMeta[] = records.map((r) => ({
        id: r.id,
        name: r.name,
        width: r.width,
        height: r.height,
        byteSize: r.byteSize,
        mime: r.mime,
        exif: r.exif,
        thumbUrl: URL.createObjectURL(r.thumbnail),
      }));
      const edits: Record<string, EditState> = Object.fromEntries(records.map((r) => [r.id, r.edit]));
      loadProject(project.id, project.name, metas, edits, project.activePhotoId);
    })();
    return () => {
      cancelled = true;
      void saveNow();
    };
  }, [projectId, loadProject, navigate, showToast]);

  // Preset previews follow the active photo.
  const previewSize = useEngine((s) => s.previewSize);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  useEffect(() => {
    const bmp = engine.getPreviewBitmap();
    void setPreviewSource(bmp ? engine.getActivePhotoId() : null, bmp);
  }, [previewSize, activePhotoId]);

  const runImport = useCallback(
    async (files: File[]) => {
      const pid = useEditor.getState().projectId;
      if (!pid || !files.length) return;
      setImporting({ done: 0, total: files.length });
      const res = await importFiles(files, pid, (done, total) => setImporting({ done, total }));
      setImporting(null);
      if (res.added.length) {
        addPhotos(res.added, res.edits);
        const project = await getProject(pid);
        if (project) await saveProject({ ...project, photoIds: useEditor.getState().photos.map((p) => p.id), activePhotoId: useEditor.getState().activePhotoId });
      }
      if (res.errors.length) showToast(res.errors.join(' '), 'error');
    },
    [addPhotos, showToast],
  );

  const openImport = useCallback(() => fileInput.current?.click(), []);
  const openPaste = useCallback(() => setPasteOpen(true), []);
  useShortcuts({ onImport: openImport, onPaste: openPaste });

  const setReference = (open: boolean) => {
    const next = new URLSearchParams(search);
    if (open) next.set('reference', '1');
    else next.delete('reference');
    setSearch(next, { replace: true });
  };

  if (!loadedId || loadedId !== projectId) {
    return <div className="h-full bg-ink-900" />;
  }

  return (
    <div
      className="flex h-full flex-col bg-ink-900"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => e.relatedTarget === null && setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!referenceOpen) void runImport([...e.dataTransfer.files]);
      }}
    >
      <TopBar onImport={openImport} onPaste={openPaste} />
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        data-testid="editor-file-input"
        onChange={(e) => {
          void runImport(e.target.files ? [...e.target.files] : []);
          e.target.value = '';
        }}
      />
      <div className="relative flex min-h-0 flex-1">
        {desktop ? (
          <>
            <AnimatePresence initial={false}>
              {leftOpen && (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 284, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="shrink-0 overflow-hidden border-r border-line-soft bg-ink-850"
                  aria-label="Presets and photos"
                >
                  <div className="h-full w-[284px]">
                    <LeftPanel onOpenReference={() => setReference(true)} />
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
            <main className="relative min-w-0 flex-1">
              <Viewport onImport={openImport} />
            </main>
            <AnimatePresence initial={false}>
              {rightOpen && (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 300, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="shrink-0 overflow-hidden border-l border-line-soft bg-ink-850"
                  aria-label="Adjustments"
                >
                  <div className="h-full w-[300px]">
                    <RightPanel />
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </>
        ) : (
          <>
            <main className="relative min-w-0 flex-1">
              <Viewport onImport={openImport} />
            </main>
            {landscape && <CompactSheet sheet={sheet} setSheet={setSheet} side />}
          </>
        )}
      </div>
      {desktop ? (
        <Filmstrip onImport={openImport} />
      ) : (
        <>
          {!landscape && <CompactSheet sheet={sheet} setSheet={setSheet} />}
          {!sheet && <Filmstrip onImport={openImport} />}
          <CompactNav sheet={sheet} setSheet={setSheet} onOpenReference={() => setReference(true)} />
        </>
      )}

      {importing && (
        <div className="fixed top-14 left-1/2 z-50 w-72 -translate-x-1/2 rounded-sm border border-line bg-ink-850 p-3 shadow-float" role="status">
          <p className="tabular mb-2 text-xs text-mute">
            Importing {importing.done} of {importing.total}…
          </p>
          <Progress value={importing.done / importing.total} label="Import progress" />
        </div>
      )}
      {dragOver && !referenceOpen && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-md border-2 border-dashed border-amber/70 bg-ink-950/60">
          <p className="font-display text-3xl text-ivory">Drop to add photos</p>
        </div>
      )}

      <PasteDialog open={pasteOpen} onClose={() => setPasteOpen(false)} />
      <ExportDialog />
      {referenceOpen && (
        <Suspense fallback={null}>
          <ReferenceStudio onClose={() => setReference(false)} onImportTarget={openImport} />
        </Suspense>
      )}
    </div>
  );
}

type Sheet = 'presets' | RightTab;

/** Tablet/mobile: bottom navigation. Each item opens a panel docked under (or beside) the photo. */
function CompactNav({ sheet, setSheet, onOpenReference }: { sheet: Sheet | null; setSheet: (s: Sheet | null) => void; onOpenReference: () => void }) {
  const isMore = sheet !== null && sheet !== 'presets' && sheet !== 'adjust' && sheet !== 'color';
  const open = (id: Sheet) => {
    if (sheet === id || (id === 'masks' && isMore)) return setSheet(null);
    if (id !== 'presets') selectRightTab(id);
    setSheet(id);
  };
  return (
    <nav className="flex shrink-0 items-stretch border-t border-line-soft bg-ink-900 pb-[env(safe-area-inset-bottom)]" aria-label="Editing tools">
      <CompactTab active={sheet === 'presets'} onClick={() => open('presets')} icon={SwatchBook} label="Presets" />
      <CompactTab active={sheet === 'adjust'} onClick={() => open('adjust')} icon={SlidersHorizontal} label="Light" />
      <button type="button" onClick={onOpenReference} className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-amber">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber/15">
          <Wand2 size={15} />
        </span>
        Match look
      </button>
      <CompactTab active={sheet === 'color'} onClick={() => open('color')} icon={Palette} label="Colour" />
      <CompactTab active={isMore} onClick={() => open('masks')} icon={Layers} label="More" />
    </nav>
  );
}

const SHEET_TITLE: Partial<Record<Sheet, string>> = { presets: 'Presets', adjust: 'Light', color: 'Colour' };

/**
 * The open panel: docked under the photo (portrait) or beside it (phone landscape), so edits
 * stay visible. Under the photo it has a grab handle: tap or drag up to expand it (presets then
 * show as a full grid), drag down to shrink or close.
 */
function CompactSheet({ sheet, setSheet, side = false }: { sheet: Sheet | null; setSheet: (s: Sheet | null) => void; side?: boolean }) {
  const [tall, setTall] = useState(false);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const inner = side ? 'w-[min(320px,46vw)]' : '';
  const close = () => {
    setTall(false);
    setSheet(null);
  };
  const expanded = side || tall;
  return (
    <AnimatePresence initial={false}>
      {sheet && (
        <motion.div
          initial={side ? { width: 0 } : { height: 0 }}
          animate={side ? { width: 'min(320px, 46vw)' } : { height: tall ? '78dvh' : '46dvh' }}
          exit={side ? { width: 0 } : { height: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={`flex shrink-0 flex-col overflow-hidden bg-ink-850 ${side ? 'border-l border-line-soft' : 'rounded-t-md border-t border-line shadow-[0_-12px_30px_-12px_rgba(0,0,0,0.6)]'}`}
          role="region"
          aria-label={`${SHEET_TITLE[sheet] ?? 'More'} panel`}
          data-testid="compact-sheet"
          data-expanded={expanded}
        >
          {!side && (
            <button
              type="button"
              aria-label={tall ? 'Shrink panel' : 'Expand panel'}
              aria-expanded={tall}
              className="flex h-5 w-full shrink-0 touch-none items-center justify-center"
              onPointerDown={(e) => {
                drag.current = { y: e.clientY, moved: false };
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d && Math.abs(e.clientY - d.y) > 8) d.moved = true;
              }}
              onPointerUp={(e) => {
                const d = drag.current;
                drag.current = null;
                if (!d) return;
                const dy = e.clientY - d.y;
                if (!d.moved) setTall(!tall);
                else if (dy < -30) setTall(true);
                else if (dy > 30) {
                  if (tall) setTall(false);
                  else close();
                }
              }}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTall(!tall);
                }
              }}
            >
              <span className="h-1 w-10 rounded-full bg-line-strong" />
            </button>
          )}
          {sheet !== 'presets' && (
            <div className={`flex h-10 shrink-0 items-center justify-between gap-2 pr-1 pl-3 ${inner}`}>
              {SHEET_TITLE[sheet] ? (
                <span className="text-[11px] font-semibold tracking-[0.12em] text-ivory-dim uppercase">{SHEET_TITLE[sheet]}</span>
              ) : (
                <MoreTabs
                  value={sheet as RightTab}
                  onChange={(t) => {
                    selectRightTab(t);
                    setSheet(t);
                  }}
                />
              )}
              <button type="button" aria-label="Close panel" onClick={close} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-mute">
                <X size={17} />
              </button>
            </div>
          )}
          <div className={`scroll-quiet min-h-0 flex-1 overscroll-contain ${sheet === 'presets' ? 'flex flex-col' : 'overflow-y-auto'} ${inner}`}>
            {sheet === 'presets' ? (
              <LeftPanel compact expanded={expanded} onClose={close} onOpenReference={() => undefined} />
            ) : (
              <>
                {sheet === 'adjust' && <Histogram />}
                <PanelContent tab={sheet} />
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MoreTabs({ value, onChange }: { value: RightTab; onChange: (t: RightTab) => void }) {
  const tabs: { id: RightTab; label: string }[] = [
    { id: 'detail', label: 'Detail' },
    { id: 'masks', label: 'Masks' },
    { id: 'portrait', label: 'Portrait' },
    { id: 'remove', label: 'Remove' },
    { id: 'geometry', label: 'Crop' },
  ];
  return (
    <div className="scroll-quiet -ml-1 flex min-w-0 gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)} aria-pressed={value === t.id} className={`h-8 shrink-0 rounded-xs px-2.5 text-xs ${value === t.id ? 'bg-champagne text-ink-950' : 'text-mute'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function CompactTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof SwatchBook; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${active ? 'text-ivory' : 'text-faint'}`}>
      <Icon size={17} strokeWidth={1.6} />
      {label}
    </button>
  );
}
