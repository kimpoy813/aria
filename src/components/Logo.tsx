import { useId } from 'react';

interface LogoProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** `tile` renders the rounded squircle icon; `mark` renders the mark in currentColor. */
  variant?: 'tile' | 'mark';
  className?: string;
}

/**
 * Aria's mark: a beamed pair of notes — two heads, two stems, one beam that
 * curves like a lyric line. The pair is the app's idea in miniature: parts that
 * only make sense together.
 *
 * Drawn on a 64-unit canvas, inset to 88% so it sits comfortably inside the
 * tile's corner radius and stays legible from 16px up.
 */
const GLYPH = (
  <g transform="translate(32 32) scale(0.88) translate(-32 -32)">
    <ellipse cx="17.6" cy="46.6" rx="7.4" ry="5.6" transform="rotate(-14 17.6 46.6)" />
    <ellipse cx="42.4" cy="39.8" rx="7.4" ry="5.6" transform="rotate(-14 42.4 39.8)" />
    <path
      d="M25 45.4V20.4M49.8 38.6V13.6"
      strokeWidth="5"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M25 19.2c8-3.3 16.6-4.9 24.8-6.1"
      strokeWidth="6.6"
      strokeLinecap="round"
      fill="none"
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
