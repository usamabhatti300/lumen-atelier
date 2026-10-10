import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { useEditor } from '@/state/editorStore';

/** Bottom filmstrip styled like a negative strip, with frame numbers in the rebate. */
export function Filmstrip({ onImport }: { onImport: () => void }) {
  const photos = useEditor((s) => s.photos);
  const activeId = useEditor((s) => s.activePhotoId);
  const setActive = useEditor((s) => s.setActivePhoto);
  if (photos.length === 0) return null;
  return (
    <nav aria-label="Filmstrip" className="shrink-0 border-t border-line-soft bg-ink-950">
      <div className="edge-code flex h-3.5 items-center gap-6 overflow-hidden px-3 opacity-70" aria-hidden>
        {photos.map((p, i) => (
          <span key={p.id} className="shrink-0">
            ▸ {String(i + 1).padStart(2, '0')}A
          </span>
        ))}
      </div>
      <ul className="scroll-quiet flex h-[68px] items-center gap-1.5 overflow-x-auto px-3 pb-2">
        {photos.map((p, i) => (
          <motion.li key={p.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.02 }} className="shrink-0">
            <button
              type="button"
              onClick={() => setActive(p.id)}
              aria-current={p.id === activeId ? 'true' : undefined}
              aria-label={`Open ${p.name}`}
              className={`relative block h-[52px] overflow-hidden rounded-[2px] transition-[box-shadow,opacity] ${
                p.id === activeId ? 'opacity-100 ring-2 ring-amber' : 'opacity-60 ring-1 ring-line-soft hover:opacity-100'
              }`}
              style={{ width: Math.max(40, Math.min(92, (52 * p.width) / p.height)) }}
            >
              <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            </button>
          </motion.li>
        ))}
        <li className="shrink-0">
          <button type="button" onClick={onImport} aria-label="Add photos" className="flex h-[52px] w-11 items-center justify-center rounded-[2px] border border-dashed border-line text-faint hover:border-line-strong hover:text-ivory">
            <Plus size={16} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
