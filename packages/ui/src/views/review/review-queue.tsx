import { GitBranch, GitPullRequest, Images } from 'lucide-react';
import { Button } from '../../components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { EmptyState } from '../../patterns/empty-state';
import { ReviewStatusBadge } from '../../patterns/review-status-badge';
import { StatusBadge } from '../../patterns/status-badge';
import { Link } from '../../provider';
import { formatDateTime, formatRelative } from '../../lib/format';
import type { ReviewCounts } from '../../lib/review';

export interface ReviewQueueRow {
  number: number;
  status: string;
  branch: string | null;
  commit: string | null;
  commitMessage: string | null;
  prNumber: number | null;
  startedAt: string;
  counts: ReviewCounts;
}

/**
 * The project's recent runs with review checkpoints, newest first, and what
 * each still asks of a reviewer. A run whose every image matches an approval
 * says so, so the list doubles as the answer to "is anything waiting on me?".
 */
export function ReviewQueue({
  rows,
  runHref,
  now,
}: {
  rows: readonly ReviewQueueRow[];
  /** The run's review page. */
  runHref: (number: number) => string;
  now?: Date;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="No runs with review checkpoints yet"
        description={
          <>
            Capture checkpoints with <code className="text-code-s">review(&apos;name&apos;)</code> from <code className="text-code-s">@miguelfranken/reporter/review</code> and they appear here after the next run.
          </>
        }
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Run</TableHead>
            <TableHead>Commit</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Needs review</TableHead>
            <TableHead className="text-right">Approved</TableHead>
            <TableHead className="sr-only">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const needs = r.counts.changed + r.counts.new;
            return (
              <TableRow key={r.number}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link href={runHref(r.number)} className="font-semibold tabular-nums hover:underline">
                      #{r.number}
                    </Link>
                    <StatusBadge status={r.status} />
                  </div>
                </TableCell>
                <TableCell className="max-w-80">
                  <p className="truncate text-sm" title={r.commitMessage ?? undefined}>
                    {r.commitMessage ?? '–'}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    {r.branch ? (
                      <span className="inline-flex min-w-0 items-center gap-1 truncate text-code-s">
                        <GitBranch className="size-3 shrink-0" />
                        {r.branch}
                      </span>
                    ) : null}
                    {r.prNumber ? (
                      <span className="inline-flex items-center gap-1">
                        <GitPullRequest className="size-3" />#{r.prNumber}
                      </span>
                    ) : null}
                    {r.commit ? <span className="text-code-s">{r.commit}</span> : null}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground" title={formatDateTime(r.startedAt)}>
                  {formatRelative(r.startedAt, now ? { now } : undefined)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {needs === 0 && r.counts.changes_requested === 0 ? <span className="text-sm text-muted-foreground">Nothing</span> : null}
                    {r.counts.changed ? <ReviewStatusBadge status="changed" label={`${r.counts.changed} changed`} /> : null}
                    {r.counts.new ? <ReviewStatusBadge status="new" label={`${r.counts.new} new`} /> : null}
                    {r.counts.changes_requested ? <ReviewStatusBadge status="changes_requested" label={`${r.counts.changes_requested} changes requested`} /> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.counts.approved}</TableCell>
                <TableCell className="text-right">
                  <Button variant={needs ? 'default' : 'outline'} size="sm" nativeButton={false} render={<Link href={runHref(r.number)} />}>
                    {needs ? 'Review' : 'View'}
                    <span className="sr-only"> run #{r.number}</span>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
