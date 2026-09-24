import { Card, CardContent, CardHeader } from '../../components/card';
import { Skeleton } from '../../components/skeleton';
import { TableRowsSkeleton } from '../../patterns/skeletons';
import type { RunTab } from '../../lib/run-tab';

/**
 * Placeholders for a run's tab bodies.
 *
 * Each one traces the shape of the tab it stands for — four tiles and a grouped
 * list for the summary, two panes for the specs, stacked groups for the errors.
 * That is the whole point: a generic grey block tells you something is loading,
 * while a shaped one tells you *what* is loading, and the layout does not jump
 * when the real content lands on top of it.
 *
 * Every one of them is presentational and takes no data, so the client tab
 * strip can pick one the instant you click, before the server has answered.
 */

/** Stands in for the tab strip plus the summary body underneath it. */
export function RunTabsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex gap-6 border-b border-separator pb-2.5">
        {[70, 52, 54, 96].map((w, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: w }} />
        ))}
      </div>
      <RunTabSkeleton tab="summary" />
    </div>
  );
}

/** The body of one tab, chosen by name. */
export function RunTabSkeleton({ tab }: { tab: RunTab }) {
  switch (tab) {
    case 'specs':
      return <SpecsSkeleton />;
    case 'errors':
      return <ErrorsSkeleton />;
    case 'config':
      return <ConfigSkeleton />;
    default:
      return <SummarySkeleton />;
  }
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} size="sm" className="gap-3">
            <CardContent className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-7 w-10" />
              </div>
              <Skeleton className="size-7 rounded-lg" />
            </CardContent>
            <CardContent className="flex flex-col gap-1.5 border-t border-separator pt-2.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-80 max-w-full rounded-xl" />
          <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
          <Skeleton className="ms-auto h-8 w-28 rounded-lg" />
        </div>
        <ResultGroupsSkeleton />
      </div>
    </div>
  );
}

/**
 * The grouped result list on its own — what the summary swaps in when only the
 * outcome filter changes, since the tiles and toolbar above it stay put.
 */
export function ResultGroupsSkeleton({ groups = 2 }: { groups?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: groups }).map((_, i) => (
        <div key={i} className="panel overflow-hidden">
          <div className="flex items-center gap-2 bg-surface-sunken px-3 py-2.5">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-3.5 w-52 max-w-[40%]" />
            <Skeleton className="ms-auto h-5 w-20 rounded-md" />
          </div>
          <TableRowsSkeleton rows={3} columns={[4, 46, 22]} />
        </div>
      ))}
    </div>
  );
}

function SpecsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_1.8fr]" aria-hidden>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-e1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="ms-auto h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="panel overflow-hidden">
          <div className="bg-surface-sunken px-3 py-2">
            <Skeleton className="h-3.5 w-40" />
          </div>
          <TableRowsSkeleton rows={6} columns={[5, 52, 14]} />
        </div>
      </div>
    </div>
  );
}

function ErrorsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="flex items-center gap-2">
        <Skeleton className="h-3.5 w-72 max-w-[60%]" />
        <Skeleton className="ms-auto h-8 w-28 rounded-lg" />
      </div>
      {Array.from({ length: 3 }).map((_, group) => (
        <div key={group} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
          {Array.from({ length: group === 0 ? 2 : 1 }).map((_, row) => (
            <div key={row} className="panel flex items-center gap-2 px-3 py-2.5">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ConfigSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-hidden>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} size="sm">
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {Array.from({ length: 6 }).map((_, row) => (
              <div key={row} className="flex items-center gap-4">
                <Skeleton className="h-3.5 w-24 shrink-0" />
                <Skeleton className="h-3.5 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <Card size="sm" className="lg:col-span-2">
        <CardHeader>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <TableRowsSkeleton rows={3} columns={[18, 18, 14, 10, 18, 18]} className="panel" />
        </CardContent>
      </Card>
    </div>
  );
}

export function ResultSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-7 w-96 max-w-full" />
          </div>
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} size="sm">
            <CardHeader>
              <Skeleton className="h-3 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-6 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-md" />
            ))}
          </div>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
