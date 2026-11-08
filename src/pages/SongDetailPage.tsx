import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnalysisCard } from '../components/AnalysisCard';
import {
  BackBar,
  Button,
  Chip,
  Empty,
  Icon,
  IconButton,
  Sheet,
  Toast,
} from '../components/ui';
import { api } from '../lib/api';
import { analyzeLyrics } from '../lib/nlp';
import { useStore } from '../lib/store';

export function SongDetailPage() {
  const { id } = useParams();
  const { songs, teams, user, refresh } = useStore();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const song = songs.find((s) => s.id === id);
  if (!song) {
    return (
      <div className="stack">
        <BackBar onBack={() => navigate('/')} />
        <Empty icon="songs" title="Song not found" body="It may have been removed." />
      </div>
    );
  }

  const mine = song.ownerId === user?.id;
  const team = song.teamId ? teams.find((t) => t.id === song.teamId) : null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const copyToMine = async () => {
    setBusy(true);
    try {
      const res = await api.copySong(song.id);
      await refresh();
      showToast('Saved to your library');
      navigate(`/songs/${res.song.id}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not copy');
    } finally {
      setBusy(false);
    }
  };

  const copyPartLyrics = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${label}`);
    } catch {
      showToast('Clipboard unavailable');
    }
  };

  const analyzeNow = async () => {
    setBusy(true);
    try {
      const analysis = analyzeLyrics(song.parts);
      await api.updateSong(song.id, {
        analysis,
        theme: song.theme || analysis.theme,
      });
      await refresh();
      showToast(analysis.theme);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not analyze');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteSong(song.id);
      await refresh();
      navigate('/');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete');
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <BackBar
        onBack={() => navigate('/')}
        label="Songs"
        right={
          mine ? (
            <div className="row" style={{ gap: 6 }}>
              <IconButton
                label="Edit song"
                onClick={() => navigate(`/songs/${song.id}/edit`)}
              >
                <Icon name="edit" size={16} />
              </IconButton>
              <IconButton label="Delete song" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={16} />
              </IconButton>
            </div>
          ) : (
            <Button variant="primary" onClick={copyToMine} disabled={busy}>
              <Icon name="copy" size={14} /> Copy
            </Button>
          )
        }
      />

      <div className="stack-xs">
        <h1 className="detail-title">{song.title}</h1>
        <p className="small">{song.artist || 'Unknown artist'}</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          <Chip tone={song.tempo}>{song.tempo === 'fast' ? 'Fast' : 'Slow'}</Chip>
          {song.theme && <Chip tone="brand">{song.theme}</Chip>}
          {team && <Chip>{team.name}</Chip>}
          {!mine && <span className="tiny">by {song.ownerName}</span>}
        </div>
      </div>

      {song.analysis ? (
        <AnalysisCard analysis={song.analysis} />
      ) : mine ? (
        <Button onClick={analyzeNow} disabled={busy} block>
          <Icon name="sparkle" size={14} /> Classify lyrics
        </Button>
      ) : null}

      <div className="stack-sm">
        {song.parts.map((part) => {
          const lines = part.lyrics.split(/\r?\n/);
          return (
            <div key={part.id} className="part-block">
              <div className="part-head">
                <span className="part-title">{part.label}</span>
                <span className="push" />
                <IconButton
                  label={`Copy ${part.label}`}
                  className="icon-btn-ghost"
                  onClick={() => copyPartLyrics(part.label, part.lyrics)}
                  style={{ width: 30, height: 30 }}
                >
                  <Icon name="copy" size={14} />
                </IconButton>
              </div>
              <div className="part-body">
                {lines.map((line, i) => (
                  <div key={i} className="lyric-line">
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete song?"
        subtitle={`“${song.title}” will be removed permanently.`}
      >
        <div className="row" style={{ gap: 8 }}>
          <Button onClick={() => setConfirmDelete(false)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
