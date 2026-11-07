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
      <div className="flex h-11 items-center gap-1 px-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="label-caps flex flex-1 items-center gap-2 text-left text-fg-3 transition-colors hover:text-fg"
        >
          <ChevronRight
            size={12}
            className={`text-fg-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          />
          {title}
          {modified && <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgb(212_255_63/0.8)]" aria-label="modified" />}
        </button>
        {aside}
        {onReset && modified && (
          <button
            type="button"
            onClick={onReset}
            aria-label={`Reset ${title}`}
            title={`Reset ${title}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-fg-4 transition-transform hover:bg-control hover:text-fg active:-rotate-90"
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
            <div className="px-4 pt-0.5 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
