import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, Icon, IconButton, type IconName } from '../components/ui';
import { useStore } from '../lib/store';

interface Step {
  eyebrow: string;
  title: string;
  body: string;
  points?: { icon: IconName; text: string }[];
  art: 'songs' | 'classify' | 'lineup' | 'team';
}

const STEPS: Step[] = [
  {
    eyebrow: 'Welcome to Aria',
    title: 'Read the lyric.\nFind the message.\nBuild the set.',
    body: 'Aria is a setlist companion. It reads your lyrics, names what the song is about, then helps you shape parts into lineups that never repeat themselves.',
    art: 'songs',
  },
  {
    eyebrow: 'Step 1 · Songs',
    title: 'Add a song one\npart at a time.',
    body: 'Type or paste each section separately — verse, chorus, bridge — and label it. Every part becomes a piece you can use on its own later.',
    points: [
      { icon: 'lyrics', text: 'Verse, chorus, bridge, pre-chorus, intro, outro' },
      { icon: 'songs', text: 'Order parts, or repeat a chorus twice' },
    ],
    art: 'songs',
  },
  {
    eyebrow: 'Step 2 · Class & message',
    title: 'Let the lyrics\nname themselves.',
    body: 'Aria reads the words and tells you the class — love, faith, hope, longing, grief — with the line that carried it.',
    points: [
      { icon: 'sparkle', text: 'A class, a message, and how confident it is' },
      { icon: 'fast', text: 'A tempo reading: fast or slow' },
    ],
    art: 'classify',
  },
  {
    eyebrow: 'Step 3 · Lineups',
    title: 'Build by the part,\nnot the whole song.',
    body: 'Drag a chorus from one song and a bridge from another. Need the chorus twice? Drop it in again.',
    points: [
      { icon: 'drag', text: 'Drag parts in, reorder any time' },
      { icon: 'fast', text: 'A lineup needs one fast and one slow track' },
      { icon: 'clock', text: 'Least recently used sets are suggested first' },
    ],
    art: 'lineup',
  },
  {
    eyebrow: 'Step 4 · Teams',
    title: 'Share the room,\nnot just the link.',
    body: 'Join a team with a code, then copy songs and lineups from each other. Sharing a lineup link marks it as used, so the next suggestion stays fresh.',
    points: [
      { icon: 'teams', text: 'Create a team, or join with a code' },
      { icon: 'copy', text: 'Copy a song or a whole lineup' },
      { icon: 'link', text: 'Send a view-only link with full lyrics' },
    ],
    art: 'team',
  },
];

function Art({ kind }: { kind: Step['art'] }) {
  if (kind === 'classify') {
    return (
      <div className="onb-art onb-art-card">
        <div className="onb-class-row">
          <span className="chip brand">Love</span>
          <span className="onb-confidence">84% match</span>
        </div>
        <div className="onb-bars">
          <span style={{ width: '100%' }} />
          <span style={{ width: '62%' }} />
          <span style={{ width: '38%' }} />
        </div>
        <p className="onb-quote">“Stay, stay, the harbor light is low”</p>
      </div>
    );
  }

  if (kind === 'lineup') {
    return (
      <div className="onb-art onb-art-card onb-seq">
        {[
          { part: 'Verse 1', song: 'Harbor Light', tone: 'slow' },
          { part: 'Chorus', song: 'Paper Kites', tone: 'fast' },
          { part: 'Bridge', song: 'Still Water', tone: 'slow' },
        ].map((row, index) => (
          <div className="onb-seq-row" key={row.part}>
            <Icon name="drag" size={14} />
            <span className="onb-seq-index">{index + 1}</span>
            <span className="chip brand">{row.part}</span>
            <span className="truncate small">{row.song}</span>
            <Icon name={row.tone === 'fast' ? 'fast' : 'slow'} size={14} />
          </div>
        ))}
        <div className="onb-seq-foot">
          <Icon name="clock" size={14} /> Least recently used
        </div>
      </div>
    );
  }

  if (kind === 'team') {
    return (
      <div className="onb-art onb-art-card onb-team">
        <div className="onb-code">ARIA-123</div>
        <div className="onb-members">
          {['AS', 'YOU'].map((initials) => (
            <span key={initials} className="onb-avatar">
              {initials}
            </span>
          ))}
          <span className="onb-avatar onb-avatar-add">
            <Icon name="add" size={14} />
          </span>
        </div>
        <div className="onb-team-row">
          <Icon name="copy" size={14} /> Copied “Faith &amp; Hope Opener”
        </div>
      </div>
    );
  }

  return (
    <div className="onb-art onb-art-card onb-song">
      <div className="onb-song-title">Harbor Light</div>
      <div className="onb-part-tag">Verse 1</div>
      <div className="onb-lines">
        <span style={{ width: '92%' }} />
        <span style={{ width: '78%' }} />
        <span style={{ width: '86%' }} />
      </div>
      <div className="onb-part-tag">Chorus</div>
      <div className="onb-lines">
        <span style={{ width: '88%' }} />
        <span style={{ width: '64%' }} />
      </div>
    </div>
  );
}

export function OnboardingPage({ replay = false }: { replay?: boolean }) {
  const navigate = useNavigate();
  const { completeOnboarding, joinTeam, user } = useStore();
  const [step, setStep] = useState(0);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = () => {
    completeOnboarding();
    navigate('/', { replace: true });
  };

  const next = () => {
    if (last) finish();
    else setStep((s) => s + 1);
  };

  const joinDemo = async () => {
    setBusy(true);
    try {
      await joinTeam('ARIA-123');
      setJoined(true);
    } catch {
      /* the team may already be joined or removed */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onb">
      <header className="onb-top">
        <span className="wordmark onb-brand">
          <Logo size={24} />
          Aria
        </span>
        <button type="button" className="link-button onb-skip" onClick={finish}>
          {replay ? 'Close' : 'Skip'}
        </button>
      </header>

      <div className="onb-body" key={step}>
        <div className="onb-head">
          <div className="eyebrow">{current.eyebrow}</div>
          <h1 className="onb-title">{current.title}</h1>
          <p className="onb-copy">{current.body}</p>
        </div>

        <Art kind={current.art} />

        {current.points ? (
          <ul className="onb-points">
            {current.points.map((point) => (
              <li key={point.text}>
                <span className="onb-point-icon">
                  <Icon name={point.icon} size={16} />
                </span>
                {point.text}
              </li>
            ))}
          </ul>
        ) : null}

        {last && user ? (
          <div className="onb-cta">
            <div className="onb-cta-text">
              <strong>Try it with the demo team</strong>
              <span className="small muted">Code ARIA-123 · starter songs included</span>
            </div>
            <Button
              size="sm"
              variant={joined ? 'soft' : 'default'}
              onClick={joinDemo}
              disabled={busy || joined}
            >
              {joined ? (
                <>
                  <Icon name="check" size={14} /> Joined
                </>
              ) : (
                'Join team'
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <footer className="onb-foot">
        <div className="onb-dots" role="tablist" aria-label="Onboarding progress">
          {STEPS.map((s, i) => (
            <button
              key={s.eyebrow}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Step ${i + 1}: ${s.eyebrow}`}
              className={`onb-dot ${i === step ? 'active' : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        <div className="onb-actions">
          {step > 0 ? (
            <IconButton label="Previous step" onClick={() => setStep((s) => s - 1)}>
              <Icon name="back" size={18} />
            </IconButton>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={next} className="onb-next">
            {last ? 'Start with my songs' : 'Next'}
            <Icon name="chevronRight" size={16} />
          </Button>
        </div>
      </footer>
    </div>
  );
}
