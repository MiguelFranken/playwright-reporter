import { cn } from '../lib/cn';
import { toneText, type Tone } from '../lib/tone';

/**
 * A row of small label-over-value statistics — the kind that sits under a
 * headline number and qualifies it (failure rate, streak, average duration).
 *
 * Deliberately not a card each: these are one reading taken from several
 * angles, so they share a surface and only the labels separate them. A stat
 * with nothing to report is omitted by the caller rather than rendered as a
 * dash, which keeps the row honest about how much is actually known.
 *
 * Labels and hints wrap rather than truncate — the grid is narrow inside a
 * drawer, and a clipped "Top failing bra…" is worse than two lines.
 */

export interface Stat {
  label: string;
  value: React.ReactNode;
  /** Colours the value; omitted values stay in the default ink. */
  tone?: Tone;
  /** Small text under the value, e.g. a comparison or a unit. */
  hint?: React.ReactNode;
  /** Renders the value in the mono family — branch names, SHAs, hosts. */
  mono?: boolean;
}

export function StatGrid({
  stats,
  columns = 4,
  className,
}: {
  stats: Stat[];
  /** Widest breakpoint's column count; narrower ones halve it. */
  columns?: 3 | 4 | 5;
  className?: string;
}) {
  if (stats.length === 0) return null;
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3',
        columns === 4 && 'lg:grid-cols-4',
        columns === 5 && 'lg:grid-cols-5',
        className,
      )}
    >
      {stats.map((s) => (
        // A `div` inside a `dl` may hold only `dt`/`dd` pairs, so the hint
        // lives inside the `dd` rather than beside it (axe: definition-list).
        <div key={s.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-eyebrow text-balance text-muted-foreground">{s.label}</dt>
          <dd className="min-w-0">
            <span
              className={cn(
                'block truncate text-label-l tabular-nums',
                s.mono && 'text-code-s',
                s.tone && toneText[s.tone],
              )}
            >
              {s.value}
            </span>
            {s.hint ? <span className="block text-body-xs text-pretty text-muted-foreground">{s.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
