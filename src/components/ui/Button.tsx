import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'accent-outline';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // Bright pill: strong secondary actions (Open a photo, Save, Export in dialogs).
  primary: 'bg-fg text-ground hover:bg-white active:bg-fg-2 disabled:bg-control disabled:text-fg-4',
  // Lilac: the one main action on a screen (Match a look, Export). It carries the afterimage
  // offset, which tucks in as the button is pressed.
  accent:
    'bg-[linear-gradient(135deg,#d9cdff,var(--color-accent)_45%,#a9b6ff)] text-on-accent shadow-[3px_3px_0_rgb(200_184_255/0.3),0_10px_34px_-8px_rgb(170_150_255/0.65)] hover:brightness-110 active:brightness-95 active:shadow-none disabled:bg-control disabled:bg-none disabled:text-fg-4 disabled:shadow-none',
  secondary: 'bg-raised-2 text-fg border border-line hover:bg-control hover:border-line-strong active:bg-control-2 disabled:text-fg-4 disabled:bg-raised',
  ghost: 'text-fg-2 hover:text-fg hover:bg-control active:bg-control-2 disabled:text-fg-4',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
  'accent-outline': 'text-accent-fg border border-accent/35 hover:bg-accent/10 hover:border-accent/70',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5 coarse:h-10',
  md: 'h-10 px-4.5 text-sm gap-2 coarse:h-11',
  lg: 'h-12 px-6 text-[15px] gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-full font-medium tracking-[-0.01em] whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
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
  bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
  left: 'right-full mr-2 top-1/2 -translate-y-1/2',
  right: 'left-full ml-2 top-1/2 -translate-y-1/2',
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
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full coarse:h-10 coarse:w-10 transition-[background-color,color,transform] duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 ${
          active ? 'bg-fg/[0.12] text-fg ring-1 ring-fg/15' : 'text-fg-2 hover:bg-control hover:text-fg'
        }`}
        {...rest}
      >
        {children}
      </button>
      <Tooltip side={tooltipSide} className={SIDES[tooltipSide]}>
        {label}
        {shortcut && <kbd className="ml-2 font-mono text-[11px] text-fg-4">{shortcut}</kbd>}
      </Tooltip>
    </span>
  );
});

export function Tooltip({ children, className = '' }: { children: ReactNode; side?: string; className?: string }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 scale-95 whitespace-nowrap rounded-sm border border-line bg-raised-2 px-2.5 py-1.5 text-xs font-medium text-fg opacity-0 shadow-float transition-[opacity,transform] delay-0 duration-150 coarse:hidden group-hover/tt:scale-100 group-hover/tt:opacity-100 group-hover/tt:delay-500 group-has-[:focus-visible]/tt:scale-100 group-has-[:focus-visible]/tt:opacity-100 ${className}`}
    >
      {children}
    </span>
  );
}
