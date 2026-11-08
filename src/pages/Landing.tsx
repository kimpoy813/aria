import { useState } from 'react';
import { useStore } from '../lib/store';
import { Button, Icon, IconButton } from '../components/ui';
import { LogoHero, Wordmark } from '../components/Logo';

export function Landing() {
  const { signIn, theme, toggleTheme, error } = useStore();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setLocalError('Add a name to get started.');
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      await signIn(name.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not start.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <div className="landing">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <LogoHero />
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
          </IconButton>
        </div>

        <div>
          <Wordmark size={24} />
          <div className="eyebrow" style={{ marginTop: 10, marginBottom: 8 }}>
            Lyric-aware lineups
          </div>
          <h1>
            Aria reads your
            <br />
            lyrics, then builds
            <br />
            the set with you.
          </h1>
          <p className="lede" style={{ marginTop: 12 }}>
            Paste lyrics part by part. Aria names the message — love, faith, hope. Then drag a
            chorus here, a bridge there, and get a lineup that hasn't been used lately.
          </p>
        </div>

        <div className="steps">
          <div className="step">Add a song, one part at a time: verse, chorus, bridge.</div>
          <div className="step">Let the NLP pass name the class and message.</div>
          <div className="step">Build a lineup by dragging parts. Fast and slow in one set.</div>
          <div className="step">Teams join with a code and share. LRU keeps sets fresh.</div>
        </div>

        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              className="input"
              placeholder="e.g. Kim"
              value={name}
              autoComplete="given-name"
              onChange={(e) => {
                setName(e.target.value);
                setLocalError(null);
              }}
            />
            <span className="hint">Saved on this device. No password needed.</span>
          </div>
          {localError || error ? <p className="small" style={{ color: 'var(--danger)' }}>{localError || error}</p> : null}
          <Button type="submit" variant="primary" block disabled={busy || !name.trim()}>
            {busy ? 'Setting up…' : 'Enter Aria'}
            <Icon.Chevron />
          </Button>
        </form>
        <p className="tiny muted" style={{ textAlign: 'center' }}>
          Want to see it full? Make a profile, then join the demo team with code{' '}
          <strong>ARIA-123</strong>.
        </p>
      </div>
    </div>
  );
}
