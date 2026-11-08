/**
 * The Lumen Atelier wordmark ("Afterimage"): lowercase "lumen" in Martian Mono with a hard lilac
 * offset behind it (a double exposure), "atelier" small beside it. The mark is the same idea as a
 * monogram, "lu", for tight spaces and the app icon.
 */
import { Link } from 'react-router';

const OFFSET = '0.07em 0.05em 0 rgb(200 184 255 / 0.55)';

export function LumenMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`mono-display inline-flex shrink-0 items-center justify-center rounded-[28%] border border-line bg-ground leading-none text-fg ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.46, textShadow: '1.5px 1.5px 0 rgb(200 184 255 / 0.6)', letterSpacing: '-0.08em' }}
    >
      lu
    </span>
  );
}

/** `nameFrom`: only show the name from the `sm` breakpoint up (crowded headers on phones). */
export function Wordmark({ compact = false, nameFrom }: { compact?: boolean; nameFrom?: 'sm' }) {
  return (
    <Link to="/" className="group flex items-center gap-2 text-fg" aria-label="Lumen Atelier home">
      {compact ? (
        <LumenMark size={28} />
      ) : (
        <span className={`items-baseline whitespace-nowrap ${nameFrom === 'sm' ? 'hidden sm:flex' : 'flex'}`}>
          <span className="mono-display text-[21px] leading-none transition-[text-shadow] duration-300" style={{ textShadow: OFFSET }}>
            lumen
          </span>
          <span className="ml-1.5 font-mono text-[10px] text-fg-3">atelier</span>
        </span>
      )}
      {!compact && nameFrom === 'sm' && <LumenMark size={28} className="sm:hidden" />}
    </Link>
  );
}
