import { GitBranch } from 'lucide-react';
import { Link } from '../../provider';
import { EmptyState } from '../../patterns/empty-state';
import { HistorySparkline } from '../../patterns/history-sparkline';
import { StatusBadge } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { NO_BRANCH_LABEL, passRateClass } from '../../lib/branch';
import { cn } from '../../lib/cn';
import { formatDateTime, formatDuration, formatPercent, formatRelative } from '../../lib/format';
import type { AnyStatus } from '../../lib/tone';

/** One git branch in the branches list, summarised over the selected range. */
export interface BranchListRow {
  /** `null` groups the runs reported without a branch; that row has no page to open. */
  branch: string | null;
  environment: string | null;
  runs: number;
  lastRunAt: Date;
  lastRunNumber: number;
  lastStatus: AnyStatus | string;
  /** The latest runs' statuses, newest first. */
  recentStatuses: string[];
  avgDurationMs: number | null;
  passRate: number | null;
}

export interface BranchesTableHrefs {
  run: (number: number) => string;
  branch: (name: string) => string;
}

export function BranchesTable({
  hrefs,
  rows,
  now,
  emptyTitle = 'No runs in this range',
  emptyDescription = 'Runs grouped by git branch will appear here.',
}: {
  hrefs: BranchesTableHrefs;
  rows: BranchListRow[];
  /** Reference instant for relative times; stories pin it. */
  now?: Date;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={GitBranch} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="panel overflow-x-auto">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[260px]">Branch</TableHead>
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
            <BranchRow key={r.branch ?? ''} hrefs={hrefs} row={r} now={now} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BranchRow({ hrefs, row: r, now }: { hrefs: BranchesTableHrefs; row: BranchListRow; now?: Date }) {
  return (
    // As in RunsTable, the branch link stretches over the row; the last-run
    // link sits above it (`relative z-10`) and keeps going to that run.
    <TableRow className="relative">
      <TableCell className="max-w-[420px]">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {r.branch === null ? (
            <span className="truncate text-muted-foreground">{NO_BRANCH_LABEL}</span>
          ) : (
            <Link
              href={hrefs.branch(r.branch)}
              className="truncate font-medium after:absolute after:inset-0 after:content-[''] hover:underline"
              title={r.branch}
            >
              {r.branch}
            </Link>
          )}
          {r.environment ? (
            <Badge variant="secondary" className="shrink-0">
              {r.environment}
            </Badge>
          ) : null}
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
