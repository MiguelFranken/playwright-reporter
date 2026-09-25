import { ExternalLink, GitBranch, GitPullRequest } from 'lucide-react';
import { Link } from '../../provider';
import { EmptyState } from '../../patterns/empty-state';
import { HistorySparkline } from '../../patterns/history-sparkline';
import { StatusBadge } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { passRateClass } from '../../lib/branch';
import { cn } from '../../lib/cn';
import { formatDateTime, formatDuration, formatPercent, formatRelative } from '../../lib/format';
import { pullRequestNoun, pullRequestRef } from '../../lib/pull-request';
import type { AnyStatus } from '../../lib/tone';

/** One pull or merge request in the list, summarised over the selected range. */
export interface PullRequestListRow {
  number: number;
  /** The latest title a run reported; older reporters send none. */
  title: string | null;
  /** The request on the git host. */
  url: string | null;
  /** The source branch its latest run reported. */
  branch: string | null;
  environment: string | null;
  lastAuthor: string | null;
  runs: number;
  lastRunAt: Date;
  lastRunNumber: number;
  lastStatus: AnyStatus | string;
  /** The latest runs' statuses, newest first. */
  recentStatuses: string[];
  avgDurationMs: number | null;
  passRate: number | null;
}

export interface PullRequestsTableHrefs {
  run: (number: number) => string;
  pullRequest: (number: number) => string;
  branch: (name: string) => string;
}

export function PullRequestsTable({
  hrefs,
  rows,
  now,
  emptyTitle = 'No pull requests in this range',
  emptyDescription = 'Runs that report a pull or merge request will appear here, grouped by it.',
}: {
  hrefs: PullRequestsTableHrefs;
  rows: PullRequestListRow[];
  /** Reference instant for relative times; stories pin it. */
  now?: Date;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={GitPullRequest} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="panel overflow-x-auto">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[320px]">Pull request</TableHead>
            <TableHead className="w-[120px]">Recent runs</TableHead>
            <TableHead className="w-20 text-right">Runs</TableHead>
            <TableHead className="w-24 text-right">Pass rate</TableHead>
            <TableHead className="w-28 text-right">Avg duration</TableHead>
            <TableHead className="min-w-[150px]">Last run</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <PullRequestRow key={r.number} hrefs={hrefs} row={r} now={now} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PullRequestRow({ hrefs, row: r, now }: { hrefs: PullRequestsTableHrefs; row: PullRequestListRow; now?: Date }) {
  const ref = pullRequestRef(r.number, r.url);
  return (
    // As in BranchesTable, the request's link stretches over the row; the
    // branch, git-host and last-run links sit above it (`relative z-10`).
    <TableRow className="relative">
      <TableCell className="max-w-[480px] whitespace-normal">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <GitPullRequest className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <Link
              href={hrefs.pullRequest(r.number)}
              className="min-w-0 truncate font-medium after:absolute after:inset-0 after:content-[''] hover:underline"
              title={r.title ?? `${pullRequestNoun(r.url)} ${ref}`}
            >
              <span className="tabular-nums text-muted-foreground">{ref}</span>
              {r.title ? ` ${r.title}` : null}
            </Link>
            {r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="relative z-10 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`Open ${ref} on the git host`}
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-5.5 text-xs text-muted-foreground">
            {r.branch ? (
              <Link href={hrefs.branch(r.branch)} className="relative z-10 inline-flex min-w-0 items-center gap-1 text-code-xs hover:text-foreground hover:underline" title={r.branch}>
                <GitBranch className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{r.branch}</span>
              </Link>
            ) : null}
            {r.lastAuthor ? <span className="truncate">{r.lastAuthor}</span> : null}
            {r.environment ? (
              <Badge variant="secondary" className="shrink-0">
                {r.environment}
              </Badge>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <HistorySparkline history={r.recentStatuses} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{r.runs.toLocaleString()}</TableCell>
      <TableCell className={cn('text-right font-medium tabular-nums', passRateClass(r.passRate))}>{formatPercent(r.passRate)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formatDuration(r.avgDurationMs)}</TableCell>
      <TableCell>
        <Link
          href={hrefs.run(r.lastRunNumber)}
          className="relative z-10 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          title={formatDateTime(r.lastRunAt)}
        >
          #{r.lastRunNumber} · <span suppressHydrationWarning>{formatRelative(r.lastRunAt, { now })}</span>
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge status={r.lastStatus} />
      </TableCell>
    </TableRow>
  );
}
