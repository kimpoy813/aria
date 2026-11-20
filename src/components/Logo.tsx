import { useId } from 'react';

interface LogoProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** `tile` renders the rounded squircle icon; `mark` renders the mark in currentColor. */
  variant?: 'tile' | 'mark';
  className?: string;
}

/**
 * Aria's mark: a fermata — the sign a musician writes over a note to say
 * "hold this one". One notehead, one stem, one arc above it.
 *
 * It is deliberately not a generic eighth note: the arc is what makes it Aria's,
 * it carries the idea of a song held a beat longer, and it stays readable at
 * 16px where stacked or beamed notes turn into mush.
 *
 * Drawn on a 64-unit canvas, inset to 88% so it clears the tile's corner radius.
 */
const GLYPH = (
  <g transform="translate(32 32) scale(0.88) translate(-32 -32)">
    <path
      d="M14 29.8a18 18 0 0 1 36 0"
      fill="none"
      strokeWidth="4.9"
      strokeLinecap="round"
    />
    <ellipse cx="30" cy="48.6" rx="7.4" ry="5.6" transform="rotate(-14 30 48.6)" />
    <path
      d="M35.9 48V30.4"
      fill="none"
      strokeWidth="4.6"
      strokeLinecap="round"
    />
  </g>
);

export function Logo({ size = 26, variant = 'tile', className }: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `aria-bg-${uid}`;
  const glossId = `aria-gloss-${uid}`;

  if (variant === 'mark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="currentColor"
        stroke="currentColor"
        className={className}
        aria-hidden="true"
      >
        {GLYPH}
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#13a375" />
          <stop offset="1" stopColor="#0a6a4c" />
        </linearGradient>
        {/* a single soft highlight so the tile reads as a surface, not a fill */}
        <linearGradient id={glossId} x1="0" y1="0" x2="0.25" y2="0.85">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill={`url(#${bgId})`} />
      <g fill="#ffffff" stroke="#ffffff">
        {GLYPH}
      </g>
      <rect width="64" height="64" rx="17" fill={`url(#${glossId})`} />
    </svg>
  );
}

/** Minimalist brand lockup: icon + clean geometric wordmark. */
export function Wordmark({
  size = 26,
  subtitle,
  className,
}: {
  size?: number;
  subtitle?: string;
  className?: string;
}) {
  return (
    <span className={`brand ${className || ''}`.trim()}>
      <Logo size={size} />
      <span className="brand-lockup">
        <span className="brand-word">Aria</span>
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </span>
    </span>
  );
}

/** Clean hero mark for sign-in and loading screens. */
export function LogoHero({ size = 52 }: { size?: number }) {
  return (
    <div className="logo-hero" aria-hidden="true">
      <Logo size={size} />
    </div>
  );
}
