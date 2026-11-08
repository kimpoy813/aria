import type { Analysis } from '../lib/types';
import { Chip } from './ui';

/**
 * Minimalist lyric analysis summary: detected class, confidence, and core message.
 */
export function AnalysisCard({
  analysis,
  compact,
}: {
  analysis: Analysis;
  compact?: boolean;
}) {
  const pct =
    analysis.confidence <= 1
      ? Math.round(analysis.confidence * 100)
      : Math.round(analysis.confidence);

  return (
    <div className="analysis-box">
      <div className="row-between" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Chip tone="brand">{analysis.theme}</Chip>
          {analysis.toneLabel && <Chip>{analysis.toneLabel}</Chip>}
        </div>
        <span className="tiny">{pct}% match</span>
      </div>

      <p className="analysis-message">{analysis.message}</p>

      {!compact && analysis.evidence && analysis.evidence.length > 0 && (
        <blockquote className="analysis-quote">“{analysis.evidence[0]}”</blockquote>
      )}
    </div>
  );
}
