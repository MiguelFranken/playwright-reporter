import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { toneText, type Tone } from '../lib/tone';

/**
 * The frame every chart in the product sits in.
 *
 * A chart's headline is a *number*, not an axis. The frame states it — eyebrow,
 * value, movement — hands the plot the space under a hairline, and closes with
 * the legend. Reading top to bottom you get the answer, then the trend, then the
 * detail; the plot never has to caption itself, which is what lets it drop all
 * its own chrome.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ▣ PASS RATE                       [controls] │
 *   │ 94.2%   ↗ 2.1 pts vs the earlier half        │
 *   │ Across the last 30 finished runs.            │
 *   │ ┌───────┬───────┬───────┬───────┐            │
 *   │ │ RUNS  │ TESTS │ FAILED│ FLAKY │            │
 *   │ │ 30    │ 7,140 │ 113   │ 78    │            │
 *   │ └───────┴───────┴───────┴───────┘            │
 *   ├──────────────────────────────────────────────┤
 *   │ …plot…                                       │
 *   ├──────────────────────────────────────────────┤
 *   │ ● Passed 412   ● Flaky 18   ● Failed 3       │
 *   └──────────────────────────────────────────────┘
 *
 * It is not a Card: it composes *inside* one, so a page can put two charts in a
 * single card without two nested borders.
 */
export function ChartFrame({
  label,
  icon: Icon,
  value,
  delta,
  caption,
  stats,
  actions,
  legend,
  children,
  className,
}: {
  /** The eyebrow. Names the measure, not the chart. */
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** The headline number. Omit for a chart whose story is the shape, not a total. */
  value?: React.ReactNode;
  /** Rendered beside the value — a `<ChartDelta>`, normally. */
  delta?: React.ReactNode;
  /** A line under the headline: what the window is, what is excluded. */
  caption?: React.ReactNode;
  /** `<ChartStats>` — the numbers the headline is made of. */
  stats?: React.ReactNode;
  /** Top-right controls — a view switch, a range toggle. */
  actions?: React.ReactNode;
  /** `<ChartLegendChips>`, below the plot. */
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn('flex min-w-0 flex-col gap-4', className)}>
      <figcaption className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
              {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
              {label}
            </span>
            {value !== undefined ? (
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {/* Proportional figures: tabular digits make a headline look
                    loose at this size. Columns of numbers still get them. */}
                <span className="text-metric" style={{ fontVariantNumeric: 'proportional-nums' }}>
                  {value}
                </span>
                {delta}
              </span>
            ) : null}
            {caption ? <span className="text-body-xs text-muted-foreground">{caption}</span> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {stats}
        <hr className="border-separator" />
      </figcaption>

      <div className="min-w-0">{children}</div>

      {legend ? (
        <>
          <hr className="border-separator" />
          {legend}
        </>
      ) : null}
    </figure>
  );
}

const ARROW = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

/**
 * A signed movement beside a headline.
 *
 * Direction and judgement are separate: `goodWhen` says which way is the good
 * way for *this* measure, so a rising failure count reads red and a rising pass
 * rate reads green without the caller doing colour arithmetic. The arrow carries
 * the direction on its own, so colour is never the only signal.
 */
export function ChartDelta({
  value,
  direction,
  goodWhen = 'up',
  unit = '',
  comparedTo,
  className,
}: {
  /** The magnitude, already in display units. Rendered with an explicit sign. */
  value: number;
  direction: 'up' | 'down' | 'flat';
  /** Which direction is the welcome one. `none` keeps the movement neutral. */
  goodWhen?: 'up' | 'down' | 'none';
  unit?: string;
  /** What the comparison is against — "vs the earlier half", "vs last week". */
  comparedTo?: string;
  className?: string;
}) {
  const Arrow = ARROW[direction];
  const tone =
    direction === 'flat' || goodWhen === 'none'
      ? 'text-muted-foreground'
      : direction === goodWhen
        ? 'text-success-text'
        : 'text-danger-text';
  const magnitude = Math.abs(value);
  const sign = direction === 'flat' ? '' : direction === 'up' ? '+' : '−';

  return (
    <span className={cn('inline-flex items-baseline gap-1 text-body-s', className)}>
      <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', tone)}>
        <Arrow className="size-3.5 shrink-0 self-center" aria-hidden />
        {sign}
        {formatMagnitude(magnitude)}
        {unit}
      </span>
      {comparedTo ? <span className="text-muted-foreground">{comparedTo}</span> : null}
    </span>
  );
}

function formatMagnitude(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString();
  return (Math.round(n * 10) / 10).toLocaleString();
}

export interface LegendChip {
  label: string;
  /** A CSS colour or `var(--token)`. Drives the swatch only, never the text. */
  color: string;
  /** `line` for a rule the plot draws — an average, a threshold, a target. */
  shape?: 'dot' | 'line';
  /** The series' total over the window, right beside its name. */
  value?: React.ReactNode;
  /** A series with nothing in it. Dims the swatch, never the label. */
  muted?: boolean;
}

/**
 * The legend, always present once there are two series: identity must never
 * depend on matching a colour by eye. Text stays in ink; the swatch beside it
 * is the only thing wearing the series colour.
 */
export function ChartLegendChips({ items, className }: { items: LegendChip[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-5 gap-y-2', className)}>
      {/* A series with nothing in it is dimmed by fading its *swatch* and
          leaving its value in muted ink. Dimming the whole chip — the obvious
          way — drops the label under the contrast floor, which makes the one
          entry a reader most needs to check the hardest one to read. */}
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-body-xs">
          <span
            className={cn('shrink-0 rounded-[3px]', item.shape === 'line' ? 'h-0.5 w-4' : 'size-2')}
            style={{ background: item.color, opacity: item.muted ? 0.35 : 1 }}
            aria-hidden
          />
          <span className="text-muted-foreground">{item.label}</span>
          {item.value !== undefined ? (
            <span className={cn('font-medium tabular-nums', item.muted ? 'text-muted-foreground' : 'text-foreground')}>
              {item.value}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export interface ChartStat {
  label: string;
  value: React.ReactNode;
  /** Colours the value. Left off, it stays in the default ink. */
  tone?: Tone;
}

/**
 * The numbers the headline is made of, as an inset panel under it.
 *
 * A headline is one number and a reader's next question is always "out of
 * what?". Answering it here — in a recessed, divided strip rather than as more
 * body text — is what keeps the plot from having to carry labels it has no room
 * for, and it is the single element that makes a chart card read as composed
 * rather than as a chart with a sentence over it.
 *
 * A `dl` because that is what it is: terms and their definitions.
 */
export function ChartStats({ items, className }: { items: ChartStat[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-separator sm:grid-cols-4',
        className,
      )}
    >
      {/* The dividers are the 1px grid gap showing through a panel of hairline
          colour — one rule per boundary, and none on the outer edge. */}
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1 bg-surface-sunken px-3.5 py-2.5">
          <dt className="truncate text-eyebrow text-muted-foreground">{item.label}</dt>
          <dd className={cn('truncate text-label-m tabular-nums', item.tone && toneText[item.tone])}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
