'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import { Link } from '../../provider';
import { Button } from '../../components/button';
import { EmptyState } from '../../patterns/empty-state';
import { MetaChip } from '../../patterns/meta-chip';
import { StatusBadge } from '../../patterns/status-badge';
import { formatDateTime, formatDuration, formatRelative } from '../../lib/format';

/**
 * The run-by-run log for one test, paged rather than scrolled — "how far back
 * does this go" is a question a scrollbar answers badly.
 *
 * Its own module because paging is state and state means a client component,
 * while the overview around it renders on the server. Each row therefore
 * arrives with its link already resolved: a function cannot cross that
 * boundary, a string can.
 */

export interface RunHistoryRow {
  resultId: string;
  runNumber: number;
  startedAt: Date;
  outcome: string;
  durationMs: number;
  attemptCount: number;
  branch: string | null;
  href: string;
}

const PAGE_SIZES = [10, 25, 50];

export function RunHistory({ rows, now }: { rows: RunHistoryRow[]; now?: Date }) {
  const [pageSize, setPageSize] = React.useState<number>(PAGE_SIZES[0]!);
  const [page, setPage] = React.useState(1);

  if (rows.length === 0) {
    return <EmptyState icon={History} title="No runs yet" description="This test has not produced any results." />;
  }

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  // A shorter list (a narrower range, a new filter) can strand the cursor past
  // the end; clamping on render keeps the list from going blank.
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-label-m">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Run history
        </h2>
        <span className="text-body-xs text-muted-foreground tabular-nums">
          {rows.length} {rows.length === 1 ? 'run' : 'runs'}
        </span>
      </div>

      <ul className="panel divide-y divide-separator">
        {slice.map((h) => (
          <li key={h.resultId} className="relative flex items-center gap-2.5 px-3 py-2">
            <StatusBadge status={h.outcome} className="shrink-0" />
            <Link href={h.href} className="shrink-0 text-label-m tabular-nums after:absolute after:inset-0 after:content-['']">
              #{h.runNumber}
            </Link>
            {h.branch ? <MetaChip title={h.branch}>{h.branch}</MetaChip> : null}
            {h.attemptCount > 1 ? (
              <MetaChip className="border-warning-border bg-warning-subtle text-warning-text" title="Attempts">
                {h.attemptCount - 1}× retried
              </MetaChip>
            ) : null}
            <span className="ms-auto shrink-0 text-body-xs text-muted-foreground tabular-nums">{formatDuration(h.durationMs)}</span>
            <span
              className="w-28 shrink-0 truncate text-end text-body-xs text-muted-foreground"
              title={formatDateTime(h.startedAt)}
              suppressHydrationWarning
            >
              {formatRelative(h.startedAt, now ? { now } : undefined)}
            </span>
          </li>
        ))}
      </ul>

      {rows.length > PAGE_SIZES[0]! ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            Per page
            <select
              className="h-7 rounded-md border border-input bg-surface px-1.5 text-body-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="xs" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <span className="tabular-nums">
              {current} / {pages}
            </span>
            <Button variant="outline" size="xs" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
