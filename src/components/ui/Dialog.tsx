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
          className={`fixed inset-0 z-[80] flex justify-center sm:items-center sm:p-6 ${fullscreen ? 'items-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : 'items-end px-2 pb-[max(env(safe-area-inset-bottom),8px)] sm:pb-6'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/75"
            onClick={dismissible ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={!labelledBy && typeof title === 'string' ? title : undefined}
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }}
            className={`relative flex max-h-full w-full min-w-0 flex-col overflow-hidden border border-line bg-raised shadow-float ${
              fullscreen ? 'h-full sm:h-[min(860px,100%)] sm:max-w-6xl sm:rounded-xl' : `${width} max-h-[92dvh] rounded-xl`
            }`}
          >
            {title !== undefined && (
              <header className="flex h-16 shrink-0 items-center justify-between px-5">
                <h2 id={labelledBy} className="display text-[1.45rem] text-fg">
                  {title}
                </h2>
                {dismissible && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-control text-fg-2 transition-transform hover:bg-control-2 hover:text-fg active:scale-90"
                  >
                    <X size={16} />
                  </button>
                )}
              </header>
            )}
            <div className="scroll-quiet min-h-0 flex-1 overflow-auto">{children}</div>
            {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line-soft px-5 py-4">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
