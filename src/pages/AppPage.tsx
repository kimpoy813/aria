import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo, Wordmark } from '../components/Logo';
import { Icon, IconButton } from '../components/ui';
import type { IconName } from '../components/Icon';
import { appRelease, type AppRelease } from '../lib/api';
import {
  canPromptInstall,
  detectPlatform,
  formatBytes,
  formatCount,
  isInstalled,
  promptInstall,
  shortDigest,
  type Platform,
} from '../lib/install';
import { useStore } from '../lib/store';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'songs',
    title: 'Songs, stored by part',
    body: 'Every verse, chorus, pre-chorus and bridge stays on its own, with its own words. Reuse any section later without re-typing a line.',
  },
  {
    icon: 'sparkle',
    title: 'Reads the lyric, not the genre',
    body: 'Aria classifies each part by what the words actually say — love, faith, hope, longing, grief — and gives you the message in one line plus the phrase that carried it.',
  },
  {
    icon: 'fast',
    title: 'Knows fast from slow',
    body: 'Each song carries a tempo reading, so a lineup can be checked against the brief: at least one fast track and one slow one, every time.',
  },
  {
    icon: 'drag',
    title: 'Lineups by the part',
    body: 'Drag a chorus from one song and a bridge from another. Drop the same chorus twice if the moment calls for it — repetition is a choice, not a copy.',
  },
  {
    icon: 'clock',
    title: 'Least recently used',
    body: 'Sharing a lineup link counts as using it. Aria suggests the set you have not played in the longest time, so Sunday never sounds like last Sunday.',
  },
  {
    icon: 'teams',
    title: 'Teams on a code',
    body: 'Create a team or join one with a short code, then copy songs and whole lineups between members. Everyone gets their own labelled copy.',
  },
  {
    icon: 'link',
    title: 'A link that just works',
    body: 'Send a view-only lineup with the real lyrics — title, part name, words. No account, no app and no numbering at the other end.',
  },
  {
    icon: 'lock',
    title: 'Quiet about your data',
    body: 'No ads, no trackers, no third-party analytics. Delete your account and everything in it from the account sheet whenever you want.',
  },
];

const HOW_IT_WORKS: { step: string; title: string; body: string; art: 'song' | 'class' | 'lineup' }[] = [
  {
    step: '01',
    title: 'Add the song, one part at a time',
    body: 'Paste the words of one section, label it Verse 1, then move on to the chorus. Songs stay editable, and every part is its own reusable piece — which is what makes the next step possible.',
    art: 'song',
  },
  {
    step: '02',
    title: 'Let the lyric name itself',
    body: 'The classifier reads what you pasted and returns a class, a one-line message, a confidence figure and the exact line that drove the reading. You can edit any of it if you disagree.',
    art: 'class',
  },
  {
    step: '03',
    title: 'Build the set from the parts',
    body: 'Drop parts into a sequence, drag to reorder, repeat what the moment needs. One fast and one slow track are required, so a lineup never sits on one tempo. Share it as a link when it is ready.',
    art: 'lineup',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is Aria free?',
    a: 'Yes. There is no paid tier, no advertising and no tracking. Create an account and use it.',
  },
  {
    q: 'Do I need the APK?',
    a: 'No. The web app installs to your home screen and opens full screen. The APK is for people who want a normal Android install, or a copy they can keep offline.',
  },
  {
    q: 'Why does Android warn about the file?',
    a: 'Any app installed outside Google Play triggers that warning. Aria is distributed directly, so the warning is expected. Check the SHA-256 on this page against your downloaded file if you want to be certain.',
  },
  {
    q: 'Which Android versions work?',
    a: 'Android 8.0 and newer. The web install works on any modern browser, including iPhone and desktop.',
  },
  {
    q: 'What happens to my songs if I switch devices?',
    a: 'They follow your account. Sign in on the new device and the library, lineups and teams are there.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Sign in, open the account sheet from your avatar, and choose Delete account. Songs, lineups and team memberships go with it.',
  },
  {
    q: 'How do I copy lyrics?',
    a: 'On any song or shared lineup, tap “Copy lyrics”. It copies the words of every part as plain text, one section after another — ready to paste into a message, a slide, or a printable sheet.',
  },
  {
    q: 'How do I copy lyrics with chords?',
    a: 'Turn “Chords on” first, then tap “Copy lyrics”. The chords come along with the words, shown inline as [C] style markers on the syllable they fall on. If chords are hidden, only the words are copied.',
  },
  {
    q: 'Can I change the key of just one part?',
    a: 'Yes. On a shared lineup, each part has its own − / key / + control beside it — tap it to move that one part up or down a semitone without touching the rest of the set. The whole-set bar still moves everything at once.',
  },
  {
    q: 'What is a “part”?',
    a: 'A part is one labeled section of a song — Verse 1, Chorus, Bridge, and so on. Songs are stored part by part, so you can drop a single chorus or a whole song into a lineup, and reuse any section later without re-typing it.',
  },
  {
    q: 'How do I build a lineup?',
    a: 'Open Lineups, add parts from your library, and drag to reorder. A lineup needs at least two parts from two different songs, including one fast and one slow track. Share it as a view-only link when it is ready.',
  },
];

function MockArt({ kind }: { kind: 'song' | 'class' | 'lineup' }) {
  if (kind === 'class') {
    return (
      <div className="app-art">
        <div className="app-art-row">
          <span className="chip brand">Love</span>
          <span className="tiny muted">84% match</span>
        </div>
        <div className="app-art-bars">
          <span style={{ width: '100%' }} />
          <span style={{ width: '61%' }} />
          <span style={{ width: '37%' }} />
        </div>
        <p className="app-art-quote">“Stay, stay, the harbor light is low”</p>
      </div>
    );
  }

  if (kind === 'lineup') {
    return (
      <div className="app-art">
        {[
          { part: 'Verse 1', song: 'Harbor Light', tone: 'slow' as const },
          { part: 'Chorus', song: 'Paper Kites', tone: 'fast' as const },
          { part: 'Bridge', song: 'Still Water', tone: 'slow' as const },
        ].map((row, i) => (
          <div className="app-art-seq" key={row.part}>
            <Icon name="drag" size={14} />
            <span className="app-art-index">{i + 1}</span>
            <span className="chip brand">{row.part}</span>
            <span className="truncate small">{row.song}</span>
            <Icon name={row.tone === 'fast' ? 'fast' : 'slow'} size={14} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="app-art">
      <div className="app-art-title">Harbor Light</div>
      <div className="app-art-tag">Verse 1</div>
      <div className="app-art-lines">
        <span style={{ width: '92%' }} />
        <span style={{ width: '76%' }} />
        <span style={{ width: '85%' }} />
      </div>
      <div className="app-art-tag">Chorus</div>
      <div className="app-art-lines">
        <span style={{ width: '88%' }} />
        <span style={{ width: '63%' }} />
      </div>
    </div>
  );
}

export function AppPage() {
  const { theme, toggleTheme, user } = useStore();
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [failed, setFailed] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  const [installed, setInstalled] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isInstalled());
    setInstallable(canPromptInstall());

    const onInstallable = () => setInstallable(true);
    const onInstalled = () => {
      setInstalled(true);
      setInstallable(false);
    };
    window.addEventListener('aria:installable', onInstallable);
    window.addEventListener('aria:installed', onInstalled);

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    // The package is mirrored in the background, so the first answer can honestly
    // be "no build yet". Keep asking for a while — a page that latched onto that
    // first answer stayed on the web-install card even after the APK was ready.
    const load = () => {
      appRelease()
        .then((next) => {
          if (cancelled) return;
          setRelease(next);
          setFailed(false);
          const waiting =
            !next.available &&
            (next.mirrorStatus === 'fetching' || next.mirrorStatus === 'idle') &&
            attempts < 45;
          if (waiting) {
            attempts += 1;
            timer = window.setTimeout(load, attempts < 15 ? 2000 : 5000);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setFailed(true);
          if (attempts < 8) {
            attempts += 1;
            timer = window.setTimeout(load, 4000);
          }
        });
    };
    load();

    // A tab left open in the background should not show a stale download state.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('aria:installable', onInstallable);
      window.removeEventListener('aria:installed', onInstalled);
    };
  }, []);

  const size = formatBytes(release?.sizeBytes);
  const digest = shortDigest(release?.sha256);
  const apkReady = Boolean(release?.available && release.url);
  const downloadCount = release?.downloads;
  const count = formatCount(downloadCount);
  const downloadCountLabel = count.label;
  const totalUsers = release?.totalUsers;
  const userCount = formatCount(totalUsers);
  const userCountLabel = userCount.label;

  const primaryLabel = useMemo(() => {
    if (installed) return 'Aria is installed';
    if (apkReady) return 'Download the Android app';
    if (platform === 'ios') return 'Add Aria to your Home Screen';
    if (platform === 'android') return 'Install Aria on this phone';
    return 'Install Aria';
  }, [installed, apkReady, platform]);

  const startDownload = async () => {
    if (!release?.url) return;
    setDownloading(true);

    // Optimistic: the click is the count, so show it immediately.
    setRelease((prev) => (prev ? { ...prev, downloads: (prev.downloads || 0) + 1 } : prev));

    // Let the browser handle it: /downloads/aria.apk answers with Content-Disposition.
    window.location.href = release.url;

    // Then read the real number back, so a second device/visitor stays in sync.
    for (const delay of [900, 2600]) {
      window.setTimeout(async () => {
        try {
          setRelease(await appRelease());
        } catch {
          /* the counter is cosmetic */
        }
      }, delay);
    }
    window.setTimeout(() => setDownloading(false), 2400);
  };

  const installFromBrowser = async () => {
    if (canPromptInstall()) {
      const accepted = await promptInstall();
      setInstallable(!accepted);
      if (accepted) setInstalled(true);
      return;
    }
    document.getElementById('install-steps')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const steps =
    platform === 'ios'
      ? [
          'Open Aria in Safari.',
          'Tap the Share button.',
          'Choose “Add to Home Screen”, then Add.',
        ]
      : platform === 'android'
        ? [
            'Open Aria in Chrome.',
            'Tap the ⋮ menu, top right.',
            'Choose “Install app” or “Add to Home screen”.',
          ]
        : [
            'Open Aria in Chrome, Edge or Safari.',
            'Use the install button in the address bar (or the Share menu on a Mac).',
            'Aria opens full screen, like any other app.',
          ];

  return (
    <div className="app-page">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={user ? '/' : '/login'} className="brand-home" aria-label="Aria">
            <Wordmark size={24} />
          </Link>
          <div className="push" />
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
          </IconButton>
        </div>
      </header>

      <main className="app-main no-nav app-page-main">
        {/* ------------------------------------------------------------- hero */}
        <section className="app-hero">
          <div className="app-hero-stage" aria-hidden>
            <span className="app-halo app-halo-1" />
            <span className="app-halo app-halo-2" />
            <span className="app-ring" />
            <svg className="app-wave" viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden>
              <path
                className="app-wave-line app-wave-a"
                d="M0 30c10 0 10-18 20-18s10 36 20 36 10-36 20-36 10 30 20 30 10-22 20-22 10 26 20 26 10-14 20-14 10 10 20 10 10-6 20-6 10 4 20 4 10-2 20-2"
              />
              <path
                className="app-wave-line app-wave-b"
                d="M0 34c12 0 12 12 24 12s12-24 24-24 12 26 24 26 12-18 24-18 12 16 24 16 12-10 24-10 12 8 24 8 12-6 24-6 12 2 24 2"
              />
            </svg>
            <span className="app-hero-mark">
              <span className="app-tile-shine" />
              <Logo size={76} />
            </span>
          </div>
          <div className="app-pill">
            <span className="app-pill-dot" />
            {apkReady ? 'Android build available' : 'Android & web'}
          </div>
          <h1 className="app-hero-title">Setlists that read the lyric first.</h1>
          <p className="app-hero-lede">
            Aria keeps your songs part by part, names the message inside the words, then helps you
            build a lineup that has not been played lately. Free, no ads, no trackers.
          </p>
          <div className="app-cta">
            <button
              type="button"
              className="btn btn-primary btn-block app-cta-main"
              onClick={apkReady ? startDownload : installFromBrowser}
              disabled={installed || downloading}
            >
              <Icon name={installed ? 'check' : apkReady ? 'download' : 'device'} size={16} />
              {downloading ? 'Starting download…' : primaryLabel}
            </button>
            {installed ? (
              <p className="tiny muted app-cta-note">
                You are already in the installed app. Nothing else to do.
              </p>
            ) : apkReady && installable ? (
              <button type="button" className="btn btn-block" onClick={installFromBrowser}>
                Or install straight from the browser
              </button>
            ) : null}
            <Link to={user ? '/' : '/login'} className="btn btn-quiet btn-block">
              {user ? 'Open my library' : 'Use Aria in the browser'}
              <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          <div className="app-facts">
            <span>
              <Icon name="check" size={13} />
              {platform === 'desktop'
                ? 'Desktop · iPhone · Android · web'
                : apkReady
                  ? `Android APK${release?.version ? ` v${release.version}` : ''}`
                  : 'Android · iPhone · web'}
            </span>
            <span>
              <Icon name="check" size={13} />
              {apkReady ? `${size ?? 'Small'} download` : `Web app · install in seconds`}
            </span>
            <span>
              <Icon name="check" size={13} /> Works offline
            </span>
          </div>
        </section>

        {/* -------------------------------------------------------- install */}
        <section className="app-section" aria-labelledby="install-title">
          <h2 id="install-title" className="app-section-title">
            Install Aria
          </h2>
          <div className="app-install">
            <article className="app-card app-install-card">
              <div className="app-install-head">
                <span className="app-install-icon">
                  <Icon name="device" size={18} />
                </span>
                <div>
                  <h3 className="app-card-title">Install from the browser</h3>
                  <p className="small muted">
                    Adds Aria to your home screen — full screen, an icon, and offline access —
                    without downloading anything. Works on Android, iPhone and desktop.
                  </p>
                </div>
                <span className="chip brand">Fastest</span>
              </div>
              <div className="app-steps" id="install-steps">
                {steps.map((step, i) => (
                  <div className="app-step" key={step}>
                    <span className="app-step-num">{i + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={installFromBrowser}
                disabled={installed || downloading}
              >
                <Icon name={installed ? 'check' : 'device'} size={16} />
                {downloading ? 'Starting…' : installed ? 'Installed' : installable ? 'Install Aria now' : 'Show me how'}
              </button>
              {installed ? (
                <p className="tiny muted app-cta-note">
                  You are already in the installed app. Nothing else to do.
                </p>
              ) : null}
            </article>

            {platform === 'desktop' ? (
              <article className="app-card app-install-card">
                <div className="app-install-head">
                  <span className="app-install-icon">
                    <Icon name="monitor" size={18} />
                  </span>
                  <div>
                    <h3 className="app-card-title">Install on desktop</h3>
                    <p className="small muted">
                      Aria is a web app — there is no separate desktop file to download.
                      Install it from Chrome, Edge or Safari and it opens in its own
                      window, like any other desktop app.
                    </p>
                  </div>
                  <span className="chip brand">Desktop</span>
                </div>
                <div className="app-steps">
                  <div className="app-step">
                    <span className="app-step-num">1</span>
                    <span>Open Aria in Chrome, Edge or Safari.</span>
                  </div>
                  <div className="app-step">
                    <span className="app-step-num">2</span>
                    <span>Use the install button in the address bar (or the Share menu on a Mac).</span>
                  </div>
                  <div className="app-step">
                    <span className="app-step-num">3</span>
                    <span>Aria opens in its own window — full screen, an icon, offline access.</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={installFromBrowser}
                  disabled={installed || downloading}
                >
                  <Icon name={installed ? 'check' : 'monitor'} size={16} />
                  {downloading ? 'Starting…' : installed ? 'Installed' : installable ? 'Install Aria on desktop' : 'Show me how'}
                </button>
              </article>
            ) : null}

            {apkReady ? (
              <article className="app-card app-install-card">
                <div className="app-install-head">
                  <span className="app-install-icon">
                    <Icon name="download" size={18} />
                  </span>
                  <div>
                    <h3 className="app-card-title">Download the APK</h3>
                    <p className="small muted">
                      Direct Android install file · {release?.fileName ?? 'aria.apk'}
                      {release?.version ? ` · v${release.version}` : ''}
                    </p>
                  </div>
                  <span className="chip brand">Android</span>
                </div>
                <dl className="app-specs">
                  <div>
                    <dt>Size</dt>
                    <dd>{size ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{release?.version ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Package</dt>
                    <dd className="mono">{release?.packageName ?? 'app.aria.lineups'}</dd>
                  </div>
                </dl>
                <button type="button" className="btn btn-primary btn-block" onClick={startDownload}>
                  <Icon name="download" size={16} />
                  {downloading ? 'Starting download…' : 'Download aria.apk'}
                </button>
                {digest ? (
                  <p className="app-digest">
                    <Icon name="lock" size={13} /> SHA-256 <span className="mono">{digest}…</span>
                  </p>
                ) : null}
                <p className="tiny muted">
                  Android will ask you to allow installs from this browser the first time. You may
                  also need to allow installs for Aria under Settings → Apps → Special access.
                </p>
                {downloadCountLabel || userCountLabel ? (
                  <p className="app-count" aria-live="polite">
                    <Icon name="check" size={13} />
                    <span>
                      {userCountLabel ? (
                        <>
                          <strong>{userCountLabel}</strong>{' '}
                          {totalUsers === 1 ? 'person uses' : 'people use'} Aria
                        </>
                      ) : null}
                      {userCountLabel && downloadCountLabel ? ' · ' : null}
                      {downloadCountLabel ? (
                        <>
                          <strong>{downloadCountLabel}</strong>{' '}
                          {downloadCount === 1 ? 'download' : 'downloads'}
                        </>
                      ) : null}
                    </span>
                  </p>
                ) : null}
              </article>
            ) : null}
          </div>

          <div className="app-install-compare">
            <h4>Which should I choose?</h4>
            <div className="app-compare-row">
              <strong>Install from the browser</strong>
              <span>Every device · no file · starts instantly</span>
            </div>
            {apkReady ? (
              <div className="app-compare-row">
                <strong>Download the APK</strong>
                <span>Android only · keeps a copy · works fully offline</span>
              </div>
            ) : null}
            <p className="tiny muted">
              Both give you the same Aria. The browser install is the quickest way to start; the APK
              is handy if you want the install file itself or are on Android without Play Store
              access.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------- how it works */}
        <section className="app-section" aria-labelledby="how-title">
          <h2 id="how-title" className="app-section-title">
            How Aria works
          </h2>
          <div className="app-how">
            {HOW_IT_WORKS.map((item) => (
              <article className="app-card app-how-card" key={item.step}>
                <div className="app-how-head">
                  <span className="app-how-num">{item.step}</span>
                  <h3>{item.title}</h3>
                </div>
                <p className="small muted">{item.body}</p>
                <MockArt kind={item.art} />
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ features */}
        <section className="app-section" aria-labelledby="features-title">
          <h2 id="features-title" className="app-section-title">
            What is inside
          </h2>
          <div className="app-features">
            {FEATURES.map((feature) => (
              <article className="app-card app-feature" key={feature.title}>
                <span className="app-feature-icon">
                  <Icon name={feature.icon} size={18} />
                </span>
                <div>
                  <h3>{feature.title}</h3>
                  <p className="small muted">{feature.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- FAQ */}
        <section className="app-section" aria-labelledby="faq-title">
          <h2 id="faq-title" className="app-section-title">
            Common questions
          </h2>
          <div className="app-faq">
            {FAQ.map((item) => (
              <details className="app-card app-faq-item" key={item.q}>
                <summary>
                  <span>{item.q}</span>
                  <Icon name="chevronDown" size={16} className="muted" />
                </summary>
                <p className="small muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- lyrics guide */}
        <section className="app-section" aria-labelledby="paste-title">
          <h2 id="paste-title" className="app-section-title">
            Pasting lyrics
          </h2>
          <div className="app-how">
            <article className="app-card app-how-card">
              <div className="app-how-head">
                <span className="app-how-num">1</span>
                <h3>Paste plain lyrics</h3>
              </div>
              <p className="small muted">
                Paste a whole song — verses, choruses, bridges — into the lyrics box.
                Aria splits it into parts automatically and labels each one (Verse,
                Chorus, Bridge, …). You can rename, reorder, or add parts by hand
                anytime.
              </p>
            </article>

            <article className="app-card app-how-card">
              <div className="app-how-head">
                <span className="app-how-num">2</span>
                <h3>Paste lyrics with chords</h3>
              </div>
              <p className="small muted">
                Write chords in square brackets on the syllable they fall on — for
                example <span className="mono">[C]</span> or
                <span className="mono">[F#m]</span>. Paste the whole thing and Aria
                keeps each chord glued to its word, so transposing the key moves the
                chords with the lyrics instead of leaving them behind.
              </p>
            </article>

            <article className="app-card app-how-card">
              <div className="app-how-head">
                <span className="app-how-num">3</span>
                <h3>Set the key</h3>
              </div>
              <p className="small muted">
                Tell Aria the key the chords are written in (or leave it blank — a
                song with no key simply has no chords to move). From there you can
                transpose any part up or down a semitone at a time, on its own or
                across the whole lineup.
              </p>
            </article>
          </div>
        </section>

        {/* -------------------------------------------------------------- footer */}
        <section className="app-card app-foot">
          <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h3 className="app-card-title">Ready when you are</h3>
              <p className="tiny muted">Sign in with email or Google. Your songs stay yours.</p>
            </div>
            <Logo size={36} />
          </div>
          <div className="app-foot-actions">
            <Link to={user ? '/' : '/register'} className="btn btn-primary">
              {user ? 'Open Aria' : 'Create an account'}
            </Link>
            {!user ? (
              <Link to="/login" className="btn">
                Log in
              </Link>
            ) : null}
          </div>
          <div className="app-foot-links">
            <Link to="/privacy" className="link-button tiny">
              Privacy policy
            </Link>
            <Link to={user ? '/onboarding' : '/login'} className="link-button tiny">
              Sign in
            </Link>
            {release?.notes ? <span className="tiny muted">{release.notes}</span> : null}
            {failed ? (
              <span className="tiny muted">Release details could not load — download anyway.</span>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
