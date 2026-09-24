import { GitBranch } from 'lucide-react';
import { Link } from '../../provider';
import { CountsBar } from '../../patterns/counts-bar';
import { StatusBadge, StatusDot } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';
import { formatDateTime, formatRelative } from '../../lib/format';
import type { RunListItem, RunsTableHrefs } from './runs-table';

export interface ShardProgress {
  shardIndex: number;
  status: string;
}

export type ActiveRun = RunListItem & { shardTotal: number; shards: ShardProgress[] };

export function ActiveRuns({ hrefs, runs }: { hrefs: RunsTableHrefs; runs: ActiveRun[] }) {
  if (runs.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Active runs <span className="tabular-nums">({runs.length})</span>
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {runs.map((run) => (
          <ActiveRunCard key={run.id} hrefs={hrefs} run={run} />
        ))}
      </div>
    </section>
  );
}

function ActiveRunCard({ hrefs, run }: { hrefs: RunsTableHrefs; run: ActiveRun }) {
  const finished = run.counts.total - run.counts.running;
  const expected = Math.max(run.expectedTests, run.counts.total);
  return (
    <Link
      href={hrefs.run(run.number)}
      className="group flex flex-col gap-3 rounded-xl border border-info-border bg-info-subtle p-4 transition-colors duration-150 hover:border-info-solid/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status="running" />
          <span className="font-semibold tabular-nums">#{run.number}</span>
        </div>
        {/* Relative to the reader's clock and formatted in their timezone, so
            the server's render of it is never the string they should see. */}
        <span
          suppressHydrationWarning
          className="shrink-0 text-xs text-muted-foreground"
          title={formatDateTime(run.startedAt)}
        >
          started {formatRelative(run.startedAt)}
        </span>
      </div>
      <p className="truncate text-sm" title={run.gitMessage ?? undefined}>
        {run.gitMessage ?? <span className="text-muted-foreground">No commit message</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {run.gitBranch ? (
          <span className="inline-flex items-center gap-1 font-mono">
            <GitBranch className="size-3" />
            {run.gitBranch}
          </span>
        ) : null}
        {run.environment ? <Badge variant="secondary">{run.environment}</Badge> : null}
        <Badge variant="outline">{run.executor === 'ci' ? 'CI' : 'Local'}</Badge>
      </div>
      <div className="flex flex-col gap-1.5">
        <CountsBar counts={run.counts} total={expected} showNumbers={false} />
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>
            {finished} of {expected} tests finished
          </span>
          {run.counts.failed > 0 ? <span className="text-danger-text">{run.counts.failed} failed</span> : null}
        </div>
      </div>
      {run.shardTotal > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: run.shardTotal }, (_, i) => {
            const shard = run.shards.find((s) => s.shardIndex === i + 1);
            const status = shard?.status ?? 'skipped';
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-label-xs tabular-nums text-muted-foreground"
                title={shard ? `Shard ${i + 1}: ${status}` : `Shard ${i + 1}: waiting`}
              >
                <StatusDot status={status} className="size-1.5" />
                {i + 1}
              </span>
            );
          })}
        </div>
      ) : null}
    </Link>
  );
}
