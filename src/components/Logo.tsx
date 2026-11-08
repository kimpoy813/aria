import type { CSSProperties } from 'react';

/**
 * Aria's mark: a rounded green tile with the lyric-note glyph.
 * Same artwork as public/logo.svg (the favicon), so the identity is consistent
 * everywhere it appears.
 */
export function Logo({
  size = 26,
  style,
  title,
}: {
  size?: number;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {title ? <title>{title}</title> : null}
      <rect width="64" height="64" rx="18" fill="var(--brand)" />
      <path
        d="M24 44V22l20-6v22"
        stroke="var(--brand-ink)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="44" r="5" fill="var(--brand-ink)" />
      <circle cx="40" cy="38" r="5" fill="var(--brand-ink)" />
    </svg>
  );
}

/** Logo + the Aria wordmark, used in headers. */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="wordmark">
      <Logo size={size} />
      Aria
    </span>
  );
}

/** Large centred mark for the landing screen. */
export function LogoHero({ size = 64 }: { size?: number }) {
  return (
    <div className="logo-hero" aria-hidden>
      <span className="logo-hero-ring" />
      <Logo size={size} />
    </div>
  );
}
