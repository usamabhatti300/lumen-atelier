import { useEffect } from 'react';
import { cancelCrop } from './panels/GeometryPanel';
import { useEditor } from '@/state/editorStore';
import { saveNow } from '@/engine/autosave';

/** Global editor keyboard shortcuts (ignored while typing in inputs). */
export function useShortcuts({ onImport, onPaste }: { onImport: () => void; onPaste: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (document.querySelector('[role="dialog"]')) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'y' && !typing) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        void saveNow();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        onImport();
        return;
      }
      if (mod && e.shiftKey && key === 'c' && !typing) {
        e.preventDefault();
        s.copyAdjustments();
        return;
      }
      if (mod && e.shiftKey && key === 'v' && !typing && s.clipboard) {
        e.preventDefault();
        onPaste();
        return;
      }
      if (typing || mod || e.altKey) return;
      switch (e.key) {
        case 'y':
          s.setUi({ compare: s.compare === 'split' ? 'off' : 'split' });
          break;
        case '\\':
          s.toggleAdjustmentsVisible();
          break;
        case '0':
          s.setUi({ zoom: 'fit' });
          break;
        case '1':
          s.setUi({ zoom: 1 });
          break;
        case 'c':
          s.setUi({ tool: s.tool === 'crop' ? 'none' : 'crop', rightTab: 'geometry' });
          break;
        case 'b':
          if (s.activeLayerId) s.setUi({ tool: s.tool === 'brush' ? 'none' : 'brush' });
          break;
        case 'j':
          s.setUi({ tool: s.tool === 'heal' ? 'none' : 'heal', rightTab: 'portrait' });
          break;
        case 'e':
          s.setUi({ tool: s.tool === 'remove' ? 'none' : 'remove', rightTab: 'remove' });
          break;
        case '[':
          s.setBrush({ size: Math.max(0.002, s.brush.size / 1.15) });
          break;
        case ']':
          s.setBrush({ size: Math.min(0.4, s.brush.size * 1.15) });
          break;
        case 'Escape':
          // Escape in the crop tool discards the crop changes made since it opened.
          if (s.tool === 'crop') cancelCrop();
          s.setUi({ tool: 'none', compare: 'off' });
          break;
        case 'ArrowRight':
        case 'ArrowLeft': {
          if (t && t.closest('[role="slider"], input[type="range"]')) return;
          const i = s.photos.findIndex((p) => p.id === s.activePhotoId);
          const next = s.photos[i + (e.key === 'ArrowRight' ? 1 : -1)];
          if (next) s.setActivePhoto(next.id);
          break;
        }
        default:
          return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onImport, onPaste]);
}
