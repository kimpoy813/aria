/**
 * Aria's icon set.
 *
 * One system, deliberately small: a 24-unit grid, one 1.8 stroke weight, round
 * caps and joins, and `currentColor` so icons inherit their surroundings.
 *
 * An icon must be optically centred on the grid and use either a 2px stroke or a
 * solid fill — never a different weight. Sizes come from the `size` prop, whose
 * only sanctioned values are 12 / 14 / 16 / 18 / 20 / 24 so rhythm stays even.
 */

import type { CSSProperties } from 'react';

export type IconName =
  | 'songs'
  | 'lineup'
  | 'teams'
  | 'add'
  | 'search'
  | 'sun'
  | 'moon'
  | 'drag'
  | 'share'
  | 'copy'
  | 'check'
  | 'close'
  | 'chevronRight'
  | 'chevronDown'
  | 'arrowUp'
  | 'arrowDown'
  | 'trash'
  | 'sparkle'
  | 'fast'
  | 'slow'
  | 'clock'
  | 'link'
  | 'back'
  | 'edit'
  | 'view'
  | 'refresh'
  | 'lyrics'
  | 'mail'
  | 'lock'
  | 'user'
  | 'logout'
  | 'filter'
  | 'eyeOff'
  | 'paste'
  | 'monitor';

/** Sanctioned sizes; anything else is rounded to the nearest. */
const SIZES = [12, 14, 16, 18, 20, 24] as const;

function snap(size: number) {
  return SIZES.reduce((best, step) => (Math.abs(step - size) < Math.abs(best - size) ? step : best));
}

const PATHS: Record<IconName, JSX.Element> = {
  songs: (
    <>
      <path d="M9 18V6.2l10-1.9v11.4" />
      <circle cx="6.4" cy="18" r="2.6" />
      <circle cx="16.4" cy="15.7" r="2.6" />
    </>
  ),
  lineup: (
    <>
      <path d="M4 7h9M4 12h9M4 17h5" />
      <circle cx="17.4" cy="16.8" r="2.4" />
      <path d="M19.8 16.8V7.6l-1.9.4" />
    </>
  ),
  teams: (
    <>
      <circle cx="9" cy="8.4" r="3" />
      <path d="M3.6 19c0-2.9 2.4-4.9 5.4-4.9s5.4 2 5.4 4.9" />
      <path d="M15.8 6.2a2.8 2.8 0 0 1 0 5.3M17.4 14.5c1.7.7 2.8 2.3 2.8 4.5" />
    </>
  ),
  add: <path d="M12 5.5v13M5.5 12h13" />,
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.5 15.5 4.2 4.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5" />
    </>
  ),
  moon: <path d="M20 14.4A8.3 8.3 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z" />,
  drag: (
    <>
      <circle cx="9.2" cy="6.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="17.6" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="6.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="17.6" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  share: (
    <>
      <path d="M12 15.2V4M8.5 7.5 12 4l3.5 3.5" />
      <path d="M5.2 13.6V19a1.4 1.4 0 0 0 1.4 1.4h10.8A1.4 1.4 0 0 0 18.8 19v-5.4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.4" />
      <path d="M15 6.6V5.4A2.4 2.4 0 0 0 12.6 3H5.4A2.4 2.4 0 0 0 3 5.4v7.2A2.4 2.4 0 0 0 5.4 15h1.2" />
    </>
  ),
  check: <path d="m4.8 12.6 4.6 4.6L19.2 7" />,
  close: <path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronDown: <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  arrowUp: <path d="M12 19V5.6M6.4 11.2 12 5.6l5.6 5.6" />,
  arrowDown: <path d="M12 5v13.4M17.6 12.8 12 18.4l-5.6-5.6" />,
  trash: (
    <>
      <path d="M4.2 7h15.6M9.6 7V5.4A1.4 1.4 0 0 1 11 4h2a1.4 1.4 0 0 1 1.4 1.4V7" />
      <path d="M6.6 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.8-12" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11.4 3.4 13 8.8l5.4 1.6L13 12l-1.6 5.4L9.8 12 4.4 10.4 9.8 8.8Z" />
      <path d="M18 15.6l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7Z" />
    </>
  ),
  fast: <path d="M13.6 2.8 5.6 13.4h5.2l-.8 7.8 8-10.6h-5.2Z" />,
  slow: <path d="M2.8 12c1.9 0 1.9-3.6 3.8-3.6s1.9 7.2 3.8 7.2 1.9-7.2 3.8-7.2 1.9 3.6 3.8 3.6 1.9-1.8 3.2-1.8" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l3 1.9" />
    </>
  ),
  link: (
    <>
      <path d="M10.2 13.8a3.5 3.5 0 0 0 5 0l2.7-2.7a3.5 3.5 0 0 0-5-5l-1.3 1.3" />
      <path d="M13.8 10.2a3.5 3.5 0 0 0-5 0l-2.7 2.7a3.5 3.5 0 0 0 5 5l1.3-1.3" />
    </>
  ),
  back: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  edit: (
    <>
      <path d="M4.5 19.5h3.6L19 8.6a1.9 1.9 0 0 0 0-2.7l-.9-.9a1.9 1.9 0 0 0-2.7 0L4.5 15.9Z" />
      <path d="M14.4 6.9 17.1 9.6" />
    </>
  ),
  view: (
    <>
      <path d="M2.8 12S6 6.4 12 6.4 21.2 12 21.2 12 18 17.6 12 17.6 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.4a8 8 0 1 0-2.5 6.1" />
      <path d="M20.2 4.8v6.6h-6.6" />
    </>
  ),
  lyrics: (
    <>
      <path d="M7.6 6.4h8.8M7.6 11.2h6.4M7.6 16h4.4" />
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </>
  ),
  mail: (
    <>
      <rect x="2.8" y="5" width="18.4" height="14" rx="2.6" />
      <path d="m3.6 6.8 7.3 5.3a2 2 0 0 0 2.2 0l7.3-5.3" />
    </>
  ),
  lock: (
    <>
      <rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.6" />
      <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 20c0-3.6 3.2-6 7.2-6s7.2 2.4 7.2 6" />
    </>
  ),
  logout: (
    <>
      <path d="M14.4 4.8H6.4A1.6 1.6 0 0 0 4.8 6.4v11.2a1.6 1.6 0 0 0 1.6 1.6h8" />
      <path d="M15.6 8.4 19.2 12l-3.6 3.6M10.8 12h8.4" />
    </>
  ),
  filter: <path d="M4 6.4h16L13.6 13v6l-3.2-1.8V13Z" />,
  eyeOff: (
    <>
      <path d="M3.2 3.2 20.8 20.8" />
      <path d="M10.4 10.4a2.3 2.3 0 0 0 3.2 3.2" />
      <path d="M9.8 6.6A9.8 9.8 0 0 1 12 6.4c6 0 9.2 5.6 9.2 5.6a16 16 0 0 1-3.1 3.7" />
      <path d="M6.3 7.3C4.1 8.9 2.8 12 2.8 12S6 17.6 12 17.6c1.6 0 3.1-.4 4.4-1" />
    </>
  ),
  paste: (
    <>
      <rect x="5.5" y="4.8" width="13" height="15.7" rx="2.4" />
      <path d="M9.2 4.8V3.7a1.2 1.2 0 0 1 1.2-1.2h3.2a1.2 1.2 0 0 1 1.2 1.2v1.1" />
      <path d="M8.8 10.6h6.4M8.8 14.6h4.2" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4.2" width="18" height="12.2" rx="2.2" />
      <path d="M8.6 20h6.8M12 16.4V20" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.8,
  className,
  style,
  title,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const px = snap(size);
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
