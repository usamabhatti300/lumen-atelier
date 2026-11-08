/** Main editor: top bar, presets/photos panel, canvas, adjustment panels, filmstrip. */
import { AnimatePresence, motion } from 'motion/react';
import { Layers, Palette, SlidersHorizontal, SwatchBook, Blend, X } from 'lucide-react';
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
import { FocusTools } from '@/features/editor/panels/FocusTools';
import { selectRightTab } from '@/features/editor/rightTabs';
import { Histogram } from '@/features/editor/Histogram';
import { Viewport } from '@/features/editor/Viewport';
import { Filmstrip } from '@/features/editor/Filmstrip';
import { LookReadout } from '@/features/editor/LookReadout';
import { PasteDialog } from '@/features/editor/PasteDialog';
import { useShortcuts } from '@/features/editor/useShortcuts';
import { ExportDialog } from '@/features/export/ExportDialog';
import { Progress } from '@/components/ui/misc';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { tick } from '@/lib/haptics';

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
  // Phones and tablets: a fresh photo opens with the looks strip showing, so the first step is
  // obvious (try a look) and nothing is hidden behind the dock. Once per visit to the editor.
  const ready = !!loadedId && loadedId === projectId;
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);
  if (ready && !desktop && autoOpenedFor !== loadedId) {
    // Adjusting state while rendering (React's pattern for "when X changes"), once per project.
    setAutoOpenedFor(loadedId);
    if (!useEditor.getState().edit.appliedPreset) setSheet('presets');
  }

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

  if (!ready) {
    return <div className="h-full bg-ground" />;
  }

  return (
    <div
      className="screen-enter flex h-full flex-col bg-ground"
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
                  className="shrink-0 overflow-hidden border-r border-line-soft bg-ground"
                  aria-label="Presets and photos"
                >
                  <div className="h-full w-[284px]">
                    <LeftPanel onOpenReference={() => setReference(true)} />
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
            <main className="theme-frame relative flex min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                <Viewport onImport={openImport} />
              </div>
              <LookReadout />
            </main>
            <AnimatePresence initial={false}>
              {rightOpen && (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 320, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="shrink-0 overflow-hidden border-l border-line-soft bg-ground"
                  aria-label="Adjustments"
                >
                  <div className="h-full w-[320px]">
                    <RightPanel />
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </>
        ) : (
          <>
            <main className="theme-frame relative flex min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                <Viewport onImport={openImport} />
              </div>
              <LookReadout />
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
          {!sheet && <Filmstrip onImport={openImport} compact />}
          <CompactNav sheet={sheet} setSheet={setSheet} onOpenReference={() => setReference(true)} />
        </>
      )}

      {importing && (
        <div className="surface-float fixed top-16 left-1/2 z-50 w-72 -translate-x-1/2 rounded-lg p-3.5 shadow-float" role="status">
          <p className="tabular mb-2 text-xs text-fg-3">
            Importing {importing.done} of {importing.total}…
          </p>
          <Progress value={importing.done / importing.total} label="Import progress" />
        </div>
      )}
      {dragOver && !referenceOpen && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/70 bg-black/75 backdrop-blur-md">
          <p className="display text-4xl text-fg">
            Drop to <span className="voice text-accent">add</span> photos
          </p>
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

/** Tablet/mobile: a floating dock. Each item opens a panel docked under (or beside) the photo. */
function CompactNav({ sheet, setSheet, onOpenReference }: { sheet: Sheet | null; setSheet: (s: Sheet | null) => void; onOpenReference: () => void }) {
  const isMore = sheet !== null && sheet !== 'presets' && sheet !== 'adjust' && sheet !== 'color';
  // A tab bar: tapping the open tab keeps it (close with ×, a drag down, or Escape).
  const open = (id: Sheet) => {
    if (sheet === id || (id === 'masks' && isMore)) return;
    if (id !== 'presets') selectRightTab(id);
    tick();
    setSheet(id);
  };
  return (
    <div className="shrink-0 bg-ground px-3 pt-2 pb-[max(env(safe-area-inset-bottom),10px)] land:pt-1 land:pb-[max(env(safe-area-inset-bottom),6px)]">
      <nav className="surface-float mx-auto flex h-[68px] max-w-lg items-stretch rounded-[26px] px-1 shadow-float land:h-12 land:rounded-full" aria-label="Editing tools">
        <CompactTab active={sheet === 'presets'} onClick={() => open('presets')} icon={SwatchBook} label="Looks" />
        <CompactTab active={sheet === 'adjust'} onClick={() => open('adjust')} icon={SlidersHorizontal} label="Light" />
        {/* The featured action, not a tab: a lilac lens with its afterimage, so it never reads as the selected tab. */}
        <button type="button" onClick={onOpenReference} className="group flex flex-1 flex-col items-center justify-center gap-1">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-accent land:h-9 land:w-9 text-on-accent shadow-offset-sm transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-90">
            <Blend size={18} strokeWidth={2.2} />
          </span>
          <span className="text-[11px] font-medium text-fg land:sr-only">Match look</span>
        </button>
        <CompactTab active={sheet === 'color'} onClick={() => open('color')} icon={Palette} label="Colour" />
        <CompactTab active={isMore} onClick={() => open('masks')} icon={Layers} label="More" />
      </nav>
    </div>
  );
}

/** Sheets with a compact view that sizes itself: the preset strip and the one-slider tools. */
const focusable = (s: Sheet) => s === 'presets' || s === 'adjust' || s === 'color';

const SHEET_TITLE: Partial<Record<Sheet, string>> = { presets: 'Looks', adjust: 'Light', color: 'Colour' };

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
          // Keep the photo the hero: presets, Light and Colour get compact content-sized views (a
          // strip, or one slider at a time); other tools a short sheet. Drag the handle up for everything.
          animate={side ? { width: 'min(320px, 46vw)' } : { height: tall ? '64dvh' : focusable(sheet) ? 'auto' : '40dvh' }}
          exit={side ? { width: 0 } : { height: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 40, mass: 0.9 }}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          className={`flex shrink-0 flex-col overflow-hidden bg-raised ${side ? 'rounded-l-xl border-l border-line-soft' : 'rounded-t-xl border-t border-line-soft shadow-[0_-20px_40px_-20px_rgb(0_0_0/0.8)]'}`}
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
              className="flex h-6 w-full shrink-0 touch-none items-center justify-center"
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
              <span className="h-1 w-10 rounded-full bg-fg/25" />
            </button>
          )}
          {sheet !== 'presets' && (
            <div className={`flex h-11 shrink-0 items-center justify-between gap-2 pr-2 pl-4 ${inner}`}>
              {SHEET_TITLE[sheet] ? (
                <span className="display text-[19px] text-fg">{SHEET_TITLE[sheet]}</span>
              ) : (
                <MoreTabs
                  value={sheet as RightTab}
                  onChange={(t) => {
                    selectRightTab(t);
                    setSheet(t);
                  }}
                />
              )}
              <button type="button" aria-label="Close panel" onClick={close} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-control text-fg-2 transition-transform active:scale-90 coarse:h-11 coarse:w-11">
                <X size={16} />
              </button>
            </div>
          )}
          <div className={`scroll-quiet min-h-0 flex-1 overscroll-contain ${sheet === 'presets' ? 'flex flex-col' : 'overflow-y-auto'} ${inner}`}>
            {sheet === 'presets' ? (
              <LeftPanel compact expanded={expanded} onClose={close} onOpenReference={() => undefined} />
            ) : (
              <>
                {/* Full histogram costs ~110 px; the short sheet gets a slim one. */}
                {sheet === 'adjust' && <Histogram slim={!expanded || side} />}
                {!expanded && (sheet === 'adjust' || sheet === 'color') ? (
                  <FocusTools tab={sheet} onExpand={() => setTall(true)} />
                ) : (
                  <PanelContent tab={sheet} />
                )}
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
    <div className="no-scrollbar -ml-1 flex min-w-0 gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)} aria-pressed={value === t.id} className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${value === t.id ? 'bg-fg text-ground' : 'text-fg-3 hover:text-fg'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function CompactTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof SwatchBook; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-200 active:scale-95 ${active ? 'text-fg' : 'text-fg-3'}`}
    >
      {active && (
        <motion.span
          layoutId="compact-tab-indicator"
          className="absolute inset-x-1 inset-y-1.5 rounded-[20px] bg-white/[0.07]"
          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
        />
      )}
      <Icon size={20} strokeWidth={active ? 2.1 : 1.7} className={`relative transition-colors ${active ? 'text-accent' : ''}`} />
      <span className="relative text-[11px] font-medium land:sr-only">{label}</span>
    </button>
  );
}
