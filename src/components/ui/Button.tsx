import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'accent-outline';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // Ink-black pill (inverts inside the black frame; black on the yellow carton bar).
  primary: 'bg-fg text-ground hover:bg-fg-2 active:bg-fg disabled:bg-control-2 disabled:text-fg-4',
  // Carton yellow: the one main action on a screen (Match a look, Export).
  accent: 'bg-accent text-on-accent hover:bg-accent-hi active:bg-accent-lo disabled:bg-control-2 disabled:text-fg-4',
  secondary:
    'bg-transparent text-fg border-[1.5px] border-fg/85 hover:bg-fg/[0.06] active:bg-fg/10 disabled:border-line disabled:text-fg-4',
  ghost: 'text-fg-2 hover:text-fg hover:bg-control active:bg-raised-2 disabled:text-fg-4',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
  'accent-outline': 'text-accent-fg border border-accent-fg/40 hover:bg-accent/10 hover:border-accent-fg/70',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 coarse:h-10',
  md: 'h-10 px-4 text-sm gap-2 coarse:h-11',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex select-none items-center justify-center rounded-sm font-semibold tracking-[0.01em] whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
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
          active ? 'bg-fg text-ground' : 'text-fg-2 hover:bg-fg/[0.08] hover:text-fg'
        }`}
        {...rest}
      >
        {children}
      </button>
      <Tooltip side={tooltipSide} className={SIDES[tooltipSide]}>
        {label}
        {shortcut && <kbd className="ml-2 font-mono text-[10px] text-fg-4">{shortcut}</kbd>}
      </Tooltip>
    </span>
  );
});

export function Tooltip({ children, className = '' }: { children: ReactNode; side?: string; className?: string }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 whitespace-nowrap coarse:hidden theme-frame rounded-xs px-2 py-1 text-xs font-medium opacity-0 shadow-float transition-opacity delay-0 duration-100 group-hover/tt:opacity-100 group-hover/tt:delay-500 group-has-[:focus-visible]/tt:opacity-100 ${className}`}
    >
      {children}
    </span>
  );
}
