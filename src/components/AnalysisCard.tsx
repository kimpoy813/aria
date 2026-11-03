import type { Analysis } from '../lib/types';
import { Icon } from './ui';

export function AnalysisCard({ analysis, compact }: { analysis: Analysis; compact?: boolean }) {
  const max = Math.max(...analysis.signals.map((s) => s.score), 1);
  return (
    <div className="analysis-block stack-sm">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow">Class / Message</div>
          <div className="serif" style={{ fontSize: 22, lineHeight: 1.15, marginTop: 2 }}>
            {analysis.theme}
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            about {analysis.about}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="badge">{analysis.confidence}% match</div>
          <div className="tiny muted" style={{ marginTop: 5 }}>
            {analysis.toneLabel}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{analysis.message}</p>

      {!compact && analysis.signals.length > 0 ? (
        <div className="score-grid" style={{ marginTop: 2 }}>
          {analysis.signals.slice(0, 3).map((signal) => (
            <div className="score-row" key={signal.theme}>
              <span className="truncate">{signal.theme}</span>
              <span className="score-track">
                <span
                  className="score-fill"
                  style={{ width: `${Math.round((signal.score / max) * 100)}%` }}
                />
              </span>
              <span className="tiny muted" style={{ textAlign: 'right' }}>
                {Math.round(signal.score)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {analysis.keywords.length > 0 ? (
        <div className="row wrap" style={{ gap: 5 }}>
          {analysis.keywords.slice(0, compact ? 3 : 6).map((word) => (
            <span className="chip" key={word} style={{ fontSize: 11 }}>
              {word}
            </span>
          ))}
        </div>
      ) : null}

      {!compact ? (
        <div className="row wrap tiny muted" style={{ gap: 4, marginTop: 2 }}>
          <Icon.Sparkle size={13} />
          <span>Tempo read: {analysis.suggestedTempo}</span>
          <span>·</span>
          <span>{analysis.wordCount} content words</span>
        </div>
      ) : null}
    </div>
  );
}
