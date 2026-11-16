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

    appRelease()
      .then(setRelease)
      .catch(() => setFailed(true));

    return () => {
      window.removeEventListener('aria:installable', onInstallable);
      window.removeEventListener('aria:installed', onInstalled);
    };
  }, []);

  const size = formatBytes(release?.sizeBytes);
  const digest = shortDigest(release?.sha256);
  const apkReady = Boolean(release?.available && release.url);
  const mirroring = release?.mirrorStatus === 'fetching';
  const mirrorFailed = release?.mirrorStatus === 'failed';

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
    // Let the browser handle it: /downloads/aria.apk answers with Content-Disposition.
    window.location.href = release.url;
    try {
      const next = await appRelease();
      setRelease(next);
    } catch {
      /* the counter is cosmetic */
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
          <div className="app-hero-mark">
            <Logo size={64} />
          </div>
          <div className="eyebrow">Aria · Android &amp; web</div>
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
              {apkReady ? `Android APK${release?.version ? ` v${release.version}` : ''}` : 'Android · iPhone · web'}
            </span>
            <span>
              <Icon name="check" size={13} />
              {apkReady ? `${size ?? 'Small'} download` : `Web app · ${size ?? 'no download'}`}
            </span>
            <span>
              <Icon name="check" size={13} /> Works offline
            </span>
          </div>
        </section>

        {/* -------------------------------------------------------- at a glance */}
        <section className="app-card app-glance" aria-label="At a glance">
          <div className="app-glance-row">
            <span className="app-glance-icon">
              <Icon name="device" size={16} />
            </span>
            <div>
              <div className="app-glance-title">On your phone</div>
              <p className="tiny muted">
                Android 8 and newer. {apkReady ? `${size} install file, sideloaded once.` : 'Install from the browser in seconds.'}
              </p>
            </div>
          </div>
          <div className="app-glance-row">
            <span className="app-glance-icon">
              <Icon name="monitor" size={16} />
            </span>
            <div>
              <div className="app-glance-title">Anywhere else</div>
              <p className="tiny muted">
                The same account on the web — iPhone, tablet and desktop included.
              </p>
            </div>
          </div>
          <div className="app-glance-row">
            <span className="app-glance-icon">
              <Icon name="lock" size={16} />
            </span>
            <div>
              <div className="app-glance-title">Before you install</div>
              <p className="tiny muted">
                Android will warn that this came from outside Google Play. That is expected for a
                direct download — the checksum below is here so you can verify the file.
              </p>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- download */}
        {apkReady ? (
          <section className="app-card app-download" aria-labelledby="download-title">
            <div className="app-download-head">
              <div>
                <h2 id="download-title" className="app-card-title">
                  Download the APK
                </h2>
                <p className="tiny muted">
                  Direct install file · {release?.fileName ?? 'aria.apk'}
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
              <div>
                <dt>Downloads</dt>
                <dd>{release?.downloads ?? '—'}</dd>
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
              Android will ask you to allow installs from this browser the first time. You may also
              need to allow installs for Aria under Settings → Apps → Special access.
            </p>
          </section>
        ) : (
          <section className="app-card app-download" aria-labelledby="pwa-title">
            <div className="app-download-head">
              <div>
                <h2 id="pwa-title" className="app-card-title">
                  Install without a download
                </h2>
                <p className="tiny muted">Home-screen app · no store account needed</p>
              </div>
              <span className="chip brand">Fastest</span>
            </div>
            <p className="small">
              Aria is a full app in the browser already. Adding it to your home screen gives you the
              same full-screen experience, an icon, and offline access — on Android, iPhone and
              desktop.
            </p>
            {mirroring ? (
              <p className="app-mirror tiny muted">
                <Icon name="refresh" size={13} /> Fetching the latest build — this takes a moment the
                first time.
              </p>
            ) : null}
            {mirrorFailed ? (
              <p className="app-mirror tiny muted">
                <Icon name="refresh" size={13} /> The download is being prepared and is not ready
                yet. The home-screen install below works right now.
              </p>
            ) : null}
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
              disabled={installed}
            >
              <Icon name={installed ? 'check' : 'device'} size={16} />
              {installed ? 'Installed' : installable ? 'Install Aria now' : 'Show me how'}
            </button>
          </section>
        )}

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
