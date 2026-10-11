import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Modal dialog with focus management: focuses the first control, traps Tab,
 * closes on Escape, and restores focus to the opener.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  footer,
  dismissible = true,
  fullscreen = false,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
  dismissible?: boolean;
  fullscreen?: boolean;
  labelledBy?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>(
        '[data-autofocus], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-[80] flex items-center justify-center sm:p-6 ${fullscreen ? 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : 'p-3'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-ink-950/75 backdrop-blur-[2px]"
            onClick={dismissible ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={!labelledBy && typeof title === 'string' ? title : undefined}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className={`relative flex max-h-full w-full min-w-0 flex-col overflow-hidden border border-line bg-ink-850 shadow-float ${
              fullscreen ? 'h-full sm:h-[min(860px,100%)] sm:max-w-6xl sm:rounded-md' : `${width} rounded-md`
            }`}
          >
            {title !== undefined && (
              <header className="flex h-12 shrink-0 items-center justify-between border-b border-line-soft px-4">
                <h2 id={labelledBy} className="font-display text-xl leading-none text-ivory">
                  {title}
                </h2>
                {dismissible && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-xs p-1.5 text-mute hover:bg-ink-700 hover:text-ivory"
                  >
                    <X size={16} />
                  </button>
                )}
              </header>
            )}
            <div className="scroll-quiet min-h-0 flex-1 overflow-auto">{children}</div>
            {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line-soft px-4 py-3">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
