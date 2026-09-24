import { Badge } from '../components/badge';
import { cn } from '../lib/cn';
import { reliabilityLabel } from '../lib/reliability';
import { GRADE_TONE, gradeText, toneBadge, toneSolid, toneTrack } from '../lib/tone';

/**
 * A 0–100 score shown as `score / 100`, its grade word, and a track that fills
 * to the score. The denominator is drawn small and muted so the number itself
 * is what the eye lands on, and the grade word carries the judgement — colour
 * alone never does.
 *
 * `null` is "no data", not zero: a test nothing has run is not unreliable.
 */
export function ScoreMeter({
  score,
  label = 'Reliability',
  risk,
  trailing,
  className,
}: {
  score: number | null;
  label?: string;
  /** An extra warning pill, e.g. "Chronic" for a test that always fails. */
  risk?: React.ReactNode;
  /** Right-aligned context, e.g. the platform chip and the window it covers. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const grade = reliabilityLabel(score);
  const tone = GRADE_TONE[grade.tone];
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('text-metric tabular-nums', gradeText[grade.tone])}>{score ?? '–'}</span>
        <span className="text-body-s text-muted-foreground">/ 100</span>
        <span className="ms-1 text-label-m">{label}</span>
        <Badge variant="outline" className={cn('font-medium', toneBadge[tone])}>
          {grade.label}
        </Badge>
        {risk}
        {trailing ? <span className="ms-auto flex items-center gap-2">{trailing}</span> : null}
      </div>
      {/* Without a value there is nothing to measure, so the track drops the
          meter role rather than claiming one with no `aria-valuenow`
          (axe: aria-required-attr). */}
      <div
        className={cn('h-1.5 w-full overflow-hidden rounded-full', score === null ? 'bg-chart-track' : toneTrack[tone])}
        {...(score === null
          ? { 'aria-hidden': true }
          : {
              role: 'meter' as const,
              'aria-label': label,
              'aria-valuenow': score,
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuetext': `${score} of 100, ${grade.label}`,
            })}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-300', toneSolid[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
