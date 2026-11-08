import type { Analysis } from '../lib/types';
import { Chip } from './ui';

/**
 * Clean, minimal lyric classification summary: worship theme, message, and optional edit trigger.
 */
export function AnalysisCard({
  analysis,
  onEdit,
}: {
  analysis: Analysis;
  compact?: boolean;
  onEdit?: () => void;
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
          {analysis.manualOverride && <span className="tiny">Edited</span>}
        </div>
        {onEdit ? (
          <button type="button" className="link-button tiny" onClick={onEdit}>
            Edit message
          </button>
        ) : (
          !analysis.manualOverride && <span className="tiny">{pct}% match</span>
        )}
      </div>

      <p className="analysis-message">{analysis.message}</p>
    </div>
  );
}
