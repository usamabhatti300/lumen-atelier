import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useEditor } from '@/state/editorStore';

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 py-2 ${disabled ? 'opacity-50' : ''}`}>
      <span>
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-fg-3">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-6 w-10 rounded-full bg-control-2 transition-colors duration-200 peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-fg" />
        <span className="absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-fg shadow-[0_1px_4px_rgb(0_0_0/0.5)] transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] peer-checked:translate-x-4 peer-checked:bg-on-accent" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'xs';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-well p-[3px] ring-1 ring-line-soft">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`relative rounded-full font-medium transition-colors coarse:px-3.5 ${size === 'xs' ? 'h-7 px-3 text-xs coarse:h-8 coarse:min-w-10' : 'min-h-8 px-3.5 text-[13px] leading-tight coarse:min-h-9 coarse:min-w-10'} ${
            value === o.value ? 'text-ground' : 'text-fg-3 hover:text-fg'
          }`}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${label}`}
              className="absolute inset-0 rounded-full bg-fg"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toasts() {
  const toast = useEditor((s) => s.toast);
  const dismiss = useEditor((s) => s.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismiss, toast.tone === 'error' ? 9000 : 4200);
    return () => window.clearTimeout(t);
  }, [toast, dismiss]);
  const Icon = toast?.tone === 'error' ? AlertTriangle : toast?.tone === 'success' ? CheckCircle2 : Info;
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 sm:bottom-8">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            className={`surface-float pointer-events-auto flex max-w-[min(92vw,520px)] items-start gap-2.5 rounded-2xl px-4 py-3 text-sm text-fg shadow-float ${
              toast.tone === 'error' ? 'ring-1 ring-danger/40' : ''
            }`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <Icon
              size={15}
              className={`mt-0.5 shrink-0 ${toast.tone === 'error' ? 'text-danger' : toast.tone === 'success' ? 'text-success' : 'text-accent-fg'}`}
            />
            <span className="leading-snug">{toast.message}</span>
            <button type="button" onClick={dismiss} aria-label="Dismiss" className="ml-1 text-fg-4 hover:text-fg">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Indeterminate progress bar (used when progress is not measurable). */
export function Indeterminate({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-[3px] w-full overflow-hidden rounded-full bg-line ${className}`} role="progressbar" aria-busy="true">
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          backgroundImage: 'linear-gradient(90deg, transparent 0%, var(--color-accent) 50%, transparent 100%)',
          backgroundSize: '50% 100%',
          backgroundRepeat: 'no-repeat',
        }}
      />
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="w-full">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-xs border border-line bg-raised-2 px-1.5 font-mono text-[11px] text-fg-3">{children}</kbd>;
}
