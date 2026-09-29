'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import type { CaseRow } from '../../lib/test-case-models';
import { caseKey, type CaseSort } from '../../lib/test-cases';
import { Link } from '../../provider';
import { AutomationBadge, CaseStatusBadge, MutedBadge, PriorityIcon, VerdictBadge } from './case-badges';

export interface CaseTableHrefs {
  case: (number: number) => string;
}

export interface CaseTableProps {
  rows: CaseRow[];
  hrefs: CaseTableHrefs;
  now?: Date;
  /** Shows the suite path under each title: on for lists that cross suites. */
  showSuite?: boolean;
  /** Checkboxes for bulk actions. */
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (next: Set<string>) => void;
  sort?: CaseSort;
  dir?: 'asc' | 'desc';
  onSortChange?: (sort: CaseSort, dir: 'asc' | 'desc') => void;
  /** Up/down buttons, for a single suite in its own order. */
  onReorder?: (row: CaseRow, direction: 'up' | 'down') => void;
  pendingId?: string | null;
  isPending?: boolean;
}

const SORTABLE: { key: CaseSort; label: string; className?: string; defaultDir: 'asc' | 'desc' }[] = [
  { key: 'number', label: 'ID', className: 'w-24', defaultDir: 'asc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'priority', label: 'Priority', className: 'w-20', defaultDir: 'asc' },
];

/**
 * The case list: key, title, what it is and what its linked tests say. With
 * `selectable`, the header checkbox selects every row shown.
 */
export function CaseTable({
  rows,
  hrefs,
  now,
  showSuite = false,
  selectable = false,
  selected = new Set(),
  onSelectedChange,
  sort,
  dir = 'asc',
  onSortChange,
  onReorder,
  pendingId,
  isPending,
}: CaseTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = !allSelected && rows.some((r) => selected.has(r.id));
  const setRow = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectedChange?.(next);
  };
  const setAll = (on: boolean) => {
    const next = new Set(selected);
    for (const r of rows) {
      if (on) next.add(r.id);
      else next.delete(r.id);
    }
    onSelectedChange?.(next);
  };

  return (
    <div className={cn('panel overflow-hidden', isPending && 'opacity-60')}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable ? (
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select every case shown"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(on) => setAll(on === true)}
                />
              </TableHead>
            ) : null}
            {SORTABLE.slice(0, 2).map((c) => (
              <SortHead key={c.key} column={c} sort={sort} dir={dir} onSortChange={onSortChange} />
            ))}
            <SortHead column={SORTABLE[2]} sort={sort} dir={dir} onSortChange={onSortChange} />
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-44">Automation</TableHead>
            <TableHead className="w-32">Linked tests</TableHead>
            {onReorder ? <TableHead className="w-20"><span className="sr-only">Order</span></TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => {
            const key = caseKey(row.number);
            const isSelected = selected.has(row.id);
            return (
              <TableRow key={row.id} data-state={isSelected ? 'selected' : undefined} className={cn(row.status === 'deprecated' && 'text-muted-foreground')}>
                {selectable ? (
                  <TableCell>
                    <Checkbox aria-label={`Select ${key}`} checked={isSelected} onCheckedChange={(on) => setRow(row.id, on === true)} />
                  </TableCell>
                ) : null}
                <TableCell className="text-code-s whitespace-nowrap">
                  <Link href={hrefs.case(row.number)} className="text-accent-text hover:underline" tabIndex={-1} aria-hidden>
                    {key}
                  </Link>
                </TableCell>
                <TableCell className="max-w-0 min-w-72">
                  <Link href={hrefs.case(row.number)} className="block truncate font-medium text-foreground hover:underline" title={row.title}>
                    <span className="sr-only">{key}: </span>
                    {row.title}
                  </Link>
                  {(showSuite && row.suitePath.length) || row.tags.length || row.muted ? (
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                      {showSuite && row.suitePath.length ? (
                        <span className="min-w-0 truncate text-body-s text-muted-foreground" title={row.suitePath.join(' / ')}>
                          {row.suitePath.join(' / ')}
                        </span>
                      ) : null}
                      {row.muted ? <MutedBadge /> : null}
                      {row.tags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="secondary" className="font-normal">
                          {t}
                        </Badge>
                      ))}
                      {row.tags.length > 4 ? <span className="text-body-s text-muted-foreground">+{row.tags.length - 4}</span> : null}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <PriorityIcon priority={row.priority} />
                </TableCell>
                <TableCell>
                  <CaseStatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  <AutomationBadge automation={row.automation} linkCount={row.linkCount} />
                </TableCell>
                <TableCell>
                  {row.linkCount ? (
                    <span className="inline-flex items-center gap-2">
                      <VerdictBadge verdict={row.verdict} compact />
                      <span className="text-body-s text-muted-foreground" title={row.lastRunAt ? `Last run ${formatRelative(row.lastRunAt, { now })}` : undefined}>
                        {row.linkCount} {row.linkCount === 1 ? 'test' : 'tests'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-body-s text-muted-foreground">–</span>
                  )}
                </TableCell>
                {onReorder ? (
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon-xs" aria-label={`Move ${key} up`} disabled={i === 0 || pendingId === row.id} onClick={() => onReorder(row, 'up')}>
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Move ${key} down`}
                        disabled={i === rows.length - 1 || pendingId === row.id}
                        onClick={() => onReorder(row, 'down')}
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SortHead({
  column,
  sort,
  dir,
  onSortChange,
}: {
  column: (typeof SORTABLE)[number];
  sort?: CaseSort;
  dir: 'asc' | 'desc';
  onSortChange?: (sort: CaseSort, dir: 'asc' | 'desc') => void;
}) {
  if (!onSortChange) return <TableHead className={column.className}>{column.label}</TableHead>;
  const active = sort === column.key;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={column.className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        onClick={() => onSortChange(column.key, active ? (dir === 'asc' ? 'desc' : 'asc') : column.defaultDir)}
      >
        {column.label}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} />
      </button>
    </TableHead>
  );
}
