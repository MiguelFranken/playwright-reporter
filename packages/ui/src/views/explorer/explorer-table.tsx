'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Link } from '../../provider';
import { StatusBadge } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import type { ExplorerSort, SortDir } from '../../lib/explorer-sort';

export type { ExplorerSort, SortDir };

/** One test as the explorer lists it, aggregated over the selected range. */
export interface ExplorerRow {
  testId: string;
  title: string;
  titlePath: string[];
  file: string;
  pwProject: string;
  tags: string[];
  lastOutcome: string;
  lastRunAt: Date;
  lastRunNumber: number;
  lastBranch: string | null;
  runs: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  flakyRate: number;
  failureRate: number;
  reliability: number | null;
  avgDurationMs: number | null;
  streak: number;
}

export interface ExplorerTableHrefs {
  run: (number: number) => string;
}

import { formatDuration, formatPercent, formatRelative } from '../../lib/format';
import { reliabilityLabel } from '../../lib/reliability';
import { cn } from '../../lib/cn';
import { gradeText as toneText } from '../../lib/tone';

interface Column {
  key: ExplorerSort | null;
  label: string;
  align?: 'left' | 'right';
  defaultDir?: 'asc' | 'desc';
  className?: string;
}

const COLUMNS: Column[] = [
  { key: 'title', label: 'Test case', defaultDir: 'asc', className: 'min-w-72' },
  { key: null, label: 'Last status' },
  { key: 'lastRun', label: 'Last run', defaultDir: 'desc' },
  { key: 'reliability', label: 'Reliability', align: 'right', defaultDir: 'asc' },
  { key: 'flakyRate', label: 'Flaky %', align: 'right', defaultDir: 'desc' },
  { key: 'failureRate', label: 'Failure %', align: 'right', defaultDir: 'desc' },
  { key: 'runs', label: 'Runs', align: 'right', defaultDir: 'desc' },
  { key: 'avgDuration', label: 'Avg duration', align: 'right', defaultDir: 'desc' },
  { key: null, label: 'Platform' },
];

export function ExplorerTable({
  hrefs,
  rows,
  sort,
  dir,
  activeTestId,
  onSortChange,
  onSelectTest,
  onTestIntent,
  isPending,
}: {
  hrefs: ExplorerTableHrefs;
  rows: ExplorerRow[];
  sort: ExplorerSort;
  dir: SortDir;
  activeTestId?: string;
  /** Sorting and selection are the host's state; the table only reports intent. */
  onSortChange: (sort: ExplorerSort, dir: SortDir) => void;
  onSelectTest: (testId: string) => void;
  /**
   * The row a click is likely to select next: the one under the pointer or
   * with focus, and `null` once the pointer leaves it. Lets the host prefetch
   * what the selection will show.
   */
  onTestIntent?: (testId: string | null) => void;
  isPending?: boolean;
}) {
  const onSort = (col: Column) => {
    if (!col.key) return;
    if (col.key === sort) onSortChange(col.key, dir === 'asc' ? 'desc' : 'asc');
    else onSortChange(col.key, col.defaultDir ?? 'desc');
  };

  return (
    <div className={cn('panel overflow-x-auto transition-opacity duration-150', isPending && 'opacity-60')}>
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((col) => {
              const active = col.key !== null && col.key === sort;
              const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <TableHead
                  key={col.label}
                  // aria-sort belongs on the columnheader, not on the button
                  // inside it — it is not an allowed attribute on a button
                  // (axe: aria-allowed-attr).
                  aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(col.align === 'right' && 'text-right', col.className)}
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => onSort(col)}
                      className={cn(
                        'group inline-flex items-center gap-1 rounded-sm transition-colors duration-150 hover:text-foreground',
                        col.align === 'right' && 'flex-row-reverse',
                        active ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {col.label}
                      <Icon className={cn('size-3.5', !active && 'opacity-0 group-hover:opacity-60')} />
                    </button>
                  ) : (
                    <span className="text-muted-foreground">{col.label}</span>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const rel = reliabilityLabel(row.reliability);
            const describe = row.titlePath.slice(0, -1).filter(Boolean);
            return (
              <TableRow
                key={row.testId}
                data-state={activeTestId === row.testId ? 'selected' : undefined}
                className="cursor-pointer"
                onClick={() => onSelectTest(row.testId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectTest(row.testId);
                }}
                onPointerEnter={() => onTestIntent?.(row.testId)}
                onPointerLeave={() => onTestIntent?.(null)}
                onFocus={() => onTestIntent?.(row.testId)}
                tabIndex={0}
              >
                <TableCell className="max-w-md whitespace-normal py-2.5">
                  <div className="truncate font-medium" title={row.title}>
                    {row.title}
                  </div>
                  <div className="truncate text-xs text-muted-foreground" title={[row.file, ...describe].join(' › ')}>
                    {row.file}
                    {describe.length ? <span className="text-muted-foreground"> › {describe.join(' › ')}</span> : null}
                  </div>
                  {row.tags.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="h-4 px-1.5 text-label-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.lastOutcome} />
                </TableCell>
                <TableCell>
                  <Link
                    href={hrefs.run(row.lastRunNumber)}
                    onClick={(e) => e.stopPropagation()}
                    className="block hover:underline"
                  >
                    <span suppressHydrationWarning>{formatRelative(row.lastRunAt)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      #{row.lastRunNumber}
                      {row.lastBranch ? ` · ${row.lastBranch}` : ''}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className={cn('text-right font-medium', toneText[rel.tone])}>
                  {row.reliability === null ? '–' : row.reliability}
                </TableCell>
                <TableCell className={cn('text-right', row.flakyRate > 0 && 'text-warning-text')}>
                  {formatPercent(row.flakyRate)}
                </TableCell>
                <TableCell className={cn('text-right', row.failureRate > 0 && 'text-danger-text')}>
                  {formatPercent(row.failureRate)}
                </TableCell>
                <TableCell className="text-right">{row.runs}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatDuration(row.avgDurationMs)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {row.pwProject || '–'}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
