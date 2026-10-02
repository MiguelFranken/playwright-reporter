'use client';

import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '../../components/button';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import {
  AI_MODE_LABELS,
  ANALYSIS_HYPOTHESIS_LABELS,
  ANALYSIS_RECOMMENDATION_LABELS,
  ANALYSIS_STATUS_LABELS,
  formatMicroUsd,
  type AiMode,
  type AnalysisSuggestionView,
  type AnalysisView,
  type Rect,
} from '../../lib/visual-diff';

export interface AnalysisPanelProps {
  /** Whether a new analysis may be started, and why not. */
  allowed: boolean;
  reason?: string | null;
  mode?: AiMode | null;
  /** The analyses of this comparison, newest first. */
  analyses: readonly AnalysisView[];
  /** Starting one; `pending` while the request is on its way. */
  onAnalyze?: () => void;
  pending?: boolean;
  /** A person's decision about a suggestion. */
  onDecide?: (input: { suggestionId: string; decision: 'accepted' | 'rejected'; rects?: Rect[] }) => void;
  /** Opens the editor with the rectangles drawn in, to adjust before saving. */
  onEditRects?: (rects: Rect[]) => void;
  /** Shows a region on the image. */
  onFocusRegion?: (regionId: string) => void;
  decidingId?: string | null;
  className?: string;
}

const UNCERTAINTY: Record<AnalysisSuggestionView['uncertainty'], string> = { low: 'fairly sure', medium: 'unsure', high: 'very unsure' };

/**
 * The AI's reading of a comparison, beside the measurement: a button that
 * asks a model once (within the project's budget), the analyses made so far,
 * and per region what it saw, what it suspects, how sure it is and what it
 * would do — with any tight areas it proposes, measured, for a person to
 * accept, adjust or reject. Nothing here happens without that person.
 */
export function AnalysisPanel({ allowed, reason, mode, analyses, onAnalyze, pending = false, onDecide, onEditRects, onFocusRegion, decidingId, className }: AnalysisPanelProps) {
  const latest = analyses[0] ?? null;
  const running = latest && (latest.status === 'queued' || latest.status === 'running');
  return (
    <section className={cn('flex flex-col gap-2', className)} aria-label="AI analysis">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label-s text-muted-foreground">AI analysis</h3>
        {mode && mode !== 'off' ? <span className="text-label-xs text-muted-foreground">{AI_MODE_LABELS[mode]}</span> : null}
        <span className="flex-1" />
        {onAnalyze ? (
          <Button size="xs" variant="outline" disabled={!allowed || pending || Boolean(running)} onClick={onAnalyze} title={!allowed && reason ? reason : 'Ask a model what these regions are: a random name, a clock, a real change. One call, within the project’s budget.'}>
            {pending || running ? <Loader2 className="motion-safe:animate-spin" /> : <Sparkles />} {latest ? 'Analyse again' : 'Suggest dynamic areas'}
          </Button>
        ) : null}
      </div>
      {!allowed && reason ? <p className="text-xs text-muted-foreground">{reason}</p> : null}
      {latest ? <AnalysisResult analysis={latest} onDecide={onDecide} onEditRects={onEditRects} onFocusRegion={onFocusRegion} decidingId={decidingId} /> : allowed ? <p className="text-xs text-muted-foreground">No analysis yet. A model can say what the regions are — an observation to check, not a verdict.</p> : null}
      {analyses.length > 1 ? <p className="text-label-xs text-muted-foreground">{analyses.length - 1} earlier {analyses.length === 2 ? 'analysis' : 'analyses'} of this comparison.</p> : null}
    </section>
  );
}

function AnalysisResult({ analysis, onDecide, onEditRects, onFocusRegion, decidingId }: { analysis: AnalysisView } & Pick<AnalysisPanelProps, 'onDecide' | 'onEditRects' | 'onFocusRegion' | 'decidingId'>) {
  const cost = analysis.actualMicroUsd !== null ? `cost ${formatMicroUsd(analysis.actualMicroUsd)}` : `reserved ${formatMicroUsd(analysis.reservedMicroUsd)}`;
  if (analysis.status === 'queued' || analysis.status === 'running')
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 motion-safe:animate-spin" /> {ANALYSIS_STATUS_LABELS[analysis.status]} with {analysis.model} ({cost}).
      </p>
    );
  if (analysis.status !== 'done')
    return (
      <p className="flex items-start gap-1.5 text-xs text-warning-text" role="status">
        <AlertTriangle className="mt-px size-3.5 shrink-0" />
        <span>
          {ANALYSIS_STATUS_LABELS[analysis.status]}
          {analysis.error ? `: ${analysis.error}` : '.'}
        </span>
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {analysis.model} · {formatDateTime(analysis.createdAt)} · {cost}
      </p>
      {analysis.summary ? <p className="text-sm text-pretty">{analysis.summary}</p> : null}
      <ol className="flex flex-col gap-2" aria-label="Suggestions">
        {analysis.suggestions.map((s) => (
          <li key={s.id} className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-sunken p-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="rounded-full bg-surface px-1.5 text-label-xs text-danger-text ring-1 ring-danger-border outline-none hover:bg-danger-subtle focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => onFocusRegion?.(s.regionId)} aria-label={`Show region ${s.regionLabel}`}>
                {s.regionLabel}
              </button>
              <span className="font-medium">{ANALYSIS_HYPOTHESIS_LABELS[s.hypothesis]}</span>
              <span className="text-muted-foreground">· {UNCERTAINTY[s.uncertainty]}</span>
              <span className="flex-1" />
              <span className="text-muted-foreground">{ANALYSIS_RECOMMENDATION_LABELS[s.recommendation]}</span>
            </div>
            <p className="text-pretty">{s.observation}</p>
            {s.alternatives.length ? <p className="text-muted-foreground">Could also be: {s.alternatives.join('; ')}.</p> : null}
            {s.proposedRects.length ? (
              <div className="flex flex-col gap-1.5 rounded-md bg-surface p-2 ring-1 ring-border">
                <p className="tabular-nums">
                  Proposes leaving out {s.proposedRects.map((r) => `${r.width} × ${r.height} px at ${r.x}, ${r.y}`).join(' and ')}
                  {s.effect ? ` — ${s.effect.suppressedPixels.toLocaleString('en')} of ${s.effect.rawChangedPixels.toLocaleString('en')} changed px, ${s.effect.remainingPixels.toLocaleString('en')} would remain.` : '.'}
                </p>
                {s.decision === 'open' ? (
                  <div className="flex flex-wrap gap-1.5">
                    {onDecide ? (
                      <Button size="xs" disabled={decidingId === s.id} onClick={() => onDecide({ suggestionId: s.id, decision: 'accepted' })}>
                        <Check /> Accept as a rule
                      </Button>
                    ) : null}
                    {onEditRects ? (
                      <Button size="xs" variant="outline" onClick={() => onEditRects(s.proposedRects)}>
                        Adjust first
                      </Button>
                    ) : null}
                    {onDecide ? (
                      <Button size="xs" variant="ghost" disabled={decidingId === s.id} onClick={() => onDecide({ suggestionId: s.id, decision: 'rejected' })}>
                        <X /> Reject
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className={cn('text-label-xs', s.decision === 'accepted' ? 'text-success-text' : 'text-muted-foreground')}>{s.decision === 'accepted' ? 'Accepted as a rule.' : 'Rejected.'}</p>
                )}
              </div>
            ) : s.recommendation === 'consider_ignore' ? (
              <p className="text-muted-foreground">No tight box could be drawn: nothing to leave out.</p>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-label-xs text-muted-foreground">A hypothesis from two images is not a proof: check the producing test and its data. A proposal becomes a rule only when you accept it.</p>
    </div>
  );
}
