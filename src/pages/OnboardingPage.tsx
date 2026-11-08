import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wordmark } from '../components/Logo';
import { Button, Icon, IconButton } from '../components/ui';
import { useStore } from '../lib/store';

interface Step {
  title: string;
  body: string;
  art: 'lyrics' | 'classify' | 'sequence' | 'team';
}

const STEPS: Step[] = [
  {
    title: 'Songs by section',
    body: 'Save verses, choruses, and bridges as modular blocks — or paste full lyrics to split automatically.',
    art: 'lyrics',
  },
  {
    title: 'Worship lyric intelligence',
    body: 'Aria reads your lyrics to classify each song’s Christian worship theme and summarize its Biblical message for your church service.',
    art: 'classify',
  },
  {
    title: 'Balanced lineups',
    body: 'Arrange song parts into sequences mixing fast and slow tempos, rotated by least recently used.',
    art: 'sequence',
  },
  {
    title: 'Simple collaboration',
    body: 'Share repertoire with a team invite code and send read-only lyric links in one tap.',
    art: 'team',
  },
];

function Art({ kind }: { kind: Step['art'] }) {
  if (kind === 'classify') {
    return (
      <div className="onb-art" aria-hidden="true">
        <div className="row-between">
          <span className="chip brand">Grace &amp; Salvation</span>
          <span className="tiny">91% match</span>
        </div>
        <div className="onb-bars">
          <span style={{ width: '91%' }} />
          <span style={{ width: '54%' }} />
        </div>
        <p className="onb-quote">“Christ alone, Cornerstone — weak made strong in the Savior’s love”</p>
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
            <span className="onb-seq-index">{idx + 1}</span>
            <span className="small truncate">{row.song}</span>
            <span className={`chip ${row.tone}`}>{row.part}</span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'team') {
    return (
      <div className="onb-art onb-team" aria-hidden="true">
        <span className="tiny">Invite code</span>
        <div className="onb-code">ARIA-•••</div>
        <div className="onb-members">
          {['AR', 'JM', 'KL'].map((init) => (
            <span key={init} className="onb-avatar">
              {init}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="onb-art" aria-hidden="true">
      <div className="row-between">
        <strong style={{ fontSize: 15 }}>Morning Anthem</strong>
        <span className="chip slow">Slow</span>
      </div>
      {['Verse 1', 'Chorus'].map((label, idx) => (
        <div key={label} className="onb-part">
          <span className="tiny">{label}</span>
          <div className="onb-lines">
            <span style={{ width: idx === 1 ? '88%' : '76%' }} />
            <span style={{ width: '62%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OnboardingPage({ replay = false }: { replay?: boolean }) {
  const { completeOnboarding, theme, toggleTheme, notify } = useStore();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const finish = (destination = '/') => {
    completeOnboarding();
    if (!replay) notify('All set — ready to add your worship songs!', 'success');
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
        <Wordmark size={24} />
        <div className="row" style={{ gap: 6 }}>
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="icon-btn-ghost"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
          </IconButton>
          <button type="button" className="btn btn-quiet" onClick={() => finish('/')}>
            {replay ? 'Done' : 'Skip'}
          </button>
        </div>
      </header>

      <div className="onb-body" key={index}>
        <Art kind={step.art} />

        <div className="onb-head">
          <h1 className="onb-title">{step.title}</h1>
          <p className="onb-copy">{step.body}</p>
        </div>
      </div>

      <footer className="onb-foot">
        <div className="onb-dots" role="tablist" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Step ${i + 1}`}
              className={`onb-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>

        <div className="onb-actions">
          {index > 0 ? (
            <IconButton label="Previous" onClick={() => setIndex((i) => i - 1)}>
              <Icon name="back" size={18} />
            </IconButton>
          ) : (
            <span />
          )}

          {last ? (
            <Button variant="primary" className="onb-next" onClick={() => finish('/')}>
              Get started
            </Button>
          ) : (
            <Button
              variant="primary"
              className="onb-next"
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
