import {
  ClipboardCopy,
  ClipboardPaste,
  Columns2,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Maximize,
  PanelLeft,
  PanelRight,
  Redo2,
  RotateCcw,
  Save,
  SplitSquareHorizontal,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IconButton, Button } from '@/components/ui/Button';
import { Wordmark } from '@/screens/GalleryScreen';
import { useEditor, type CompareMode } from '@/state/editorStore';
import { saveNow } from '@/engine/autosave';
import { useExportDialog } from '@/features/export/ExportDialog';

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
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line-soft bg-ink-900 px-2 sm:px-3">
      <Wordmark compact />
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
        className="ml-2 hidden h-7 w-44 truncate rounded-xs border border-transparent bg-transparent px-1.5 text-[13px] text-ivory-dim outline-none hover:border-line focus:border-amber/60 md:block"
      />
      <SaveIndicator state={saveState} />

      <div className="mx-auto flex items-center gap-0.5">
        <IconButton label="Toggle left panel" active={leftOpen} onClick={() => setUi({ leftOpen: !leftOpen })} className="hidden lg:inline-flex">
          <PanelLeft size={16} />
        </IconButton>
        <IconButton label="Import photos" shortcut={`${mod}+O`} onClick={onImport}>
          <ImagePlus size={16} />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-line-soft" />
        <IconButton label={undoLabel ? `Undo ${undoLabel}` : 'Undo'} shortcut={`${mod}+Z`} disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label={redoLabel ? `Redo ${redoLabel}` : 'Redo'} shortcut={`${mod}+⇧+Z`} disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </IconButton>
        <span className="mx-1 hidden h-5 w-px bg-line-soft sm:block" />
        <IconButton label="Before / after split" shortcut="Y" active={compare === 'split'} disabled={disabled} onClick={() => setCompare('split')}>
          <SplitSquareHorizontal size={16} />
        </IconButton>
        <IconButton label="Side by side" active={compare === 'side'} disabled={disabled} onClick={() => setCompare('side')} className="hidden sm:inline-flex">
          <Columns2 size={16} />
        </IconButton>
        <IconButton label={visible ? 'Hide adjustments' : 'Show adjustments'} shortcut="\\" active={!visible} disabled={disabled} onClick={toggleVisible} className="hidden sm:inline-flex">
          {visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </IconButton>
        <span className="mx-1 hidden h-5 w-px bg-line-soft sm:block" />
        <IconButton label="Fit to screen" shortcut="0" active={zoom === 'fit'} disabled={disabled} onClick={() => setUi({ zoom: 'fit' })} className="hidden sm:inline-flex">
          <Maximize size={15} />
        </IconButton>
        <IconButton label="Actual size (100%)" shortcut="1" active={zoom === 1} disabled={disabled} onClick={() => setUi({ zoom: 1 })} className="hidden sm:inline-flex">
          <ZoomIn size={16} />
        </IconButton>
        <span className="tabular hidden w-11 text-center text-[11px] text-faint sm:block">{zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
        <span className="mx-1 hidden h-5 w-px bg-line-soft md:block" />
        <IconButton label="Copy settings" shortcut={`${mod}+⇧+C`} disabled={disabled} onClick={copy} className="hidden md:inline-flex">
          <ClipboardCopy size={15} />
        </IconButton>
        <IconButton label="Paste settings" shortcut={`${mod}+⇧+V`} disabled={disabled || !hasClipboard} onClick={onPaste} className="hidden md:inline-flex">
          <ClipboardPaste size={15} />
        </IconButton>
        <IconButton label="Reset all edits" disabled={disabled} onClick={resetAll} className="hidden md:inline-flex">
          <RotateCcw size={15} />
        </IconButton>
        <IconButton label="Toggle right panel" active={rightOpen} onClick={() => setUi({ rightOpen: !rightOpen })} className="hidden lg:inline-flex">
          <PanelRight size={16} />
        </IconButton>
      </div>

      <IconButton label="Save now" shortcut={`${mod}+S`} onClick={() => void saveNow()} className="hidden sm:inline-flex">
        <Save size={16} />
      </IconButton>
      <Button variant="primary" size="sm" icon={<Download size={14} />} disabled={disabled} onClick={() => activePhotoId && openExport([activePhotoId])} data-testid="export-open">
        <span className="hidden sm:inline">Export</span>
      </Button>
    </header>
  );
}

function SaveIndicator({ state }: { state: string }) {
  const label = state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : 'Unsaved';
  return (
    <span className="ml-1 hidden items-center gap-1.5 text-[11px] text-faint sm:flex" role="status" aria-live="polite" data-testid="save-state">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={`h-1.5 w-1.5 rounded-full ${state === 'saved' ? 'bg-verdigris' : state === 'error' ? 'bg-safelight' : 'bg-amber'}`}
        />
      </AnimatePresence>
      {label}
    </span>
  );
}
