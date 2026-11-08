import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wordmark } from '../components/Logo';
import { Button, Icon, IconButton } from '../components/ui';
import type { IconName } from '../components/Icon';
import { useStore } from '../lib/store';

interface Step {
  eyebrow: string;
  title: string;
  body: string;
  points: { icon: IconName; text: string }[];
  art: 'lyrics' | 'classify' | 'sequence' | 'team';
}

const STEPS: Step[] = [
  {
    eyebrow: 'Welcome to Aria',
    title: 'Structure every song,\npart by part.',
    body:
      'Capture verses, choruses, bridges, and outros as modular blocks so you can mix and arrange them effortlessly.',
    points: [
      { icon: 'lyrics', text: 'Paste full lyrics to split automatically, or craft part by part' },
      { icon: 'fast', text: 'Tag each song as Fast or Slow to balance your setlist energy' },
    ],
    art: 'lyrics',
  },
  {
    eyebrow: 'Lyric Intelligence',
    title: 'Lyrics reveal their\nown meaning.',
    body:
      'One tap reads your verses and choruses to classify the song’s core theme and summarize its emotional message.',
    points: [
      { icon: 'sparkle', text: 'Eight lyrical classes: Love, Hope, Faith, Joy, Longing, and more' },
      { icon: 'edit', text: 'Refine the suggested class or tempo anytime before saving' },
    ],
    art: 'classify',
  },
  {
    eyebrow: 'Sequence Builder',
    title: 'Arrange balanced sets\nthat stay fresh.',
    body:
      'Drag parts across songs into custom sequences. Aria checks tempo balance and rotates least-recently-used lineups to the top.',
    points: [
      { icon: 'lineup', text: 'Live guardrails ensure 2+ songs with both Fast and Slow dynamics' },
      { icon: 'clock', text: 'Least-recently-used rotation keeps your setlists feeling fresh' },
    ],
    art: 'sequence',
  },
  {
    eyebrow: 'Teams & Sharing',
    title: 'Collaborate cleanly,\nshare in one link.',
    body:
      'Create a team workspace to share songs and lineups, copy items to customize personally, and send read-only lyric sheets.',
    points: [
      { icon: 'teams', text: 'Invite bandmates with a simple team code' },
      { icon: 'share', text: 'Public share links open cleanly without requiring an account' },
    ],
    art: 'team',
  },
];

function Art({ kind }: { kind: Step['art'] }) {
  if (kind === 'classify') {
    return (
      <div className="onb-art" aria-hidden="true">
        <div className="onb-class-row">
          <span className="chip brand">
            <Icon name="sparkle" size={12} /> Hope
          </span>
          <span className="chip">Renewal</span>
          <span className="onb-confidence">Strong match · 84%</span>
        </div>
        <div className="onb-bars">
          <span style={{ width: '84%' }} />
          <span style={{ width: '48%' }} />
          <span style={{ width: '26%' }} />
        </div>
        <p className="onb-quote">“Morning breaks across the quiet ridge”</p>
      </div>
    );
  }

  if (kind === 'sequence') {
    return (
      <div className="onb-art onb-seq" aria-hidden="true">
        {[
          { part: 'Verse 1', song: 'Opening Hymn', tone: 'slow' as const },
          { part: 'Chorus', song: 'Rising Light', tone: 'fast' as const },
          { part: 'Bridge', song: 'Quiet Anchor', tone: 'slow' as const },
        ].map((row, idx) => (
          <div key={row.part} className="onb-seq-row">
            <Icon name="drag" size={14} />
            <span className="onb-seq-index">{idx + 1}</span>
            <span className={`chip ${row.tone}`}>{row.part}</span>
            <span className="small truncate">{row.song}</span>
            <Icon name={row.tone} size={14} />
          </div>
        ))}
        <div className="onb-seq-foot">
          <Icon name="clock" size={12} />
          <span>Balanced Fast + Slow · Ready for rotation</span>
        </div>
      </div>
    );
  }

  if (kind === 'team') {
    return (
      <div className="onb-art onb-team" aria-hidden="true">
        <span className="tiny muted">Team invite code</span>
        <div className="onb-code">ARIA-•••</div>
        <div className="onb-members">
          {['AR', 'JM', 'KL'].map((init) => (
            <span key={init} className="onb-avatar">
              {init}
            </span>
          ))}
          <span className="onb-avatar onb-avatar-add">
            <Icon name="add" size={12} />
          </span>
        </div>
        <div className="onb-team-row">
          <Icon name="share" size={14} />
          <span>Share read-only lyric programs in one tap</span>
        </div>
      </div>
    );
  }

  return (
    <div className="onb-art" aria-hidden="true">
      <div className="row-between">
        <span className="onb-song-title">Morning Anthem</span>
        <span className="chip slow">
          <Icon name="slow" size={12} /> Slow
        </span>
      </div>
      {['Verse 1', 'Chorus', 'Bridge'].map((label, idx) => (
        <div key={label} className="onb-part">
          <span className="onb-part-tag">{label}</span>
          <div className="onb-lines">
            <span style={{ width: idx === 1 ? '88%' : '76%' }} />
            <span style={{ width: idx === 2 ? '56%' : '66%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OnboardingPage({ replay = false }: { replay?: boolean }) {
  const { completeOnboarding, theme, toggleTheme } = useStore();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const finish = (destination = '/') => {
    completeOnboarding();
    navigate(destination, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && index < STEPS.length - 1) setIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index]);

  return (
    <div className="onb">
      <header className="onb-top">
        <Wordmark size={26} />
        <div className="row" style={{ gap: 8 }}>
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
          </IconButton>
          <button type="button" className="link-button onb-skip" onClick={() => finish('/')}>
            {replay ? 'Close' : 'Skip'}
          </button>
        </div>
      </header>

      <div className="onb-body" key={index}>
        <Art kind={step.art} />

        <div className="onb-head">
          <span className="eyebrow">
            Step {index + 1} of {STEPS.length} · {step.eyebrow}
          </span>
          <h1 className="onb-title">{step.title}</h1>
          <p className="onb-copy">{step.body}</p>
        </div>

        <ul className="onb-points">
          {step.points.map((point) => (
            <li key={point.text}>
              <span className="onb-point-icon">
                <Icon name={point.icon} size={16} />
              </span>
              <span>{point.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="onb-foot">
        <div className="onb-dots" role="tablist" aria-label="Onboarding steps">
          {STEPS.map((s, i) => (
            <button
              key={s.eyebrow}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Step ${i + 1}: ${s.eyebrow}`}
              className={`onb-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>

        <div className="onb-actions">
          {index > 0 ? (
            <IconButton label="Previous step" onClick={() => setIndex((i) => i - 1)}>
              <Icon name="back" size={18} />
            </IconButton>
          ) : (
            <span />
          )}

          {last ? (
            <div className="row" style={{ flex: 1, gap: 8 }}>
              {!replay && (
                <Button
                  className="onb-next"
                  onClick={() => finish('/songs/new')}
                >
                  <Icon name="add" size={16} /> Add first song
                </Button>
              )}
              <Button variant="primary" className="onb-next" onClick={() => finish('/')}>
                {replay ? 'Back to studio' : 'Open studio'}
                <Icon name="chevronRight" size={16} />
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              className="onb-next"
              onClick={() => setIndex((i) => i + 1)}
            >
              Continue
              <Icon name="chevronRight" size={16} />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
