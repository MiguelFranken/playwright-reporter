import { CalendarClock, ExternalLink, GitBranch, GitCommitHorizontal, GitPullRequest, User } from 'lucide-react';
import { Link } from '../../provider';
import { Badge } from '../../components/badge';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../patterns/status-badge';
import { formatDateTime, formatRelative } from '../../lib/format';
import { pullRequestNoun, pullRequestRef } from '../../lib/pull-request';
import type { AnyStatus } from '../../lib/tone';

/** A pull or merge request over all of its runs — what its page leads with, whatever range is selected below. */
export interface PullRequestHeaderData {
  number: number;
  /** The latest title a run reported; older reporters send none. */
  title: string | null;
  url: string | null;
  /** The source branch its latest run reported. */
  branch: string | null;
  runs: number;
  firstRunAt: Date;
  lastRunAt: Date;
  lastRunNumber: number;
  lastStatus: AnyStatus | string;
  environment: string | null;
  lastMessage: string | null;
  lastAuthor: string | null;
}

export interface PullRequestHeaderHrefs {
  run: (number: number) => string;
  branch: (name: string) => string;
}

/**
 * Like the branch header: the latest run's status in front of the title,
 * because "is this request green right now?" is what anyone opening it asks.
 * The title is the request's own, with its reference (`!1524`, `#42`) in front
 * and a way out to the git host; `children` is the page's own controls.
 */
export function PullRequestHeader({
  pullRequest: pr,
  hrefs,
  now,
  children,
}: {
  pullRequest: PullRequestHeaderData;
  hrefs: PullRequestHeaderHrefs;
  /** Reference instant for relative times; stories pin it. */
  now?: Date;
  children?: React.ReactNode;
}) {
  const ref = pullRequestRef(pr.number, pr.url);
  const noun = pullRequestNoun(pr.url);
  const message = pr.lastMessage?.split('\n')[0]?.trim();
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <StatusBadge status={pr.lastStatus} className="h-6 px-2.5 text-sm" />
          <h1 className="inline-flex min-w-0 items-center gap-2 text-title-m md:text-title-l">
            <GitPullRequest className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 break-words">
              <span className="tabular-nums text-muted-foreground">{ref}</span> {pr.title ?? noun}
            </span>
          </h1>
          {pr.environment ? <Badge variant="secondary">{pr.environment}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {pr.url ? (
            <a href={pr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline">
              <ExternalLink className="size-3.5" aria-hidden />
              Open {noun.toLowerCase()}
            </a>
          ) : null}
          {pr.branch ? (
            <Link href={hrefs.branch(pr.branch)} className="inline-flex min-w-0 items-center gap-1.5 text-code-s hover:text-foreground hover:underline">
              <GitBranch className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{pr.branch}</span>
            </Link>
          ) : null}
          <Link href={hrefs.run(pr.lastRunNumber)} className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground hover:underline">
            <GitCommitHorizontal className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              Latest: #{pr.lastRunNumber}
              {message ? ` · ${message}` : null}
            </span>
          </Link>
          {pr.lastAuthor ? (
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" aria-hidden />
              {pr.lastAuthor}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5" title={`First run ${formatDateTime(pr.firstRunAt)}`}>
            <CalendarClock className="size-3.5" aria-hidden />
            <span suppressHydrationWarning>
              {pr.runs.toLocaleString()} {pr.runs === 1 ? 'run' : 'runs'} · first {formatRelative(pr.firstRunAt, { now })}
            </span>
          </span>
        </div>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function PullRequestHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-7 w-80 max-w-full" />
      </div>
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}
