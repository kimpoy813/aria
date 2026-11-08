import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BackBar, Button } from '../components/ui';
import { useStore } from '../lib/store';

export function DeleteAccountPage() {
  const { user, deleteAccount, notify } = useStore();
  const navigate = useNavigate();

  const [confirmWord, setConfirmWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.id === 'user_admin') {
    return <Navigate to="/" replace />;
  }

  const handleDelete = async () => {
    setError(null);
    if (confirmWord.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm permanent deletion.');
      notify('Type DELETE to confirm', 'error');
      return;
    }
    setBusy(true);
    try {
      await deleteAccount();
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete account.';
      setError(msg);
      notify(msg, 'error');
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar onBack={() => navigate(-1)} label="Back" />

      <div className="page-head">
        <h1>Delete account</h1>
        <p>Permanently erase your Aria account and associated data</p>
      </div>

      <div className="card stack-sm">
        <h2>What will be deleted</h2>
        <p className="small">
          Deleting your Aria account immediately and permanently removes:
        </p>
        <ul className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
          <li>Your profile, login credentials, and active sessions</li>
          <li>All songs, lyric sections, and classifications you created</li>
          <li>All lineups and public share links you own</li>
          <li>Your membership in shared teams (and any solo teams you own)</li>
        </ul>
        <p className="tiny">
          Retention period: None. Deletion is immediate and irreversible.
        </p>
      </div>

      <div className="card stack">
        <div className="stack-xs">
          <span className="label">Signed in as</span>
          <div style={{ fontWeight: 600 }}>{user.name}</div>
          {user.email && <div className="tiny">{user.email}</div>}
        </div>

        <div className="field">
          <label htmlFor="confirm-delete-input">
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            id="confirm-delete-input"
            className="input code-input"
            value={confirmWord}
            onChange={(e) => setConfirmWord(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <div className="stack-sm">
          <Button
            variant="danger"
            block
            disabled={busy || confirmWord.trim().toUpperCase() !== 'DELETE'}
            onClick={handleDelete}
          >
            {busy ? 'Deleting account…' : 'Permanently delete account'}
          </Button>
          <Button block disabled={busy} onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
