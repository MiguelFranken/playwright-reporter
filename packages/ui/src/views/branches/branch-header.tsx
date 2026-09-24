import { CalendarClock, GitBranch, GitCommitHorizontal, User } from 'lucide-react';
import { Link } from '../../provider';
import { Badge } from '../../components/badge';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../patterns/status-badge';
import { formatDateTime, formatRelative } from '../../lib/format';
import type { AnyStatus } from '../../lib/tone';

/** A branch over all of its history — what its page leads with, whatever range is selected below. */
export interface BranchHeaderData {
  branch: string;
  runs: number;
  firstRunAt: Date;
  lastRunAt: Date;
  lastRunNumber: number;
  lastStatus: AnyStatus | string;
  environment: string | null;
  lastMessage: string | null;
  lastAuthor: string | null;
}

export interface BranchHeaderHrefs {
  run: (number: number) => string;
}

/**
 * The branch name is the title; the latest run's status sits in front of it,
 * because "is this branch green right now?" is the first thing anyone opening
 * it wants to know. `children` is the page's own controls (the range toggle).
 */
export function BranchHeader({
  branch: b,
  hrefs,
  now,
  children,
}: {
  branch: BranchHeaderData;
  hrefs: BranchHeaderHrefs;
  /** Reference instant for relative times; stories pin it. */
  now?: Date;
  children?: React.ReactNode;
}) {
  const message = b.lastMessage?.split('\n')[0]?.trim();
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <StatusBadge status={b.lastStatus} className="h-6 px-2.5 text-sm" />
          <h1 className="inline-flex min-w-0 items-center gap-2 text-title-m md:text-title-l">
            <GitBranch className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 break-all">{b.branch}</span>
          </h1>
          {b.environment ? <Badge variant="secondary">{b.environment}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Link href={hrefs.run(b.lastRunNumber)} className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground hover:underline">
            <GitCommitHorizontal className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              Latest: #{b.lastRunNumber}
              {message ? ` · ${message}` : null}
            </span>
          </Link>
          {b.lastAuthor ? (
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" aria-hidden />
              {b.lastAuthor}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5" title={`First run ${formatDateTime(b.firstRunAt)}`}>
            <CalendarClock className="size-3.5" aria-hidden />
            <span suppressHydrationWarning>
              {b.runs.toLocaleString()} {b.runs === 1 ? 'run' : 'runs'} · first {formatRelative(b.firstRunAt, { now })}
            </span>
          </span>
        </div>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function BranchHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-7 w-64" />
      </div>
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}
