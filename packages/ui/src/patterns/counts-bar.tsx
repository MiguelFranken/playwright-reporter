import { cn } from '../lib/cn';

/**
 * The outcome tally a run reports. Declared here because this is what renders
 * it; the app's query layer produces exactly this shape, so a projection that
 * stops matching fails type-checking rather than rendering a blank bar.
 */
export interface RunCounts {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  interrupted: number;
  running: number;
}

const SEGMENTS = [
  { key: 'passed', label: 'passed', fill: 'bg-success-solid', dot: 'bg-success-solid' },
  { key: 'flaky', label: 'flaky', fill: 'bg-warning-solid', dot: 'bg-warning-solid' },
  { key: 'failed', label: 'failed', fill: 'bg-danger-solid', dot: 'bg-danger-solid' },
  { key: 'interrupted', label: 'interrupted', fill: 'bg-danger-solid', dot: 'bg-danger-solid' },
  { key: 'skipped', label: 'skipped', fill: 'bg-neutral-solid', dot: 'bg-neutral-solid' },
  { key: 'running', label: 'running', fill: 'bg-info-solid animate-pulse', dot: 'bg-info-solid animate-pulse' },
] as const;

/**
 * A run's outcome tally: a proportional bar over its counts.
 *
 * **The bar carries composition; the number carries magnitude.** Every bar fills
 * its track, so a four-test run and a two-hundred-test one draw the same length
 * — which is why `showTotal` puts the size in front of the counts in words. The
 * obvious alternative, scaling each bar against the largest run on the page, was
 * tried and is worse: one 1,142-test run flattens every other row to a sliver,
 * and the composition the column exists to show becomes unreadable in all of
 * them. Length is the wrong channel for a spread that wide.
 *
 * **`density` is what makes a list readable.** Ten rows of
 * "passed · flaky · failed · skipped" is forty words of the same four, and the
 * repetition is all the eye sees. `compact` keeps the numbers and their dots and
 * moves the words to the accessible name, where a screen reader still reads
 * "10 passed" and colour is never the only carrier.
 */
export function CountsBar({
  counts,
  total,
  className,
  showNumbers = true,
  showTotal = false,
  density = 'comfortable',
}: {
  counts: RunCounts;
  /** This run's own size — `expectedTests` while it is still running. */
  total?: number;
  className?: string;
  showNumbers?: boolean;
  /** Leads the counts with the run's size. The bar cannot say it; this can. */
  showTotal?: boolean;
  /** `compact` drops the words to the accessible name. Use it in lists. */
  density?: 'comfortable' | 'compact';
}) {
  const denom = Math.max(total ?? counts.total, counts.total, 1);
  const segs = SEGMENTS.map((s) => ({ ...s, n: counts[s.key] })).filter((s) => s.n > 0);
  const shown = segs.length > 0 ? segs : [{ ...SEGMENTS[0], n: 0 }];
  const summary = segs.map((s) => `${s.n} ${s.label}`).join(', ');
  const label = `${denom.toLocaleString()} ${denom === 1 ? 'test' : 'tests'}`;

  return (
    <div className={cn('flex flex-col', density === 'compact' ? 'gap-2' : 'gap-1.5', className)}>
      {/* The 2px gaps are the separator between segments — no segment is
          stroked. The track shows through wherever a run has results still to
          come: a running run's expected total is its denominator. */}
      <div
        className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
        role="img"
        aria-label={summary ? `${label}: ${summary}` : 'No results'}
      >
        {segs.map((s) => (
          <div
            key={s.key}
            className={cn('rounded-[1px]', s.fill)}
            style={{ width: `${(s.n / denom) * 100}%` }}
            title={`${s.label}: ${s.n}`}
          />
        ))}
      </div>

      {showNumbers ? (
        <div
          className={cn(
            'flex flex-wrap text-body-xs text-muted-foreground tabular-nums',
            density === 'compact' ? 'gap-x-3 gap-y-1' : 'gap-x-3 gap-y-0.5',
          )}
          aria-hidden
        >
          {showTotal ? (
            <span className="whitespace-nowrap font-medium text-foreground">{label}</span>
          ) : null}
          {shown.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn('size-1.5 shrink-0 rounded-full', s.dot)} />
              <span className="font-medium text-foreground">{s.n}</span>
              {density === 'comfortable' ? s.label : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
