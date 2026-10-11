import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent-outline';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-amber text-ink-950 hover:bg-amber-bright active:bg-amber-deep active:text-ivory disabled:bg-ink-600 disabled:text-faint',
  secondary:
    'bg-ink-700 text-ivory border border-line hover:border-line-strong hover:bg-ink-600 active:bg-ink-750 disabled:text-faint',
  ghost: 'text-ivory-dim hover:text-ivory hover:bg-ink-700 active:bg-ink-750 disabled:text-faint',
  danger: 'bg-transparent text-safelight border border-safelight/40 hover:bg-safelight/10',
  'accent-outline': 'text-amber border border-amber/40 hover:bg-amber/10 hover:border-amber/70',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 coarse:h-9',
  md: 'h-9 px-3.5 text-[13px] gap-2 coarse:h-10',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex select-none items-center justify-center rounded-sm font-medium tracking-[0.01em] whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  active?: boolean;
  tooltipSide?: 'bottom' | 'top' | 'left' | 'right';
  children: ReactNode;
}

const SIDES = {
  bottom: 'top-full mt-1.5 left-1/2 -translate-x-1/2',
  top: 'bottom-full mb-1.5 left-1/2 -translate-x-1/2',
  left: 'right-full mr-1.5 top-1/2 -translate-y-1/2',
  right: 'left-full ml-1.5 top-1/2 -translate-y-1/2',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, tooltipSide = 'bottom', className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    // className styles the wrapper (e.g. responsive visibility like "hidden sm:inline-flex").
    <span className={`group/tt relative ${className || 'inline-flex'}`}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-sm coarse:h-10 coarse:w-10 transition-[background-color,color,transform] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${
          active ? 'bg-amber/15 text-amber' : 'text-ivory-dim hover:bg-ink-700 hover:text-ivory'
        }`}
        {...rest}
      >
        {children}
      </button>
      <Tooltip side={tooltipSide} className={SIDES[tooltipSide]}>
        {label}
        {shortcut && <kbd className="ml-2 font-mono text-[10px] text-faint">{shortcut}</kbd>}
      </Tooltip>
    </span>
  );
});

export function Tooltip({ children, className = '' }: { children: ReactNode; side?: string; className?: string }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 whitespace-nowrap coarse:hidden rounded-xs border border-line bg-ink-950 px-2 py-1 text-[11px] text-ivory opacity-0 shadow-float transition-opacity delay-0 duration-100 group-hover/tt:opacity-100 group-hover/tt:delay-500 group-has-[:focus-visible]/tt:opacity-100 ${className}`}
    >
      {children}
    </span>
  );
}
