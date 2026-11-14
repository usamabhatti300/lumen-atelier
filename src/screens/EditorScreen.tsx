/** Main editor: top bar, presets/photos panel, canvas, adjustment panels, filmstrip. */
import { dragHeight, pickDetent } from '@/lib/sheetDetents';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Droplet, Ellipsis, Sun, X } from 'lucide-react';
import { LooksIcon, MatchIcon } from '@/components/icons';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useEditor, type PhotoMeta, type RightTab } from '@/state/editorStore';
import { engine } from '@/engine/controller';
import { initLensBlurAutoload } from '@/features/depth/depthState';
import { startAutosave, saveNow } from '@/engine/autosave';
import { importFiles } from '@/engine/importer';
import { setPreviewSource } from '@/engine/presetThumbs';
import { autoDetectPortrait, cancelPortraitAnalysis } from '@/features/portrait/portraitState';
import { useEngine } from '@/engine/engineStore';
import { getPhotos, getProject, saveProject } from '@/lib/storage/db';
import type { EditState } from '@/lib/schema/adjustments';
import { TopBar } from '@/features/editor/TopBar';
import { LeftPanel } from '@/features/editor/LeftPanel';
import { PhotosPanel } from '@/features/editor/PhotosPanel';
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
import { motionReduced, tick } from '@/lib/haptics';
import { Ambient } from '@/components/fx/Ambient';

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
  // The light behind the chrome follows the photo you are on, not every edit to it (its thumbnail is
  // re-made as you edit; re-fading the light each time would cost frames and change nothing visible).
  const activeThumb = useEditor((s) => s.photos.find((p) => p.id === s.activePhotoId));
  const [ambient, setAmbient] = useState<{ id: string; url: string } | null>(null);
  if (activeThumb && activeThumb.id !== ambient?.id) setAmbient({ id: activeThumb.id, url: activeThumb.thumbUrl });
  const ambientSrc = ambient?.url ?? null;
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
      const project = await getProject(projectId).catch(() => null);
      if (project === null) {
        // Storage is blocked or failed (private browsing, site data off): don't leave a blank editor.
        showToast('This edit could not be opened: the browser is blocking storage for this site.', 'error');
        navigate('/');
        return;
      }
      if (!project) {
        showToast('That edit no longer exists.', 'error');
        navigate('/');
        return;
      }
      const records = await getPhotos(projectId).catch(() => []);
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
    const id = bmp ? engine.getActivePhotoId() : null;
    // The preview bitmap is the photo's original, so its look previews may be kept between visits.
    void setPreviewSource(id, bmp, id ?? undefined);
  }, [previewSize, activePhotoId]);

  // Faces and the person are found in the background once the photo is on screen (roadmap 1.3).
  const loadingPhoto = useEngine((s) => s.loadingPhoto);
  useEffect(() => {
    if (!activePhotoId || loadingPhoto || !previewSize || engine.getActivePhotoId() !== activePhotoId) return;
    return autoDetectPortrait(activePhotoId);
  }, [activePhotoId, loadingPhoto, previewSize]);
  // Leaving a photo stops its detection (its result would be thrown away).
  useEffect(() => {
    if (!activePhotoId) return;
    return () => cancelPortraitAnalysis(activePhotoId, false);
  }, [activePhotoId]);

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
      className="screen-enter relative isolate flex h-full flex-col bg-ground"
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
      {/* The photo's light behind the chrome, kept faint: bars and rails beside a photo you are
          colour-judging must stay close to neutral (audit 2026-11-14). */}
      <Ambient src={ambientSrc} opacity={0.16} className="ambient-quiet -z-10" still />
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
                  className="glass-pane glass-edge-r shrink-0 overflow-hidden"
                  aria-label="Looks and photos"
                >
                  <div className="h-full w-[284px]">
                    <LeftPanel onOpenReference={() => setReference(true)} />
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
            <main className="theme-frame stage-lit relative flex min-w-0 flex-1 flex-col">
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
                  className="glass-pane glass-edge-l shrink-0 overflow-hidden"
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
            <main className="theme-frame stage-lit relative flex min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                <Viewport onImport={openImport} />
                <LookReadout overlay />
              </div>
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

/** `tools`: the More grid, which leads to one of the right-panel tabs. */
type Sheet = 'presets' | 'tools' | 'photos' | RightTab;

/**
 * The dock steps aside while you work directly on the photo or a control: pressing and holding,
 * dragging or pinching the photo, or dragging a slider, curve or wheel. It comes back shortly after
 * you let go. A quick tap never hides it.
 */
function useDockAway() {
  const [away, setAway] = useState(false);
  useEffect(() => {
    let hideTimer = 0;
    let showTimer = 0;
    const WORK = '[data-testid="viewport"], [data-testid="slider-track"], .slider-input, [data-dock-away]';
    const down = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.(WORK)) return;
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setAway(true), 180);
    };
    const up = () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => setAway(false), 650);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(showTimer);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);
  return away;
}

/** Tablet/mobile: a floating dock. Each item opens a panel docked under (or beside) the photo. */
function CompactNav({ sheet, setSheet, onOpenReference }: { sheet: Sheet | null; setSheet: (s: Sheet | null) => void; onOpenReference: () => void }) {
  const isMore = sheet !== null && sheet !== 'presets' && sheet !== 'adjust' && sheet !== 'color';
  // A tab bar: tapping the open tab keeps it (close with ×, a drag down, or Escape).
  const open = (id: Sheet) => {
    if (sheet === id) return;
    // Inside one of More's tools, More goes back to the grid of tools.
    if (id === 'tools' && isMore) {
      tick();
      setSheet('tools');
      return;
    }
    if (id !== 'presets' && id !== 'tools' && id !== 'photos') selectRightTab(id);
    tick();
    setSheet(id);
  };
  const away = useDockAway();
  return (
    // The dock floats a little over the panel above it (glass), and keeps its space when it slides
    // away, so nothing ever moves under your finger.
    <div className="relative z-20 -mt-4 shrink-0 px-3 pt-0 pb-[max(env(safe-area-inset-bottom),10px)] land:-mt-2 land:pb-[max(env(safe-area-inset-bottom),6px)]">
      <motion.nav
        animate={away ? { y: '115%', opacity: 0 } : { y: 0, opacity: 1 }}
        transition={motionReduced() ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38 }}
        style={{ pointerEvents: away ? 'none' : undefined }}
        aria-hidden={away || undefined}
        className="liquid mx-auto flex h-[60px] max-w-lg items-stretch rounded-[26px] px-1 land:h-12 land:rounded-full"
        aria-label="Editing tools"
      >
        <CompactTab active={sheet === 'presets'} onClick={() => open('presets')} icon={LooksIcon} label="Looks" />
        <CompactTab active={sheet === 'adjust'} onClick={() => open('adjust')} icon={Sun} label="Light" />
        {/* The featured action, not a tab: a lilac lens with its afterimage, so it never reads as the selected tab. */}
        <button type="button" onClick={onOpenReference} aria-label="Match look" className="group flex flex-1 items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent shadow-offset transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-90 group-active:shadow-none land:h-9 land:w-9">
            <MatchIcon size={20} strokeWidth={2} />
          </span>
        </button>
        <CompactTab active={sheet === 'color'} onClick={() => open('color')} icon={Droplet} label="Colour" />
        <CompactTab active={isMore} onClick={() => open('tools')} icon={Ellipsis} label="More" />
      </motion.nav>
    </div>
  );
}

/** Sheets with a compact view that sizes itself: the preset strip and the one-slider tools. */
const focusable = (s: Sheet) => s === 'presets' || s === 'adjust' || s === 'color' || s === 'tools';

const SHEET_TITLE: Partial<Record<Sheet, string>> = { presets: 'Looks', adjust: 'Light', color: 'Colour', tools: 'More tools', photos: 'Photos' };

/**
 * The open panel: docked under the photo (portrait) or beside it (phone landscape), so edits
 * stay visible. Under the photo it has a grab handle with detents (roadmap 1.7): the sheet follows
 * your finger and settles on the nearest stop (closed, compact, tall), carried along by a flick.
 * A tap on the handle toggles compact and tall; Enter / Space too.
 */
function CompactSheet({ sheet, setSheet, side = false }: { sheet: Sheet | null; setSheet: (s: Sheet | null) => void; side?: boolean }) {
  const [tall, setTall] = useState(false);
  // Each tool opens at its own compact size: a sheet pulled tall for Light must not leave Crop or
  // Remove working on a thumbnail of the photo.
  const [tallFor, setTallFor] = useState(sheet);
  if (sheet !== tallFor) {
    setTallFor(sheet);
    if (tall) setTall(false);
  }
  const sheetEl = useRef<HTMLDivElement>(null);
  /** Height while the handle is being dragged (px), else null (the sheet sizes itself). */
  const [dragH, setDragH] = useState<number | null>(null);
  const compactH = useRef(0);
  const drag = useRef<{ y: number; h: number; moved: boolean; lastY: number; lastT: number; v: number } | null>(null);
  const tallPx = () => window.innerHeight * 0.64;
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
          animate={side ? { width: 'min(320px, 46vw)' } : { height: dragH ?? (tall ? '64dvh' : focusable(sheet) ? 'auto' : '40dvh') }}
          exit={side ? { width: 0 } : { height: 0 }}
          transition={dragH !== null ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 }}
          ref={sheetEl}
          data-dragging={dragH !== null || undefined}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          className={`glass-pane flex shrink-0 flex-col overflow-hidden ${side ? 'glass-edge-l rounded-l-xl' : 'glass-edge-t rounded-t-xl pb-4 shadow-[0_-20px_40px_-20px_rgb(0_0_0/0.8)]'}`}
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
              className="flex h-6 w-full shrink-0 touch-none items-center justify-center coarse:h-8"
              data-testid="sheet-handle"
              onPointerDown={(e) => {
                const h = sheetEl.current?.getBoundingClientRect().height ?? 0;
                if (!tall) compactH.current = h;
                drag.current = { y: e.clientY, h, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                if (Math.abs(e.clientY - d.y) > 8) d.moved = true;
                const dt = e.timeStamp - d.lastT;
                if (dt > 0) d.v = 0.7 * ((e.clientY - d.lastY) / dt) + 0.3 * d.v;
                d.lastY = e.clientY;
                d.lastT = e.timeStamp;
                if (d.moved) setDragH(dragHeight(d.h, e.clientY - d.y, tallPx()));
              }}
              onPointerUp={(e) => {
                const d = drag.current;
                drag.current = null;
                setDragH(null);
                if (!d) return;
                if (!d.moved) {
                  setTall(!tall);
                  return;
                }
                // A pause before letting go is not a flick.
                const v = e.timeStamp - d.lastT > 80 ? 0 : d.v;
                const h = dragHeight(d.h, e.clientY - d.y, tallPx());
                const compact = compactH.current || window.innerHeight * 0.3;
                const to = pickDetent(h, v, [
                  { key: 'closed', height: 0 },
                  { key: 'compact', height: Math.min(compact, tallPx() - 40) },
                  { key: 'tall', height: tallPx() },
                ]);
                if (to === 'closed') close();
                else setTall(to === 'tall');
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragH(null);
              }}
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
                <span className="flex min-w-0 items-center gap-1">
                  {sheet === 'photos' && (
                    <button type="button" aria-label="All tools" onClick={() => setSheet('tools')} className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-2 active:scale-90 coarse:h-11 coarse:w-11">
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  <h2 className="font-mono text-[13px] font-medium text-fg [font-stretch:100%]">{SHEET_TITLE[sheet]!.toLowerCase()}</h2>
                </span>
              ) : (
                <span className="flex min-w-0 items-center gap-1">
                  <button type="button" aria-label="All tools" onClick={() => setSheet('tools')} className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-2 active:scale-90 coarse:h-11 coarse:w-11">
                    <ChevronLeft size={18} />
                  </button>
                <MoreTabs
                  value={sheet as RightTab}
                  onChange={(t) => {
                    selectRightTab(t);
                    setSheet(t);
                  }}
                />
                </span>
              )}
              <button type="button" aria-label="Close panel" onClick={close} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-3 transition-transform hover:text-fg active:scale-90 coarse:h-11 coarse:w-11">
                <X size={16} />
              </button>
            </div>
          )}
          <div className={`scroll-quiet min-h-0 flex-1 overscroll-contain ${sheet === 'presets' ? 'flex flex-col' : 'overflow-y-auto'} ${inner}`}>
            {sheet === 'presets' ? (
              <LeftPanel compact expanded={expanded} onClose={close} onOpenReference={() => undefined} />
            ) : sheet === 'tools' ? (
              <ToolGrid
                onPick={(t) => {
                  if (t !== 'photos') selectRightTab(t);
                  setSheet(t);
                }}
              />
            ) : sheet === 'photos' ? (
              <PhotosPanel />
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
    // The same order as the More grid.
    { id: 'geometry', label: 'Crop' },
    { id: 'masks', label: 'Masks' },
    { id: 'remove', label: 'Remove' },
    { id: 'portrait', label: 'Portrait' },
    { id: 'effects', label: 'Effects' },
    { id: 'detail', label: 'Detail' },
  ];
  return (
    <div className="no-scrollbar -ml-1 flex min-w-0 gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)} aria-pressed={value === t.id} className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors coarse:h-10 ${value === t.id ? 'bg-fg text-ground' : 'text-fg-3 hover:text-fg'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A dock tab: plain icon and label; the open one is ivory and a touch heavier, the rest recede. */
function CompactTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: (p: { size?: number; strokeWidth?: number }) => React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-200 active:scale-95 ${active ? 'text-fg' : 'text-fg-4'}`}
    >
      <Icon size={20} strokeWidth={active ? 2 : 1.6} />
      <span className={`text-[11.5px] land:sr-only ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </button>
  );
}

/** The More grid: every other tool, named and explained, one tap away. */
const TOOLS: { id: RightTab | 'photos'; label: string; body: string }[] = [
  { id: 'photos', label: 'Photos', body: 'Every photo in this edit' },
  { id: 'geometry', label: 'Crop', body: 'Straighten and frame' },
  { id: 'masks', label: 'Masks', body: 'Select an object or paint an area' },
  { id: 'remove', label: 'Remove', body: "Brush out what you don't want" },
  { id: 'portrait', label: 'Portrait', body: 'Skin, eyes and face light' },
  { id: 'effects', label: 'Effects', body: 'Light leaks, bloom, flare and dust' },
  { id: 'detail', label: 'Detail', body: 'Sharpen and clean up noise' },
  { id: 'detail', label: 'Lens blur', body: 'Soften the background (in Detail)' },
];

function ToolGrid({ onPick }: { onPick: (t: RightTab | 'photos') => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
      {TOOLS.map((t) => (
        <button
          key={t.label}
          type="button"
          aria-label={t.label}
          onClick={() => onPick(t.id)}
          className="glass-card flex min-h-[76px] flex-col items-start gap-1 rounded-md p-3 text-left transition-[background-color,transform] active:scale-[0.98] active:bg-control"
        >
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg">{t.label}</span>
          <span className="text-[12px] leading-snug text-fg-3">{t.body}</span>
        </button>
      ))}
    </div>
  );
}
