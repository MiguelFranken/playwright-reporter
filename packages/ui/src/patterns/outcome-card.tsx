import { Link } from '../provider';
import { Card, CardContent } from '../components/card';
import { cn } from '../lib/cn';
import { toneBadge, toneSolid, toneText, type Tone } from '../lib/tone';

/**
 * A headline count for one outcome, with the *reason* breakdown underneath.
 *
 * A bare "2 failed" tile makes you click to learn anything; the breakdown rows
 * ("Assertion 1 · Timeout 1") answer the next question in place. When there is
 * nothing to break down the card says so in words rather than showing an empty
 * list, so a zero-state still reads as an answer.
 *
 * It is a link when `href` is given — the run page filters itself to the
 * outcome — and `aria-current` rather than `aria-pressed` marks the active one,
 * because a link has no pressed state.
 */

export interface OutcomeBreakdownItem {
  label: string;
  /** Usually a count, but a percentage or ratio reads as well in the same slot. */
  value: React.ReactNode;
  /** Colours the dot; defaults to the card's own tone. */
  tone?: Tone;
}

export function OutcomeCard({
  label,
  count,
  tone,
  icon: Icon,
  href,
  active,
  breakdown = [],
  emptyLabel,
  className,
}: {
  label: string;
  count: number;
  tone: Tone;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  active?: boolean;
  breakdown?: OutcomeBreakdownItem[];
  /** Shown instead of the breakdown when there is none, e.g. "No flaky tests". */
  emptyLabel?: string;
  className?: string;
}) {
  const body = (
    <Card
      size="sm"
      className={cn(
        'h-full gap-3 transition-colors duration-150',
        href && 'group-hover:border-border-strong',
        active && ACTIVE_RING[tone],
        className,
      )}
    >
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-eyebrow text-muted-foreground">{label}</span>
          <span className={cn('text-metric tabular-nums', count > 0 ? toneText[tone] : 'text-muted-foreground')}>
            {count}
          </span>
        </div>
        {Icon ? (
          <span
            className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg border', toneBadge[tone])}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </CardContent>

      <CardContent className="mt-auto">
        {breakdown.length === 0 ? (
          <p className="text-body-xs text-muted-foreground">{emptyLabel ?? '—'}</p>
        ) : (
          <ul className="flex flex-col gap-1 border-t border-separator pt-2.5">
            {breakdown.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-body-xs">
                <span className={cn('size-1.5 shrink-0 rounded-full', toneSolid[item.tone ?? tone])} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
                <span className="shrink-0 rounded-md bg-surface-sunken px-1.5 py-px font-medium tabular-nums">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  if (!href) return body;
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
    >
      {body}
    </Link>
  );
}

const ACTIVE_RING: Record<Tone, string> = {
  success: 'border-success-border bg-success-subtle',
  warning: 'border-warning-border bg-warning-subtle',
  danger: 'border-danger-border bg-danger-subtle',
  info: 'border-info-border bg-info-subtle',
  neutral: 'border-border-strong bg-muted',
};
