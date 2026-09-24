'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, FileCode2, ListFilter, MousePointerClick } from 'lucide-react';
import { Link } from '../../provider';
import { Button } from '../../components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/dropdown-menu';
import { EmptyState } from '../../patterns/empty-state';
import { SearchField } from '../../patterns/filter-controls';
import { MetaChip } from '../../patterns/meta-chip';
import { StatusIcon } from '../../patterns/status-badge';
import { formatDuration } from '../../lib/format';
import { cn } from '../../lib/cn';
import {
  DEFAULT_SPEC_SORT,
  SPEC_SORT_GROUPS,
  SPEC_STATUSES,
  SPEC_STATUS_LABELS,
  hasSpecFilters,
  type SpecFilterChange,
  type SpecFilters,
  type SpecSort,
  type SpecStatus,
} from '../../lib/spec-filter';
import type { RunResultRow, RunResultsHrefs } from './run-result';

/**
 * The specs tab: files on the left, the chosen file's suites on the right.
 *
 * The left column leads with the pass rate, because that is what makes one
 * file worth opening before another, and backs it with a proportional bar and
 * the raw tallies. It is searched, sorted and narrowed in place: the whole
 * run's spec list is already here, so a filter is a re-render rather than a
 * round trip — only *opening* a file costs a fetch.
 *
 * The right column mirrors the *source*: `describe` blocks become sections and
 * the tests sit under the block that declared them, so the page reads the way
 * the spec file does.
 */

/** One spec file's tally inside a run. */
export interface SpecSummary {
  file: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  running: number;
  durationMs: number;
}

export interface RunSpecsHrefs extends RunResultsHrefs {
  /** The specs tab, focused on one file. */
  spec: (file: string) => string;
}

export function RunSpecs({
  hrefs,
  specs,
  selected,
  rows,
  filters = {},
  onFilterChange,
  isPending,
}: {
  hrefs: RunSpecsHrefs;
  specs: SpecSummary[];
  selected?: string;
  rows: RunResultRow[] | null;
  /** The committed filter state. The host decides where it lives. */
  filters?: SpecFilters;
  /** `null` on a key clears it. Omitted, the toolbar is not rendered at all. */
  onFilterChange?: (next: SpecFilterChange) => void;
  isPending?: boolean;
}) {
  const shown = React.useMemo(() => applySpecFilters(specs, filters), [specs, filters]);

  if (specs.length === 0) {
    return <EmptyState icon={FileCode2} title="No spec files yet" description="Spec files appear as soon as the first test begins." />;
  }
  // The detail pane follows the URL, not the filter: a file you opened stays
  // open when a later filter would have hidden its card.
  const current = specs.find((s) => s.file === selected);
  // Only a search or a status tick *hides* a file; a re-sort does not, so it
  // has no business changing what the empty right-hand pane says.
  const narrowed = Boolean(filters.q) || (filters.status?.length ?? 0) > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_1.8fr]">
      <div className="flex min-w-0 flex-col gap-2">
        {onFilterChange ? (
          <SpecToolbar filters={filters} onFilterChange={onFilterChange} isPending={isPending} shown={shown.length} total={specs.length} />
        ) : null}

        <div className={cn('flex max-h-[70vh] min-w-0 flex-col gap-2 overflow-y-auto pe-0.5', isPending && 'opacity-60 transition-opacity')}>
          {shown.length === 0 ? (
            <EmptyState
              icon={FileCode2}
              title="No spec files match"
              description="Try a different search, or widen the status filter."
              className="py-10"
            />
          ) : (
            shown.map((spec) => (
              <SpecCard key={spec.file} href={hrefs.spec(spec.file)} spec={spec} active={spec.file === selected} />
            ))
          )}
        </div>
      </div>

      <div className="min-w-0">
        {rows === null || !current ? (
          <EmptyState
            icon={MousePointerClick}
            title="Pick a spec file"
            description={
              narrowed && shown.length > 0
                ? 'Choose one of the matching files on the left to see its suites and tests.'
                : 'Choose a file on the left to see its suites and tests.'
            }
            className="h-full"
          />
        ) : (
          <SpecDetail hrefs={hrefs} spec={current} rows={rows} />
        )}
      </div>
    </div>
  );
}

/**
 * Search, then status, then order. Search matches the whole path, so typing a
 * directory narrows to it; status keeps a file that holds *any* test in one of
 * the chosen states, which is the only reading that works for a file mixing
 * outcomes — an "all passed" filter would hide the file you care about the
 * moment one of its tests fails.
 */
export function applySpecFilters(specs: SpecSummary[], filters: SpecFilters): SpecSummary[] {
  const q = filters.q?.trim().toLowerCase();
  const statuses = filters.status ?? [];
  const sort = filters.sort ?? DEFAULT_SPEC_SORT;

  const out = specs.filter((spec) => {
    if (q && !spec.file.toLowerCase().includes(q)) return false;
    if (statuses.length > 0 && !statuses.some((s) => spec[s] > 0)) return false;
    return true;
  });

  const byName = (a: SpecSummary, b: SpecSummary) => a.file.localeCompare(b.file);
  out.sort((a, b) => {
    switch (sort) {
      case 'name-desc':
        return byName(b, a);
      case 'duration-asc':
        return a.durationMs - b.durationMs || byName(a, b);
      case 'duration-desc':
        return b.durationMs - a.durationMs || byName(a, b);
      default:
        return byName(a, b);
    }
  });
  return out;
}

/**
 * One search field and one menu, because the list is a sidebar: a row of pills
 * would cost it the width it needs for the file names.
 *
 * The menu holds sort (a single choice, so radios) and status (several, so
 * checkboxes) in one popup, and the trigger carries a count when either is
 * away from its default — a closed menu must still say the list is narrowed.
 * Neither item kind closes the popup, which is Base UI's default for both and
 * the behaviour a multi-tick status list needs.
 */
function SpecToolbar({
  filters,
  onFilterChange,
  isPending,
  shown,
  total,
}: {
  filters: SpecFilters;
  onFilterChange: (next: SpecFilterChange) => void;
  isPending?: boolean;
  shown: number;
  total: number;
}) {
  const sort = filters.sort ?? DEFAULT_SPEC_SORT;
  const statuses = filters.status ?? [];
  const activeCount = statuses.length + (sort === DEFAULT_SPEC_SORT ? 0 : 1);

  const toggleStatus = (status: SpecStatus, checked: boolean) => {
    const next = checked ? [...statuses, status] : statuses.filter((s) => s !== status);
    onFilterChange({ status: next.length ? next : null });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <SearchField
          fill
          className="min-w-0 flex-1"
          placeholder="Search specs…"
          value={filters.q ?? ''}
          isPending={isPending}
          onValueChange={(next) => onFilterChange({ q: next })}
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="shrink-0" />}>
            <ListFilter data-icon="inline-start" />
            Filter
            {activeCount > 0 ? (
              <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-accent-solid px-1 text-body-xs text-accent-on-solid tabular-nums">
                {activeCount}
              </span>
            ) : null}
            <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuRadioGroup value={sort} onValueChange={(next) => onFilterChange({ sort: next === DEFAULT_SPEC_SORT ? null : (next as SpecSort) })}>
              {SPEC_SORT_GROUPS.map((group, i) => (
                <React.Fragment key={group.label}>
                  {i > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  {group.options.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </React.Fragment>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              {SPEC_STATUSES.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statuses.includes(status)}
                  onCheckedChange={(checked) => toggleStatus(status, checked)}
                >
                  {SPEC_STATUS_LABELS[status]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>

            {hasSpecFilters(filters) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onFilterChange({ q: null, sort: null, status: null })}>
                  Clear filters
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="px-0.5 text-body-xs text-muted-foreground tabular-nums" aria-live="polite">
        {shown === total ? `${total} ${total === 1 ? 'file' : 'files'}` : `${shown} of ${total} files`}
      </p>
    </div>
  );
}

function SpecCard({ href, spec, active }: { href: string; spec: SpecSummary; active: boolean }) {
  const name = spec.file.split('/').pop() ?? spec.file;
  const dir = spec.file.slice(0, spec.file.length - name.length);
  // Skipped tests never ran, so they are not part of the rate — counting them
  // as failures would punish a file for being deliberately narrowed. A flaky
  // test *is* counted against it: it needed a retry, so it did not pass
  // cleanly, and a file of nothing but flakes should not read as green.
  const ran = spec.total - spec.skipped;
  const rate = ran > 0 ? Math.round((spec.passed / ran) * 100) : null;
  const rateTone = rate === null ? 'text-muted-foreground' : rate >= 90 ? 'text-success-text' : rate >= 60 ? 'text-warning-text' : 'text-danger-text';

  const segments = [
    { key: 'passed', n: spec.passed, fill: 'bg-success-solid' },
    { key: 'flaky', n: spec.flaky, fill: 'bg-warning-solid' },
    { key: 'failed', n: spec.failed, fill: 'bg-danger-solid' },
    { key: 'running', n: spec.running, fill: 'bg-info-solid animate-pulse' },
    { key: 'skipped', n: spec.skipped, fill: 'bg-neutral-solid' },
  ];

  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card px-3 py-2.5 shadow-e1 transition-colors duration-150 outline-none',
        'hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/25',
        active ? 'border-accent-border bg-accent-subtle' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-label-m" title={name}>
            {name}
          </span>
          {dir ? (
            <span className="block truncate text-code-s text-muted-foreground" title={spec.file}>
              {dir.replace(/\/$/, '')}
            </span>
          ) : null}
        </span>
        <span className={cn('shrink-0 text-label-l tabular-nums', rateTone)} title="Clean pass rate — retried and failed tests both count against it; skipped tests are excluded">
          {rate === null ? '–' : `${rate}%`}
        </span>
      </div>

      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted">
        {segments.map((s) =>
          s.n > 0 ? <span key={s.key} className={s.fill} style={{ width: `${(s.n / Math.max(spec.total, 1)) * 100}%` }} /> : null,
        )}
      </div>

      <div className="flex items-center gap-2.5 text-body-xs text-muted-foreground tabular-nums">
        <Tally fill="bg-success-solid" n={spec.passed} label="passed" />
        <Tally fill="bg-danger-solid" n={spec.failed} label="failed" />
        <Tally fill="bg-warning-solid" n={spec.flaky} label="flaky" />
        <Tally fill="bg-neutral-solid" n={spec.skipped} label="skipped" />
        <span className="ms-auto">
          {spec.total} · {formatDuration(spec.durationMs)}
        </span>
      </div>
    </Link>
  );
}

function Tally({ fill, n, label }: { fill: string; n: number; label: string }) {
  if (n === 0) return null;
  return (
    <span className="inline-flex items-center gap-1" title={`${n} ${label}`}>
      <span className={cn('size-1.5 rounded-full', fill)} aria-hidden />
      {n}
    </span>
  );
}

/** A `describe` block inside one spec file, with the tests it declared. */
interface Suite {
  path: string[];
  rows: RunResultRow[];
}

/**
 * Groups by the title path minus the test's own title — which is exactly the
 * chain of `describe` blocks Playwright reports. Tests declared at the top
 * level land in a suite with an empty path.
 */
function toSuites(rows: RunResultRow[]): Suite[] {
  const suites = new Map<string, Suite>();
  for (const row of rows) {
    const path = row.titlePath.slice(0, -1).filter(Boolean);
    const key = path.join(' › ');
    const suite = suites.get(key);
    if (suite) suite.rows.push(row);
    else suites.set(key, { path, rows: [row] });
  }
  return [...suites.values()];
}

function SpecDetail({ hrefs, spec, rows }: { hrefs: RunSpecsHrefs; spec: SpecSummary; rows: RunResultRow[] }) {
  const suites = toSuites(rows);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-code-s" title={spec.file}>
          {spec.file}
        </span>
        <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">
          {suites.length} {suites.length === 1 ? 'suite' : 'suites'} · {spec.total} tests · {formatDuration(spec.durationMs)}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FileCode2} title="No tests in this file" className="py-10" />
      ) : (
        <div className="panel divide-y divide-separator">
          {suites.map((suite) => (
            <section key={suite.path.join(' › ') || '(root)'}>
              <h2 className="flex items-center gap-2 bg-surface-sunken px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-label-m" title={suite.path.join(' › ')}>
                  {suite.path.length ? (
                    suite.path.map((part, i) => (
                      <span key={i}>
                        {i > 0 ? <ChevronRight className="mx-0.5 inline size-3 text-muted-foreground" aria-hidden /> : null}
                        {part}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Top level</span>
                  )}
                </span>
                <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">{suite.rows.length}</span>
              </h2>
              <ul className="divide-y divide-separator">
                {suite.rows.map((row) => (
                  <li key={row.id} className="relative flex items-center gap-2.5 px-3 py-2 transition-colors duration-150 hover:bg-muted/50">
                    <StatusIcon status={row.outcome} />
                    <Link
                      href={hrefs.result(row.id)}
                      className="min-w-0 flex-1 truncate text-body-m after:absolute after:inset-0 after:content-['']"
                      title={row.title}
                    >
                      {row.title}
                    </Link>
                    {row.pwProject ? <MetaChip>{row.pwProject}</MetaChip> : null}
                    <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">
                      {formatDuration(row.durationMs)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
