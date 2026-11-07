/** The Lumen Atelier mark (a ring of split light around a lime point) and wordmark. */
import { useId } from 'react';
import { Link } from 'react-router';

export function LumenMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5c7a" />
          <stop offset="0.3" stopColor="#ffb547" />
          <stop offset="0.55" stopColor="#d4ff3f" />
          <stop offset="0.8" stopColor="#3fe0ff" />
          <stop offset="1" stopColor="#8f7dff" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="11" fill="none" stroke={`url(#${id})`} strokeWidth="4.5" />
      <circle cx="16" cy="16" r="3.4" fill="#d4ff3f" />
    </svg>
  );
}

/** `nameFrom`: only show the name from the `sm` breakpoint up (crowded headers on phones). */
export function Wordmark({ compact = false, nameFrom }: { compact?: boolean; nameFrom?: 'sm' }) {
  return (
    <Link to="/" className="group flex items-center gap-2 text-fg" aria-label="Lumen Atelier home">
      <LumenMark size={24} className="shrink-0 transition-transform duration-700 ease-out group-hover:rotate-180" />
      {!compact && (
        <span className={`text-[17px] font-semibold tracking-[-0.03em] whitespace-nowrap ${nameFrom === 'sm' ? 'hidden sm:inline' : ''}`}>
          Lumen <span className="serif text-[19px] font-normal text-fg-2">Atelier</span>
        </span>
      )}
    </Link>
  );
}
