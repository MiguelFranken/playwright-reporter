'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RunSummary, type RunSummaryFilterChange, type RunSummaryFilters } from '@miguelfranken/ui/views/run/run-summary';
import type { LoadingResultGroup } from '@miguelfranken/ui/views/run/run-result-groups';
import type { RunResultRow } from '@miguelfranken/ui/views/run/run-result';
import type { SpecSummary } from '@miguelfranken/ui/views/run/run-specs';
import { RESULT_FACET_PARAMS, hasResultFacets, parseResultFacets } from '@miguelfranken/ui/lib/result-filter';
import { RunTabSkeleton } from '@miguelfranken/ui/views/run/run-skeleton';
import { RunTabError } from '@miguelfranken/ui/views/run/run-tab-error';
import type { RunCounts } from '@miguelfranken/ui/patterns/counts-bar';
import { useShallowSearch } from '@/components/filters/url-filters';
import { useLiveRows, useLiveRunCounts } from '@/components/live/live-run';
import { useLivePeek } from '@/components/live/live-store';
import type { RowMap } from '@/lib/live/reducers';
import type { RunRef } from '@/lib/rpc/client';
import { runRowsQuery } from '@/lib/rpc/queries';
import { runHrefs } from '@/lib/view-models';

/**
 * What the server painted the summary with before the whole run's rows were
 * ready: the rows of the files holding a failure (the groups that start open)
 * and every file's tally, for the closed groups still loading.
 */
export interface SummaryHead {
  rows: RunResultRow[];
  cursor: number;
  specs: SpecSummary[];
}

const NO_ROWS: RunResultRow[] = [];
/** The outcomes whose rows all sit in files holding a failure: the head alone answers them. */
const HEAD_OUTCOMES = new Set(['failed', 'flaky']);
const collator = new Intl.Collator('en');
const noSubscription = () => () => {};
const isHydrated = () => true;
/** Also what React reads while hydrating: the server's answer. */
const isServerRender = () => false;

/**
 * The summary tab: every result of the run, filtered in the browser.
 *
 * The rows are one query for the whole run (`runRowsQuery`), so the outcome
 * pills, the tiles and the search re-filter what is already here and update
 * the URL without a navigation — no round trip, no placeholder. The server
 * starts that query without waiting for it and paints the `head` meanwhile;
 * an outcome the head cannot answer shows a placeholder until the rest lands.
 *
 * While the run is going, the rows and counts follow the live stream: the
 * query's rows are the starting point, the filters are applied again in the
 * browser as results change.
 *
 * The href builders are constructed *here* rather than handed down: a function
 * cannot cross the server/client boundary, so the server sends the plain `base`
 * string and this component turns it into callbacks.
 */
export function UrlRunSummary({
  base,
  runNumber,
  counts,
  runRef,
  head,
}: {
  base: string;
  runNumber: number;
  counts: RunCounts;
  /** The run as the RPC procedures address it. */
  runRef: RunRef;
  /** Set when the server rendered this tab before the whole run's rows were ready. */
  head?: SummaryHead;
}) {
  const { params, set } = useShallowSearch();
  const outcome = params.get('outcome') || undefined;
  const q = params.get('q') || undefined;
  const signature = params.get('signature') || undefined;
  const facetKey = resultFacetKey(params);
  const filters = useMemo<RunSummaryFilters>(
    () => ({ outcome, q, signature, ...parseResultFacets((key) => params.getAll(key)) }),
    // The facets are read again only when their params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome, q, signature, facetKey],
  );
  const faceted = hasResultFacets(filters);

  const query = useQuery(runRowsQuery(runRef));
  // The whole run's rows stream in behind the head, and may well have landed
  // before this hydrates. The server painted the head, so hydration renders
  // the head too; the next render takes the whole run.
  const hydrating = useSyncExternalStore(noSubscription, isHydrated, isServerRender) === false;
  const full = hydrating && head ? undefined : query.data;
  const data = full ?? head;
  const complete = full !== undefined;
  const liveRows = useLiveRows(data?.rows ?? NO_ROWS, data?.cursor ?? 0, filters, runRef, { enabled: data !== undefined });
  const liveCounts = useLiveRunCounts(counts);
  // The tiles break down the whole run, not the filtered slice: every row the store holds.
  const rowMap = useLivePeek<RowMap | null>('rows', null);
  const runRows = useMemo(() => (rowMap ? [...rowMap.values()] : liveRows), [rowMap, liveRows]);

  // The head holds every failing and flaky row, and nothing else is needed
  // until the filter asks for a passed or skipped test, searches titles, or
  // narrows by a facet across every outcome.
  const needsAll =
    !complete && (Boolean(q) || (outcome !== undefined ? !HEAD_OUTCOMES.has(outcome) : faceted));
  const loadingGroups = useMemo(
    () => (complete || !head || outcome || signature || faceted ? [] : pendingFiles(head.specs, liveRows)),
    [complete, head, outcome, signature, faceted, liveRows],
  );

  if (!data) {
    if (query.isError) return <RunTabError onRetry={() => void query.refetch()} retrying={query.isFetching} />;
    return <RunTabSkeleton tab="summary" />;
  }
  if (needsAll && query.isError) return <RunTabError onRetry={() => void query.refetch()} retrying={query.isFetching} />;

  return (
    <RunSummary
      hrefs={runHrefs(base, runNumber, filters)}
      counts={liveCounts}
      rows={liveRows}
      runRows={runRows}
      loadingGroups={loadingGroups}
      loading={needsAll}
      filters={filters}
      onFilterChange={({ retried, ...change }: RunSummaryFilterChange) =>
        set(retried === undefined ? change : { ...change, retried: retried ? '1' : null })
      }
    />
  );
}

/** The facets' params as one string, so the memo above follows them and nothing else. */
function resultFacetKey(params: URLSearchParams): string {
  return RESULT_FACET_PARAMS.map((k) => params.getAll(k).join(',')).join('|');
}

/**
 * The files the head did not include, as closed groups: in the order the
 * complete list would put them — the rows' order is problems first, then
 * running, passed and the rest, each by file.
 */
function pendingFiles(specs: SpecSummary[], rows: RunResultRow[]): LoadingResultGroup[] {
  const shown = new Set(rows.map((r) => r.file));
  const rank = (s: SpecSummary) => (s.running > 0 ? 0 : s.passed > 0 ? 1 : 2);
  return specs
    .filter((s) => s.total > 0 && !shown.has(s.file))
    .sort((a, b) => rank(a) - rank(b) || collator.compare(a.file, b.file))
    .map((s) => ({ file: s.file, total: s.total }));
}
