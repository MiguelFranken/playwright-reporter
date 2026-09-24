'use client';

import * as React from 'react';
import { CheckCircle2, ChevronsDownUp, ChevronsUpDown, MinusCircle, Repeat2, XCircle } from 'lucide-react';
import { Link } from '../../provider';
import { Button } from '../../components/button';
import { CountTabs } from '../../patterns/count-tabs';
import { OutcomeCard } from '../../patterns/outcome-card';
import { SearchField } from '../../patterns/filter-controls';
import { tallyCategories } from '../../lib/error-category';
import type { RunCounts } from '../../patterns/counts-bar';
import { ResultGroupsSkeleton } from './run-skeleton';
import { RunResultGroups, groupByFile } from './run-result-groups';
import type { RunResultRow, RunResultsHrefs } from './run-result';

/**
 * The summary tab: what went wrong, then which tests.
 *
 * The four tiles up top are the run's verdict, and each one carries the reason
 * breakdown it can — failures split by error category, flaky tests by how many
 * retries they needed — so the first click is an informed one rather than a
 * fishing trip. Below, one toolbar and the results grouped by spec file.
 *
 * Every filter is a link, because the state lives in the URL and a run page
 * ought to be shareable exactly as you are reading it.
 */

export interface RunSummaryFilters {
  outcome?: string;
  q?: string;
  signature?: string;
}

export interface RunSummaryHrefs extends RunResultsHrefs {
  /** The run's own page, filtered to one outcome (or unfiltered when already active). */
  outcome: (outcome: string) => string;
  /** The run's own page with every tab-local filter cleared. */
  clearFilters: string;
}

export function RunSummary({
  hrefs,
  counts,
  rows,
  filters,
  onFilterChange,
  isPending,
}: {
  hrefs: RunSummaryHrefs;
  counts: RunCounts;
  rows: RunResultRow[];
  filters: RunSummaryFilters;
  /** `null` clears the filter. The host decides where that state lives. */
  onFilterChange: (key: 'outcome' | 'q', next: string | null) => void;
  isPending?: boolean;
}) {
  // `expandAll` stays undefined until the user asks, so each group keeps its
  // own default (open when it holds a failure) on first paint.
  const [expandAll, setExpandAll] = React.useState<boolean | undefined>(undefined);

  // The outcome pills are links, so the rows they select arrive a round trip
  // later. The strip moves at once and the list below becomes a placeholder,
  // rather than both sitting on the previous outcome until the query returns.
  const outcome = filters.outcome ?? 'all';
  const [pendingOutcome, setPendingOutcome] = React.useState<string | null>(null);
  React.useEffect(() => setPendingOutcome(null), [outcome]);
  const shownOutcome = pendingOutcome ?? outcome;
  const switchingOutcome = pendingOutcome !== null && pendingOutcome !== outcome;
  const failedCount = counts.failed + counts.interrupted;
  const groupCount = React.useMemo(() => groupByFile(rows).length, [rows]);

  // The headline counts come from the server's tally of the whole run; the
  // breakdowns are derived from the rows on screen, which is all the client
  // has. Under an active filter a breakdown therefore describes the visible
  // slice — the counts above it stay whole-run either way.
  const failureRows = rows.filter((r) => FAILED.has(r.outcome));
  const categories = tallyCategories(failureRows.map((r) => r.errorMessage));
  const flakyRows = rows.filter((r) => r.outcome === 'flaky');

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OutcomeCard
          label="Failed"
          count={failedCount}
          tone="danger"
          icon={XCircle}
          href={hrefs.outcome('failed')}
          active={filters.outcome === 'failed'}
          emptyLabel={failedCount === 0 ? 'No failures' : 'No error messages recorded'}
          breakdown={categories.map((c) => ({ label: c.category.label, value: c.count, tone: c.category.tone }))}
        />
        <OutcomeCard
          label="Flaky"
          count={counts.flaky}
          tone="warning"
          icon={Repeat2}
          href={hrefs.outcome('flaky')}
          active={filters.outcome === 'flaky'}
          emptyLabel="No flaky tests"
          breakdown={retryBreakdown(flakyRows)}
        />
        <OutcomeCard
          label="Skipped"
          count={counts.skipped}
          tone="neutral"
          icon={MinusCircle}
          href={hrefs.outcome('skipped')}
          active={filters.outcome === 'skipped'}
          emptyLabel="Nothing skipped"
        />
        <OutcomeCard
          label="Passed"
          count={counts.passed}
          tone="success"
          icon={CheckCircle2}
          href={hrefs.outcome('passed')}
          active={filters.outcome === 'passed'}
          emptyLabel={counts.total === 0 ? 'No results yet' : 'Nothing passed'}
          breakdown={
            counts.passed > 0
              ? [{ label: 'of all tests', value: `${Math.round((counts.passed / Math.max(counts.total, 1)) * 100)}%`, tone: 'success' }]
              : []
          }
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="text-headline-m">Detailed analysis</h2>
            <p className="text-body-s text-muted-foreground">Every test in this run, grouped by the spec file it came from.</p>
          </div>
          <span className="text-body-xs text-muted-foreground tabular-nums">
            {rows.length} of {counts.total} tests · {groupCount} {groupCount === 1 ? 'file' : 'files'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CountTabs
            value={shownOutcome}
            onSelect={(next, event) => {
              // A modified click opens elsewhere and never changes this page.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              setPendingOutcome(next);
            }}
            items={[
              // Re-passing the active outcome is what clears it, so "All" keeps the search.
              { value: 'all', label: 'All', count: counts.total, href: hrefs.outcome(filters.outcome ?? '') },
              { value: 'passed', label: 'Passed', count: counts.passed, tone: 'success', href: hrefs.outcome('passed') },
              { value: 'failed', label: 'Failed', count: failedCount, tone: 'danger', href: hrefs.outcome('failed') },
              { value: 'flaky', label: 'Flaky', count: counts.flaky, tone: 'warning', href: hrefs.outcome('flaky') },
              { value: 'skipped', label: 'Skipped', count: counts.skipped, tone: 'neutral', href: hrefs.outcome('skipped') },
            ]}
          />
          <SearchField
            placeholder="Search title or file…"
            value={filters.q ?? ''}
            isPending={isPending}
            onValueChange={(next) => onFilterChange('q', next)}
          />
          {filters.signature ? (
            <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-sunken px-3 text-body-xs text-muted-foreground">
              Filtered by error group
              <Link href={hrefs.clearFilters} className="font-medium text-foreground hover:underline">
                Clear
              </Link>
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="ms-auto"
            onClick={() => setExpandAll((v) => !v)}
            aria-pressed={expandAll === true}
          >
            {expandAll ? <ChevronsDownUp data-icon="inline-start" /> : <ChevronsUpDown data-icon="inline-start" />}
            {expandAll ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>

        <div className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {switchingOutcome ? (
            <ResultGroupsSkeleton />
          ) : (
          <RunResultGroups
            hrefs={hrefs}
            rows={rows}
            expandAll={expandAll}
            emptyTitle={filters.q || filters.outcome || filters.signature ? 'No tests match these filters' : 'No results yet'}
            emptyDescription={
              filters.q || filters.outcome || filters.signature ? (
                <>
                  Try a different search, or{' '}
                  <Link href={hrefs.clearFilters} className="font-medium text-foreground hover:underline">
                    clear the filters
                  </Link>
                  .
                </>
              ) : (
                'Results appear here as the reporter uploads them.'
              )
            }
          />
          )}
        </div>
      </section>
    </div>
  );
}

const FAILED = new Set(['failed', 'timedout', 'timedOut', 'interrupted']);

/** Flaky tests, bucketed by how many retries it took them to settle. */
function retryBreakdown(rows: RunResultRow[]) {
  const counts = new Map<number, number>();
  for (const r of rows) {
    const retries = Math.max(1, r.attemptCount - 1);
    counts.set(retries, (counts.get(retries) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([retries, count]) => ({ label: `${retries} ${retries === 1 ? 'retry' : 'retries'}`, value: count, tone: 'warning' as const }));
}
