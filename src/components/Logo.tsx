import type { CSSProperties } from 'react';

/**
 * Aria's mark.
 *
 * A beamed double-note in a soft green tile: the two note heads read as a pair
 * of voices, the beam as the line they share. Drawn on a 24-unit optical grid
 * (64 canvas) with one stroke weight so it stays crisp from 16px favicons up to
 * the onboarding hero.
 *
 * `variant="mark"` drops the tile and draws the glyph in currentColor, for use
 * on coloured surfaces where a green tile would disappear.
 */

const GLYPH = (
  <>
    <path d="M26.2 44V17.5M48 38V11.5" strokeWidth="4.6" />
    <path d="M26.2 16.6 48 10.6" strokeWidth="5.2" />
    <ellipse cx="20.6" cy="44.5" rx="6" ry="4.9" transform="rotate(-18 20.6 44.5)" />
    <ellipse cx="42.4" cy="38.5" rx="6" ry="4.9" transform="rotate(-18 42.4 38.5)" />
  </>
);

export function Logo({
  size = 26,
  variant = 'tile',
  style,
  title,
}: {
  size?: number;
  variant?: 'tile' | 'mark';
  style?: CSSProperties;
  title?: string;
}) {
  const labelled = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const };

  if (variant === 'mark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block', flexShrink: 0, ...style }}
        {...labelled}
      >
        {title ? <title>{title}</title> : null}
        {GLYPH}
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...labelled}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="aria-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-strong)" />
        </linearGradient>
        <linearGradient id="aria-gloss" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill="url(#aria-tile)" />
      <rect width="64" height="64" rx="17" fill="url(#aria-gloss)" />
      <g
        fill="var(--brand-ink)"
        stroke="var(--brand-ink)"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPH}
      </g>
    </svg>
  );
}

/** Mark + wordmark, used in headers. */
export function Wordmark({
  size = 26,
  variant = 'tile',
}: {
  size?: number;
  variant?: 'tile' | 'mark';
}) {
  return (
    <span className="wordmark">
      <Logo size={size} variant={variant} />
      Aria
    </span>
  );
}

/** Large centred mark for auth, onboarding and empty states. */
export function LogoHero({ size = 64 }: { size?: number }) {
  return (
    <div className="logo-hero" style={{ width: size, height: size }} aria-hidden>
      <span className="logo-hero-ring" />
      <Logo size={size} />
    </div>
  );
}
