import type { Analysis } from '../lib/types';
import { Icon } from './Icon';
import { Chip } from './ui';

/**
 * Displays the lyric analysis: primary & secondary theme classes, emotional
 * tone, human-readable message summary, confidence bar, keywords, and lyric evidence.
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
  const strength = pct >= 62 ? 'Strong match' : pct >= 42 ? 'Clear match' : 'Subtle match';
  const secondary = analysis.signals?.[1]?.score ? analysis.signals[1].theme : null;

  return (
    <div className="analysis-box">
      <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="analysis-kicker">
          <Icon name="sparkle" size={14} />
          Lyric intelligence
        </span>
        <span className="analysis-score" title={`Confidence: ${pct}%`}>
          <span className="analysis-meter" aria-hidden="true">
            <span style={{ width: `${Math.max(18, Math.min(100, pct))}%` }} />
          </span>
          {strength} · {pct}%
        </span>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        <Chip tone="brand">{analysis.theme}</Chip>
        {secondary && secondary !== analysis.theme && <Chip>{secondary}</Chip>}
        {analysis.toneLabel && <Chip>{analysis.toneLabel}</Chip>}
        {analysis.suggestedTempo && (
          <Chip tone={analysis.suggestedTempo}>
            <Icon name={analysis.suggestedTempo} size={12} />
            Feels {analysis.suggestedTempo}
          </Chip>
        )}
      </div>

      <p className="analysis-message">{analysis.message}</p>

      {!compact && analysis.keywords && analysis.keywords.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {analysis.keywords.slice(0, 6).map((kw) => (
            <span key={kw} className="chip" style={{ fontSize: 11 }}>
              #{kw}
            </span>
          ))}
        </div>
      )}

      {!compact && analysis.evidence && analysis.evidence.length > 0 && (
        <div className="analysis-evidence">
          <div className="label">Key lyric resonance</div>
          <div className="stack-xs" style={{ marginTop: 6 }}>
            {analysis.evidence.map((line: string, i: number) => (
              <blockquote key={i} className="analysis-quote">
                “{line}”
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
