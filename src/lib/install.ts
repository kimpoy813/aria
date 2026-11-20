/**
 * Install plumbing for the /app page.
 *
 * The page offers three ways onto a phone, in order of preference:
 *   - the Android package (APK) when the server has one published,
 *   - the browser's own install prompt when it offers one,
 *   - plain instructions (Add to Home Screen) when neither is available.
 *
 * Platform sniffing and the `beforeinstallprompt` capture live here so the page
 * itself stays presentational.
 */

export type Platform = 'android' | 'ios' | 'desktop' | 'other';

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Held between `beforeinstallprompt` and the user choosing. */
let deferredPrompt: InstallPromptEvent | null = null;

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's mini-infobar out of the way; /app offers the install itself.
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new CustomEvent('aria:installable'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('aria:installed'));
  });
}

export function canPromptInstall(): boolean {
  return Boolean(deferredPrompt);
}

/** Resolves true when the user accepted the prompt. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}

/** Already running as an installed app (home screen, standalone window or TWA). */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) return true;
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
}

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports a desktop UA; extra touch points give it away.
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) return 'ios';
  if (/Windows|Mac OS X|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'other';
}

/** `12.4 MB` style size for the download card. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Short fingerprint for the integrity line: first 16 hex characters, grouped. */
export function shortDigest(sha256: string | null | undefined): string | null {
  if (!sha256) return null;
  const head = sha256.slice(0, 16).toUpperCase();
  return `${head.slice(0, 4)} ${head.slice(4, 8)} ${head.slice(8, 12)} ${head.slice(12, 16)}`;
}

/**
 * Compact counts for the download page: 999 stays exact, then 1K, 1.5K, 12K,
 * 1.2M, 3.4B, 1.1T. `exact` keeps the full number for a tooltip and for screen
 * readers, so nothing is lost by shortening.
 */
export function formatCount(value: number | null | undefined): {
  label: string | null;
  exact: string | null;
} {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { label: null, exact: null };
  }

  const n = Math.floor(value);
  const exact = n.toLocaleString('en-US');
  if (n < 1000) return { label: exact, exact };

  const units: { size: number; suffix: string }[] = [
    { size: 1e12, suffix: 'T' },
    { size: 1e9, suffix: 'B' },
    { size: 1e6, suffix: 'M' },
    { size: 1e3, suffix: 'K' },
  ];

  // Dropping the fraction, not rounding it: 1,999 is "1.9K", never "2K", so the
  // count can never claim more downloads than were actually recorded.
  const truncate = (scaled: number) =>
    scaled >= 100 ? Math.floor(scaled) : Math.floor(scaled * 10) / 10;

  for (let i = 0; i < units.length; i++) {
    const { size, suffix } = units[i];
    if (n < size) continue;

    const value = truncate(n / size);
    // 999,999 would otherwise print as "999.9K" — roll it into the next unit.
    if (value >= 1000 && i > 0) {
      const next = units[i - 1];
      return { label: `${truncate(n / next.size)}${next.suffix}`, exact };
    }
    return { label: `${value}${suffix}`, exact };
  }

  return { label: exact, exact };
}
