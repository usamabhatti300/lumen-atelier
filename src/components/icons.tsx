/**
 * The two Afterimage icons Lucide doesn't have, drawn on the same 24px grid and stroke as Lucide so
 * they sit beside Sun, Droplet and Ellipsis in the dock:
 * - Looks: two frames over a wide one (a contact sheet).
 * - Match: two overlapping circles (a double exposure: the reference over your photo).
 */
import type { SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number;
  strokeWidth?: number;
}

function Base({ size = 24, strokeWidth = 1.7, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export function LooksIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="9" rx="1" />
      <rect x="3" y="15" width="18" height="6" rx="1" />
    </Base>
  );
}

export function MatchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </Base>
  );
}
