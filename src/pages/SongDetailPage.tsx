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
    setTimeout(() => setToast(null), 2200);
  };

  const copyToMine = async () => {
    setBusy(true);
    try {
      const res = await api.copySong(song.id);
      await refresh();
      showToast('Copied to your personal library');
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
      showToast(`Classified as ${analysis.theme}`);
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
              <Button onClick={() => navigate(`/songs/${song.id}/edit`)}>
                <Icon name="edit" size={14} /> Edit
              </Button>
              <IconButton label="Delete song" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={16} />
              </IconButton>
            </div>
          ) : (
            <Button variant="primary" onClick={copyToMine} disabled={busy}>
              <Icon name="copy" size={14} /> Copy to my songs
            </Button>
          )
        }
      />

      <div className="card song-hero">
        <div className="stack-xs">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <Chip tone={song.tempo}>
              <Icon name={song.tempo} size={12} />
              {song.tempo === 'fast' ? 'Fast tempo' : 'Slow tempo'}
            </Chip>
            {song.theme && <Chip tone="brand">{song.theme}</Chip>}
            <Chip>
              {song.parts.length} {song.parts.length === 1 ? 'part' : 'parts'}
            </Chip>
            {team && (
              <Chip>
                <Icon name="teams" size={12} /> {team.name}
              </Chip>
            )}
          </div>

          <h1 className="song-hero-title">{song.title}</h1>
          <p className="song-hero-artist">{song.artist || 'Unknown artist'}</p>

          {!mine && <span className="tiny">Shared by {song.ownerName}</span>}
          {song.copiedFrom && <span className="tiny">Copied from {song.copiedFrom}</span>}
        </div>
      </div>

      {song.analysis ? (
        <AnalysisCard analysis={song.analysis} />
      ) : mine ? (
        <div className="card row-between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="label">Lyric intelligence</div>
            <p className="small">Generate a theme class and message summary from these lyrics.</p>
          </div>
          <Button variant="primary" onClick={analyzeNow} disabled={busy}>
            <Icon name="sparkle" size={14} /> Classify lyrics
          </Button>
        </div>
      ) : null}

      <div className="stack-sm">
        <div className="row-between">
          <span className="label">Song structure &amp; lyrics</span>
          <span className="tiny">Swipe long lines horizontally</span>
        </div>

        {song.parts.map((part, idx) => {
          const lines = part.lyrics.split(/\r?\n/);
          const partClass =
            part.lyrics.trim().length > 12 ? analyzeLyrics([part]).theme : null;
          return (
            <div key={part.id} className="part-block">
              <div className="part-head">
                <span className="part-index">{idx + 1}</span>
                <strong style={{ fontSize: 14 }}>{part.label}</strong>
                {partClass && partClass !== song.theme && <Chip>{partClass}</Chip>}
                <span className="push" />
                <IconButton
                  label={`Copy ${part.label} lyrics`}
                  onClick={() => copyPartLyrics(part.label, part.lyrics)}
                  style={{ width: 32, height: 32 }}
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
        subtitle={`“${song.title}” will be removed from your library and any lineups referencing its parts.`}
      >
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <Button onClick={() => setConfirmDelete(false)} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy} style={{ flex: 1 }}>
            <Icon name="trash" size={16} /> {busy ? 'Deleting…' : 'Delete song'}
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
