import { useId } from 'react';

interface LogoProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** `tile` renders the rounded squircle icon; `mark` renders the monogram in currentColor. */
  variant?: 'tile' | 'mark';
  className?: string;
}

/**
 * Minimalist Aria monogram: a geometric lowercase 'a' whose stem rises
 * seamlessly into a musical eighth note.
 */
export function Logo({ size = 26, variant = 'tile', className }: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `aria-bg-${uid}`;

  if (variant === 'mark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <g
          stroke="currentColor"
          strokeWidth="5.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="26.5" cy="38" r="9" />
          <path d="M35.5 47V16c6 0 11 3.8 11 10" />
        </g>
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
        <linearGradient id={bgId} x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#129b72" />
          <stop offset="1" stopColor="#0c7354" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${bgId})`} />
      <g stroke="#ffffff" strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="26.5" cy="38" r="9" />
        <path d="M35.5 47V16c6 0 11 3.8 11 10" />
      </g>
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
