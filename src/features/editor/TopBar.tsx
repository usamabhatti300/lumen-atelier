import {
  ChevronLeft,
  ClipboardCopy,
  ClipboardPaste,
  Columns2,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Maximize,
  MoreVertical,
  Pencil,
  PanelLeft,
  PanelRight,
  Redo2,
  RotateCcw,
  Save,
  SplitSquareHorizontal,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router';
import { IconButton, Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/Wordmark';
import { useEditor, type CompareMode } from '@/state/editorStore';
import { saveNow } from '@/engine/autosave';
import { useExportDialog } from '@/features/export/ExportDialog';
import { useMediaQuery } from '@/lib/useMediaQuery';

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export function TopBar({ onImport, onPaste }: { onImport: () => void; onPaste: () => void }) {
  const projectName = useEditor((s) => s.projectName);
  const setProjectName = useEditor((s) => s.setProjectName);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const undoLabel = useEditor((s) => s.history.past[s.history.past.length - 1]?.label);
  const redoLabel = useEditor((s) => s.history.future[0]?.label);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const compare = useEditor((s) => s.compare);
  const zoom = useEditor((s) => s.zoom);
  const setUi = useEditor((s) => s.setUi);
  const saveState = useEditor((s) => s.saveState);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const visible = useEditor((s) => s.edit.adjustmentsVisible);
  const toggleVisible = useEditor((s) => s.toggleAdjustmentsVisible);
  const copy = useEditor((s) => s.copyAdjustments);
  const hasClipboard = useEditor((s) => !!s.clipboard);
  const resetAll = useEditor((s) => s.resetAll);
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  const openExport = useExportDialog((s) => s.open);
  const [name, setName] = useState<string | null>(null);

  const setCompare = (c: CompareMode) => setUi({ compare: compare === c ? 'off' : c });
  const disabled = !activePhotoId;

  return (
    <>
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-1 border-b border-line-soft bg-ground px-2 pt-[env(safe-area-inset-top)] sm:px-3 lg:h-[52px]">
      <span className="hidden lg:contents">
        <Wordmark compact />
      </span>
      {/* Phones and tablets: a plain back button says "leave the editor" better than the logo. */}
      <Link
        to="/"
        aria-label="Back to all edits"
        className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg transition-transform active:scale-90 lg:hidden"
      >
        <ChevronLeft size={22} strokeWidth={1.8} />
      </Link>
      <input
        aria-label="Project name"
        value={name ?? projectName}
        onFocus={() => setName(projectName)}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name !== null && name.trim()) setProjectName(name.trim().slice(0, 80));
          setName(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="ml-3 hidden h-8 w-44 truncate rounded-full border border-transparent bg-transparent px-3 text-[13px] font-medium text-fg-2 outline-none transition-colors hover:border-line hover:bg-raised focus:border-accent/60 focus:bg-raised lg:block"
      />
      <SaveIndicator state={saveState} />

      {/* Phones: back · undo · redo, then ⋮ and Export on the right (everything else lives in ⋮). */}
      <div className="flex items-center gap-0.5 lg:mx-auto lg:rounded-full lg:bg-raised lg:p-1 lg:ring-1 lg:ring-line-soft">
        <IconButton label="Toggle left panel" active={leftOpen} onClick={() => setUi({ leftOpen: !leftOpen })} className="hidden lg:inline-flex">
          <PanelLeft size={16} />
        </IconButton>
        <IconButton label="Import photos" shortcut={`${mod}+O`} onClick={onImport} className="hidden lg:inline-flex">
          <ImagePlus size={16} />
        </IconButton>
        <span className="mx-1 hidden h-5 w-px bg-line lg:block" />
        <IconButton label={undoLabel ? `Undo ${undoLabel}` : 'Undo'} shortcut={`${mod}+Z`} disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label={redoLabel ? `Redo ${redoLabel}` : 'Redo'} shortcut={`${mod}+⇧+Z`} disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </IconButton>
        <span className="mx-1 hidden h-5 w-px bg-line md:block" />
        <IconButton label="Before / after split" shortcut="Y" active={compare === 'split'} disabled={disabled} onClick={() => setCompare('split')} className="hidden md:inline-flex">
          <SplitSquareHorizontal size={16} />
        </IconButton>
        <IconButton label="Side by side" active={compare === 'side'} disabled={disabled} onClick={() => setCompare('side')} className="hidden md:inline-flex">
          <Columns2 size={16} />
        </IconButton>
        <IconButton label={visible ? 'Hide adjustments' : 'Show adjustments'} shortcut="\\" active={!visible} disabled={disabled} onClick={toggleVisible} className="hidden md:inline-flex">
          {visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </IconButton>
        <span className="mx-1 hidden h-5 w-px bg-line md:block" />
        <IconButton label="Fit to screen" shortcut="0" active={zoom === 'fit'} disabled={disabled} onClick={() => setUi({ zoom: 'fit' })} className="hidden md:inline-flex">
          <Maximize size={15} />
        </IconButton>
        <IconButton label="Actual size (100%)" shortcut="1" active={zoom === 1} disabled={disabled} onClick={() => setUi({ zoom: 1 })} className="hidden md:inline-flex">
          <ZoomIn size={16} />
        </IconButton>
        <span className="hidden w-11 text-center font-mono text-[11px] text-fg-3 md:block">{zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
        <span className="mx-1 hidden h-5 w-px bg-line lg:block" />
        <IconButton label="Copy settings" shortcut={`${mod}+⇧+C`} disabled={disabled} onClick={copy} className="hidden lg:inline-flex">
          <ClipboardCopy size={15} />
        </IconButton>
        <IconButton label="Paste settings" shortcut={`${mod}+⇧+V`} disabled={disabled || !hasClipboard} onClick={onPaste} className="hidden lg:inline-flex">
          <ClipboardPaste size={15} />
        </IconButton>
        <IconButton label="Reset all edits" disabled={disabled} onClick={resetAll} className="hidden lg:inline-flex">
          <RotateCcw size={15} />
        </IconButton>
        <IconButton label="Toggle right panel" active={rightOpen} onClick={() => setUi({ rightOpen: !rightOpen })} className="hidden lg:inline-flex">
          <PanelRight size={16} />
        </IconButton>
      </div>

      <span className="flex-1 lg:hidden" />
      <CompactMenu onPaste={onPaste} onImport={onImport} />
      <IconButton label="Save now" shortcut={`${mod}+S`} onClick={() => void saveNow()} className="hidden sm:inline-flex">
        <Save size={16} />
      </IconButton>
      <Button variant="primary" size="sm" icon={<Download size={15} className="hidden lg:block" />} disabled={disabled} onClick={() => activePhotoId && openExport([activePhotoId])} data-testid="export-open" className="ml-1 h-9 px-3 sm:px-4 coarse:h-10">
        Export
      </Button>
    </header>
    </>
  );
}

/**
 * Phones and tablets: every top-bar action that is hidden at this width, in one menu
 * (rename, save, compare modes, zoom, copy / paste / reset settings).
 */
function CompactMenu({ onPaste, onImport }: { onPaste: () => void; onImport: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const narrow = !useMediaQuery('(min-width: 768px)');
  const projectName = useEditor((s) => s.projectName);
  const setProjectName = useEditor((s) => s.setProjectName);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const compare = useEditor((s) => s.compare);
  const zoom = useEditor((s) => s.zoom);
  const setUi = useEditor((s) => s.setUi);
  const visible = useEditor((s) => s.edit.adjustmentsVisible);
  const toggleVisible = useEditor((s) => s.toggleAdjustmentsVisible);
  const copy = useEditor((s) => s.copyAdjustments);
  const hasClipboard = useEditor((s) => !!s.clipboard);
  const resetAll = useEditor((s) => s.resetAll);
  const disabled = !activePhotoId;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={root} className="relative lg:hidden">
      <IconButton label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreVertical size={16} />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="More actions"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="absolute top-full right-0 z-[70] mt-2 w-64 rounded-lg border border-line bg-raised-2 p-1.5 shadow-float"
          >
            <MenuItem
              icon={<Pencil size={15} />}
              onClick={run(() => {
                const next = window.prompt('Project name', projectName)?.trim();
                if (next) setProjectName(next.slice(0, 80));
              })}
            >
              Rename project
            </MenuItem>
            <MenuItem icon={<Save size={15} />} onClick={run(() => void saveNow())}>
              Save now
            </MenuItem>
            <MenuItem icon={<ImagePlus size={15} />} onClick={run(onImport)}>
              Add photos
            </MenuItem>
            {narrow && (
              <>
                <MenuItem icon={<SplitSquareHorizontal size={15} />} checked={compare === 'split'} disabled={disabled} onClick={run(() => setUi({ compare: compare === 'split' ? 'off' : 'split' }))}>
                  Before / after split
                </MenuItem>
                <MenuItem icon={<Columns2 size={15} />} checked={compare === 'side'} disabled={disabled} onClick={run(() => setUi({ compare: compare === 'side' ? 'off' : 'side' }))}>
                  Side by side
                </MenuItem>
                <MenuItem icon={visible ? <EyeOff size={15} /> : <Eye size={15} />} checked={!visible} disabled={disabled} onClick={run(toggleVisible)}>
                  Hide adjustments
                </MenuItem>
                <MenuItem icon={<Maximize size={15} />} checked={zoom === 'fit'} disabled={disabled} onClick={run(() => setUi({ zoom: 'fit' }))}>
                  Fit to screen
                </MenuItem>
                <MenuItem icon={<ZoomIn size={15} />} checked={zoom === 1} disabled={disabled} onClick={run(() => setUi({ zoom: 1 }))}>
                  Actual size (100%)
                </MenuItem>
              </>
            )}
            <div className="mx-2 my-1.5 h-px bg-line" />
            <MenuItem icon={<ClipboardCopy size={15} />} disabled={disabled} onClick={run(copy)}>
              Copy settings
            </MenuItem>
            <MenuItem icon={<ClipboardPaste size={15} />} disabled={disabled || !hasClipboard} onClick={run(onPaste)}>
              Paste settings
            </MenuItem>
            <MenuItem icon={<RotateCcw size={15} />} disabled={disabled} onClick={run(resetAll)}>
              Reset all edits
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon, children, onClick, disabled, checked }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean; checked?: boolean }) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-fg-2 transition-colors hover:bg-control hover:text-fg disabled:text-fg-4"
    >
      <span className={checked ? 'text-accent-fg' : 'text-fg-3'}>{icon}</span>
      <span className="flex-1">{children}</span>
      {checked && <span className="h-2 w-2 rounded-full bg-accent shadow-offset-sm" aria-hidden />}
    </button>
  );
}

function SaveIndicator({ state }: { state: string }) {
  const label = state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : 'Unsaved';
  return (
    <span className="ml-1 hidden items-center gap-1.5 text-xs text-fg-3 sm:flex" role="status" aria-live="polite" data-testid="save-state">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={`h-1.5 w-1.5 rounded-full ${state === 'saved' ? 'bg-success' : state === 'error' ? 'bg-danger' : 'bg-accent'}`}
        />
      </AnimatePresence>
      {label}
    </span>
  );
}
