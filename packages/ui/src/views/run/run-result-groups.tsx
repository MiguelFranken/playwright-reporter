'use client';

import * as React from 'react';
import { ChevronDown, FileCode2, SearchX, Timer } from 'lucide-react';
import { Link } from '../../provider';
import { Badge } from '../../components/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/collapsible';
import { EmptyState } from '../../patterns/empty-state';
import { ErrorCategoryBadge } from '../../patterns/error-block';
import { HistorySparkline } from '../../patterns/history-sparkline';
import { MetaChip } from '../../patterns/meta-chip';
import { StatusIcon } from '../../patterns/status-badge';
import { cn } from '../../lib/cn';
import { firstLine } from '../../lib/ansi';
import { formatDuration } from '../../lib/format';
import { ArtifactIcons, type RunResultRow, type RunResultsHrefs } from './run-result';

/**
 * A run's results as collapsible groups, one per spec file.
 *
 * The old flat table gave every column equal weight — eight of them, most
 * empty for a passing test. Reading a run is not a spreadsheet task: you scan
 * for the red ones, and for each you want the suite it sits in, why it failed
 * and what it ran on. So the file becomes a header you can fold away, the
 * status becomes a glyph, and everything secondary drops to a chip row under
 * the title, where it costs no horizontal space.
 *
 * Groups holding a failure start open; all-green ones start closed, because a
 * file with nothing to say should not cost a screenful.
 */

const BAD = new Set(['failed', 'timedout', 'timedOut', 'interrupted', 'flaky']);

export interface ResultGroup {
  /** Group key — the spec file. */
  file: string;
  rows: RunResultRow[];
}

/** Buckets rows by file, preserving the order the server sorted them in. */
export function groupByFile(rows: RunResultRow[]): ResultGroup[] {
  const groups = new Map<string, RunResultRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.file);
    if (bucket) bucket.push(row);
    else groups.set(row.file, [row]);
  }
  return Array.from(groups, ([file, rs]) => ({ file, rows: rs }));
}

export function RunResultGroups({
  hrefs,
  rows,
  /** Forces every group open or closed; `undefined` leaves each to its own default. */
  expandAll,
  emptyTitle = 'No tests match',
  emptyDescription = 'Try a different filter or search term.',
}: {
  hrefs: RunResultsHrefs;
  rows: RunResultRow[];
  expandAll?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
}) {
  const groups = React.useMemo(() => groupByFile(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="panel">
        <EmptyState icon={SearchX} title={emptyTitle} description={emptyDescription} className="py-12" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <FileGroup key={group.file} hrefs={hrefs} group={group} expandAll={expandAll} />
      ))}
    </div>
  );
}

function FileGroup({
  hrefs,
  group,
  expandAll,
}: {
  hrefs: RunResultsHrefs;
  group: ResultGroup;
  expandAll?: boolean;
}) {
  const failing = group.rows.filter((r) => BAD.has(r.outcome)).length;
  const defaultOpen = failing > 0;
  const [open, setOpen] = React.useState(defaultOpen);
  // A group follows the expand-all switch whenever it flips, and is free again
  // as soon as the user toggles this one group.
  React.useEffect(() => {
    if (expandAll !== undefined) setOpen(expandAll);
  }, [expandAll]);

  const name = group.file.split('/').pop() ?? group.file;
  const dir = group.file.slice(0, group.file.length - name.length);
  const platforms = [...new Set(group.rows.map((r) => r.pwProject).filter(Boolean))];

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="panel overflow-hidden">
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2.5 text-start transition-colors duration-150',
          'bg-surface-sunken hover:bg-muted',
        )}
      >
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150', !open && '-rotate-90')} />
        <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate text-code-s" title={group.file}>
          {dir ? <span className="text-muted-foreground">{dir}</span> : null}
          <span className="font-medium">{name}</span>
        </span>
        <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">
          {group.rows.length} {group.rows.length === 1 ? 'test' : 'tests'}
        </span>
        {failing > 0 ? (
          <Badge variant="outline" className="h-5 shrink-0 border-danger-border bg-danger-subtle px-1.5 text-label-xs text-danger-text tabular-nums">
            {failing} failing
          </Badge>
        ) : null}
        <span className="ms-auto flex shrink-0 items-center gap-1">
          {platforms.slice(0, 2).map((p) => (
            <MetaChip key={p}>{p}</MetaChip>
          ))}
          {platforms.length > 2 ? <MetaChip>+{platforms.length - 2}</MetaChip> : null}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ul className="divide-y divide-separator border-t border-separator">
          {group.rows.map((row) => (
            <ResultRow key={row.id} hrefs={hrefs} row={row} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ResultRow({ hrefs, row }: { hrefs: RunResultsHrefs; row: RunResultRow }) {
  const suite = row.titlePath.slice(0, -1).filter(Boolean);
  const retries = Math.max(0, row.attemptCount - 1);
  const error = firstLine(row.errorMessage, 220);
  const kinds = [...new Set(row.attachmentKinds)];

  return (
    <li className="relative flex gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-muted/50">
      <StatusIcon status={row.outcome} className="mt-0.5" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {suite.length ? (
            <span className="truncate text-body-s text-muted-foreground" title={suite.join(' › ')}>
              {suite.join(' › ')} ›
            </span>
          ) : null}
          <Link
            href={hrefs.result(row.id)}
            className="min-w-0 text-label-m after:absolute after:inset-0 after:content-['']"
            title={row.title}
          >
            {row.title}
          </Link>
          {row.tags.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="h-4 px-1.5 text-label-xs font-normal">
              {t}
            </Badge>
          ))}
          {row.tags.length > 3 ? (
            <span className="text-label-xs text-muted-foreground">+{row.tags.length - 3}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {row.pwProject ? <MetaChip>{row.pwProject}</MetaChip> : null}
          <MetaChip icon={Timer} title="Duration">
            {formatDuration(row.durationMs)}
          </MetaChip>
          {retries > 0 ? (
            <MetaChip className="border-warning-border bg-warning-subtle text-warning-text" title="Retries">
              {retries}× retried
            </MetaChip>
          ) : null}
          {row.errorMessage ? <ErrorCategoryBadge message={row.errorMessage} /> : null}
          {kinds.length ? <ArtifactIcons kinds={kinds} /> : null}
          {row.history.length ? (
            <span className="ms-1" title="Recent outcomes, newest first">
              <HistorySparkline history={row.history} current={row.outcome} />
            </span>
          ) : null}
        </div>

        {error ? (
          <p className="truncate text-code-s text-danger-text" title={error}>
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
