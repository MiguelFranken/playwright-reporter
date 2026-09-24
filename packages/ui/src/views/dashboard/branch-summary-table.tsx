import { GitBranch } from 'lucide-react';
import { Link } from '../../provider';
import { EmptyState } from '../../patterns/empty-state';
import { StatusBadge } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import type { AnyStatus } from '../../lib/tone';

/** One git branch, summarised over the selected time range. */
export interface BranchSummaryRow {
  /** `null` groups the runs reported without a branch. */
  branch: string | null;
  environment: string | null;
  runs: number;
  lastRunAt: Date;
  lastRunNumber: number;
  lastStatus: AnyStatus | string;
  passRate: number | null;
}

export interface BranchSummaryHrefs {
  run: (number: number) => string;
  /** Optional so a host without branch pages can still render the summary. */
  branch?: (name: string) => string;
}
import { formatPercent, formatRelative } from '../../lib/format';
import { NO_BRANCH_LABEL, passRateClass } from '../../lib/branch';
import { cn } from '../../lib/cn';

export function BranchSummaryTable({ hrefs, rows }: { hrefs: BranchSummaryHrefs; rows: BranchSummaryRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={GitBranch} title="No runs in this range" description="Runs grouped by git branch will appear here." className="m-(--card-spacing) py-8" />;
  }
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[38%]">Branch</TableHead>
          <TableHead className="w-16 text-right">Runs</TableHead>
          <TableHead className="w-[26%]">Last run</TableHead>
          <TableHead className="w-24 text-right">Pass rate</TableHead>
          <TableHead className="w-28">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.branch ?? ''}>
            <TableCell className="max-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                {r.branch === null ? (
                  <span className="truncate text-muted-foreground">{NO_BRANCH_LABEL}</span>
                ) : hrefs.branch ? (
                  <Link href={hrefs.branch(r.branch)} className="truncate font-medium underline-offset-4 hover:underline" title={r.branch}>
                    {r.branch}
                  </Link>
                ) : (
                  <span className="truncate font-medium" title={r.branch}>
                    {r.branch}
                  </span>
                )}
                {r.environment ? (
                  <Badge variant="secondary" className="shrink-0">
                    {r.environment}
                  </Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.runs}</TableCell>
            <TableCell className="max-w-0">
              <Link
                href={hrefs.run(r.lastRunNumber)}
                className="block truncate text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                title={r.lastRunAt.toISOString()}
              >
                #{r.lastRunNumber} · {formatRelative(r.lastRunAt)}
              </Link>
            </TableCell>
            <TableCell className={cn('text-right font-medium tabular-nums', passRateClass(r.passRate))}>{formatPercent(r.passRate)}</TableCell>
            <TableCell>
              <StatusBadge status={r.lastStatus} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
