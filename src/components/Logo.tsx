import { useId } from 'react';

interface LogoProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** `tile` renders the rounded emerald badge; `mark` renders the glyph in currentColor. */
  variant?: 'tile' | 'mark';
  className?: string;
}

/**
 * Aria brand mark — an arched harmonic phrase paired with a lyric spark,
 * optically balanced inside a luminous emerald squircle.
 */
export function Logo({ size = 28, variant = 'tile', className }: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const tileId = `aria-tile-${uid}`;
  const glowId = `aria-glow-${uid}`;
  const rimId = `aria-rim-${uid}`;

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
        <path
          d="M15.8 11.8C16.1 15.1 17.7 16.7 21 17C17.7 17.3 16.1 18.9 15.8 22.2C15.5 18.9 13.9 17.3 10.6 17C13.9 16.7 15.5 15.1 15.8 11.8Z"
          fill="currentColor"
          fillOpacity="0.85"
        />
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M26.8 42.6V20.6" strokeWidth="3.9" />
          <path d="M47.8 38.1V16.1" strokeWidth="3.9" />
          <path d="M26.8 20.6C33.4 17.3 41.1 15.9 47.8 16.1" strokeWidth="5" />
          <path
            d="M26.8 27.6C33.5 24.5 41.1 23.1 47.8 23.2"
            strokeWidth="2.7"
            strokeOpacity="0.78"
          />
        </g>
        <ellipse
          cx="21.4"
          cy="43.6"
          rx="6.2"
          ry="4.7"
          transform="rotate(-20 21.4 43.6)"
          fill="currentColor"
        />
        <ellipse
          cx="42.4"
          cy="39.1"
          rx="6.2"
          ry="4.7"
          transform="rotate(-20 42.4 39.1)"
          fill="currentColor"
        />
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
        <linearGradient id={tileId} x1="6" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22d68a" />
          <stop offset="0.48" stopColor="#109262" />
          <stop offset="1" stopColor="#074d35" />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(16 10) rotate(48) scale(44)"
        >
          <stop offset="0" stopColor="#bbfce0" stopOpacity="0.42" />
          <stop offset="0.6" stopColor="#bbfce0" stopOpacity="0.06" />
          <stop offset="1" stopColor="#bbfce0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={rimId} x1="32" y1="1" x2="32" y2="63" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${tileId})`} />
      <rect width="64" height="64" rx="16" fill={`url(#${glowId})`} />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="15.25"
        stroke={`url(#${rimId})`}
        strokeWidth="1.5"
      />
      <path
        d="M15.8 11.8C16.1 15.1 17.7 16.7 21 17C17.7 17.3 16.1 18.9 15.8 22.2C15.5 18.9 13.9 17.3 10.6 17C13.9 16.7 15.5 15.1 15.8 11.8Z"
        fill="#d8ffed"
      />
      <g stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M26.8 42.6V20.6" strokeWidth="3.9" />
        <path d="M47.8 38.1V16.1" strokeWidth="3.9" />
        <path d="M26.8 20.6C33.4 17.3 41.1 15.9 47.8 16.1" strokeWidth="5" />
        <path
          d="M26.8 27.6C33.5 24.5 41.1 23.1 47.8 23.2"
          strokeWidth="2.7"
          strokeOpacity="0.82"
        />
      </g>
      <ellipse
        cx="21.4"
        cy="43.6"
        rx="6.2"
        ry="4.7"
        transform="rotate(-20 21.4 43.6)"
        fill="#ffffff"
      />
      <ellipse
        cx="42.4"
        cy="39.1"
        rx="6.2"
        ry="4.7"
        transform="rotate(-20 42.4 39.1)"
        fill="#ffffff"
      />
    </svg>
  );
}

/** Brand lockup: tile + editorial serif name + optional studio tag. */
export function Wordmark({
  size = 28,
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

/** Hero emblem used on authentication and welcome surfaces. */
export function LogoHero({ size = 64 }: { size?: number }) {
  return (
    <div className="logo-hero" aria-hidden="true">
      <span className="logo-hero-glow" />
      <span className="logo-hero-ring" />
      <Logo size={size} />
    </div>
  );
}
