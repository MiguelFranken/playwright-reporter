import { statusDot } from '../lib/tone';
import { cn } from '../lib/cn';

/** Ten small cells, oldest on the left, newest on the right. */
export function HistorySparkline({
  history,
  current,
  className,
  cells = 10,
}: {
  /** Outcomes ordered newest first (as returned by the queries). */
  history: string[];
  /** Optional current outcome rendered as the last, highlighted cell. */
  current?: string;
  className?: string;
  cells?: number;
}) {
  const past = history.slice(0, current ? cells - 1 : cells).reverse();
  const items: { outcome: string | null; isCurrent: boolean }[] = [
    ...Array.from({ length: Math.max(0, (current ? cells - 1 : cells) - past.length) }, () => ({ outcome: null, isCurrent: false })),
    ...past.map((o) => ({ outcome: o, isCurrent: false })),
    ...(current ? [{ outcome: current, isCurrent: true }] : []),
  ];
  return (
    <div className={cn('flex items-center gap-0.5', className)} aria-label="Recent history">
      {items.map((c, i) => (
        <span
          key={i}
          title={c.outcome ?? 'no data'}
          className={cn(
            'h-3.5 w-1.5 rounded-[2px]',
            c.outcome ? statusDot[c.outcome] ?? 'bg-neutral-solid' : 'bg-chart-track',
            c.isCurrent && 'h-4 ring-1 ring-foreground/40',
          )}
        />
      ))}
    </div>
  );
}
