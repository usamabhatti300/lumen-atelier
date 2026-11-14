import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { useEditor } from '@/state/editorStore';

/**
 * Bottom filmstrip: the project's photos, the active one glowing lime.
 * `compact` (phones): a shorter strip, and hidden for a single photo, where it only
 * took space from the photo (Add photos is in the top bar).
 */
export function Filmstrip({ onImport, compact = false }: { onImport: () => void; compact?: boolean }) {
  const photos = useEditor((s) => s.photos);
  const activeId = useEditor((s) => s.activePhotoId);
  const setActive = useEditor((s) => s.setActivePhoto);
  if (photos.length === 0 || (compact && photos.length === 1)) return null;
  return (
    <nav aria-label="Filmstrip" className="glass-pane glass-edge-t shrink-0">
      <ul className={`scroll-quiet flex items-center gap-2 overflow-x-auto px-3 ${compact ? 'h-[60px] py-1' : 'h-[72px]'}`}>
        {photos.map((p, i) => (
          <motion.li key={p.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.02 }} className="shrink-0">
            <button
              type="button"
              onClick={() => setActive(p.id)}
              aria-current={p.id === activeId ? 'true' : undefined}
              aria-label={`Open ${p.name}`}
              className={`relative block h-[52px] overflow-hidden rounded-sm transition-[box-shadow,opacity,transform] duration-200 active:scale-95 ${
                p.id === activeId ? 'opacity-100 shadow-selected' : 'opacity-55 ring-1 ring-line hover:opacity-100'
              }`}
              style={{ width: Math.max(40, Math.min(92, (52 * p.width) / p.height)) }}
            >
              <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            </button>
          </motion.li>
        ))}
        <li className="shrink-0">
          <button type="button" onClick={onImport} aria-label="Add photos" className="flex h-[52px] w-12 items-center justify-center rounded-sm border border-dashed border-line text-fg-3 transition-colors hover:border-accent/60 hover:text-accent">
            <Plus size={16} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
