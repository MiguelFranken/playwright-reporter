import { Card, CardContent, CardHeader } from '../components/card';
import { Skeleton } from '../components/skeleton';
import { cn } from '../lib/cn';

/**
 * Fallbacks used inside already-rendered chrome. A page's headings, card
 * frames and toolbars are static and paint with the shell; only the rows,
 * values and plots below them are placeholders.
 */

export function TableRowsSkeleton({
  rows = 8,
  columns = [40, 30, 15, 15],
  className,
}: {
  rows?: number;
  /** Relative widths, in percent, of each placeholder cell. */
  columns?: number[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-separator px-4 py-3.5 last:border-b-0">
          {columns.map((width, j) => (
            <Skeleton key={j} className="h-4" style={{ width: `${width}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="flex flex-col" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-separator px-5 py-3 last:border-b-0">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  // The placeholder has the frame's anatomy, not just a grey box: headline,
  // hairline, plot, legend. Whatever lands cannot then shift the card's height.
  const heights = [52, 74, 38, 88, 64, 46, 80, 58, 92, 42];
  return (
    <div className={cn('flex flex-col gap-4', className)} aria-hidden>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
          <Skeleton className="h-9 w-56 rounded-[10px]" />
        </div>
        <Skeleton className="h-px w-full" />
      </div>
      <div className="flex h-64 w-full items-end gap-3 pb-6">
        {heights.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} size="sm" className="gap-2" aria-hidden>
          <CardHeader>
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

/** Placeholder for a filter bar whose options come from the database. */
export function FilterSkeleton({ widths = [140, 140, 140] }: { widths?: number[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-hidden>
      {widths.map((w, i) => (
        <Skeleton key={i} className="h-9 rounded-lg" style={{ width: w }} />
      ))}
    </div>
  );
}
