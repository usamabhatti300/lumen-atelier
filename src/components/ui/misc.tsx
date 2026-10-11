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
        <span className="block text-[13px] text-ivory">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-mute">{description}</span>}
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
        <span className="h-[18px] w-8 rounded-full bg-ink-600 transition-colors duration-200 peer-checked:bg-amber/80 peer-focus-visible:outline peer-focus-visible:outline-amber" />
        <span className="absolute top-[3px] left-[3px] h-3 w-3 rounded-full bg-ivory transition-transform duration-200 peer-checked:translate-x-[14px]" />
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
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-sm border border-line bg-ink-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`relative rounded-xs font-medium transition-colors ${size === 'xs' ? 'h-6 px-2 text-[11px] coarse:h-8' : 'min-h-7 px-2.5 text-xs leading-tight coarse:min-h-9'} ${
            value === o.value ? 'text-ink-950' : 'text-mute hover:text-ivory'
          }`}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${label}`}
              className="absolute inset-0 rounded-xs bg-champagne"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-auto flex max-w-[min(92vw,520px)] items-start gap-2.5 rounded-sm border bg-ink-850 px-3.5 py-2.5 text-[13px] shadow-float ${
              toast.tone === 'error' ? 'border-safelight/50 text-ivory' : 'border-line text-ivory'
            }`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <Icon
              size={15}
              className={`mt-0.5 shrink-0 ${toast.tone === 'error' ? 'text-safelight' : toast.tone === 'success' ? 'text-verdigris' : 'text-amber'}`}
            />
            <span className="leading-snug">{toast.message}</span>
            <button type="button" onClick={dismiss} aria-label="Dismiss" className="ml-1 text-faint hover:text-ivory">
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
    <div className={`relative h-[2px] w-full overflow-hidden rounded-full bg-line ${className}`} role="progressbar" aria-busy="true">
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          backgroundImage: 'linear-gradient(90deg, transparent 0%, var(--color-amber) 50%, transparent 100%)',
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
        className="h-[3px] w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-label={label}
      >
        <div className="h-full bg-amber transition-[width] duration-200" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-xs border border-line bg-ink-900 px-1 font-mono text-[10px] text-mute">{children}</kbd>;
}
