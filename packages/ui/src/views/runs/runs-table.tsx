import { ExternalLink } from 'lucide-react';
import { Link } from '../../provider';
import { cn } from '../../lib/cn';
import { commitTitle } from '../../lib/commit';
import { CountsBar } from '../../patterns/counts-bar';
import { StatusBadge } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { formatDateTime, formatDuration, formatRelative } from '../../lib/format';
import type { RunCounts } from '../../patterns/counts-bar';
import type { AnyStatus } from '../../lib/tone';

/**
 * A run as a list row renders it. Declared here rather than imported from the
 * database layer, so this lists exactly what the table reads — and so the query
 * that feeds it is checked against the view instead of the other way round.
 */
export interface RunListItem {
  id: string;
  number: number;
  status: AnyStatus | string;
  executor: 'ci' | 'local' | string;
  startedAt: Date;
  durationMs: number | null;
  expectedTests: number;
  counts: RunCounts;
  gitBranch: string | null;
  gitMessage: string | null;
  gitShortSha: string | null;
  /** Resolved by the host — the view does not know git providers. */
  gitCommitUrl: string | null;
  gitAuthorName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  environment: string | null;
  tags: string[];
}

export interface RunsTableHrefs {
  run: (number: number) => string;
}

export function RunsTable({ hrefs, runs }: { hrefs: RunsTableHrefs; runs: RunListItem[] }) {
  return (
    <div className="panel overflow-x-auto">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[140px]">Run</TableHead>
            <TableHead className="min-w-[280px]">Commit</TableHead>
            <TableHead className="min-w-[180px]">Branch &amp; env</TableHead>
            <TableHead className="min-w-[200px]">Results</TableHead>
            <TableHead className="w-[100px] text-right">Duration</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <RunRow key={run.id} hrefs={hrefs} run={run} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RunRow({ hrefs, run }: { hrefs: RunsTableHrefs; run: RunListItem }) {
  const href = hrefs.run(run.number);
  const commitUrl = run.gitCommitUrl;
  const title = commitTitle(run);
  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Link href={href} className="font-semibold tabular-nums hover:underline">
              #{run.number}
            </Link>
            <Badge variant="outline" className="h-4 px-1.5 text-label-xs">
              {run.executor === 'ci' ? 'CI' : 'Local'}
            </Badge>
          </div>
          {/* See ActiveRuns: a relative time in the reader's timezone cannot
              match what the server rendered. */}
          <span
            suppressHydrationWarning
            className="text-xs text-muted-foreground"
            title={formatDateTime(run.startedAt)}
          >
            {formatRelative(run.startedAt)}
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-[420px] align-top whitespace-normal">
        <div className="flex flex-col gap-1">
          <span className={cn('line-clamp-1 break-all', title.muted && 'text-muted-foreground')} title={run.gitMessage ?? undefined}>
            {title.text}
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {run.gitShortSha ? (
              commitUrl ? (
                <a href={commitUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:text-foreground hover:underline">
                  {run.gitShortSha}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <span className="font-mono">{run.gitShortSha}</span>
              )
            ) : null}
            {run.gitAuthorName ? <span className="truncate">{run.gitAuthorName}</span> : null}
            {run.prNumber ? (
              run.prUrl ? (
                <a href={run.prUrl} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
                  #{run.prNumber}
                </a>
              ) : (
                <span>#{run.prNumber}</span>
              )
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <div className="flex flex-col gap-1">
          <span className="text-code-s" title={run.gitBranch ?? undefined}>
            {run.gitBranch ?? <span className="text-muted-foreground">–</span>}
          </span>
          <div className="flex flex-wrap gap-1">
            {run.environment ? <Badge variant="secondary">{run.environment}</Badge> : null}
            {run.tags.map((t) => (
              <Badge key={t} variant="outline" className="h-4 px-1.5 text-label-xs">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </TableCell>
      <TableCell className="align-top">
        {/* Compact in a list: ten rows of the same four words is all the eye
            sees. The size leads, then the counts; the words move to the bar's
            accessible name. */}
        <CountsBar
          counts={run.counts}
          total={run.status === 'running' ? run.expectedTests : undefined}
          density="compact"
          showTotal
          className="min-w-[180px]"
        />
      </TableCell>
      <TableCell className="align-top text-right tabular-nums text-muted-foreground">{formatDuration(run.durationMs)}</TableCell>
      <TableCell className="align-top">
        <StatusBadge status={run.status} />
      </TableCell>
    </TableRow>
  );
}
