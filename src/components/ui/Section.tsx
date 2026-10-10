import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export function Section({
  title,
  children,
  defaultOpen = true,
  onReset,
  modified,
  aside,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onReset?: () => void;
  modified?: boolean;
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line-soft">
      <div className="flex h-9 items-center gap-1 px-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold tracking-[0.12em] text-ivory-dim uppercase hover:text-ivory"
        >
          <ChevronRight
            size={12}
            className={`text-faint transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          />
          {title}
          {modified && <span className="ml-1 h-1 w-1 rounded-full bg-amber" aria-label="modified" />}
        </button>
        {aside}
        {onReset && modified && (
          <button
            type="button"
            onClick={onReset}
            aria-label={`Reset ${title}`}
            title={`Reset ${title}`}
            className="rounded-xs p-1 text-faint hover:bg-ink-700 hover:text-ivory"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pt-0.5 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
