'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RunSpecs } from '@miguelfranken/ui/views/run/run-specs';
import type { RunResultRow } from '@miguelfranken/ui/views/run/run-result';
import { RunTabSkeleton } from '@miguelfranken/ui/views/run/run-skeleton';
import { RunTabError } from '@miguelfranken/ui/views/run/run-tab-error';
import { parseSpecSort, parseSpecStatuses, type SpecFilterChange, type SpecFilters } from '@miguelfranken/ui/lib/spec-filter';
import { useShallowSearch } from '@/components/filters/url-filters';
import { useLivePart } from '@/components/live/live-store';
import { useLiveRows } from '@/components/live/live-run';
import type { RunRef } from '@/lib/rpc/client';
import { runRowsQuery, runSpecsQuery } from '@/lib/rpc/queries';
import { reduceSpecs } from '@/lib/live/reducers';
import { runHrefs } from '@/lib/view-models';

const NO_ROWS: RunResultRow[] = [];

/**
 * The specs tab: the run's per-file tallies, and the tests of the file opened.
 *
 * Both come from TanStack Query, and the search, sort, status filter and the
 * opened file live in the URL without a navigation (`useShallowSearch`), so a
 * narrowed list is as shareable as the run page itself and none of it costs a
 * round trip once loaded. A file's tests are their own query — opening it
 * again answers from the cache — and one the summary has already loaded the
 * whole run for starts from those rows instead of fetching.
 *
 * The href builders are constructed *here* rather than handed down: a function
 * cannot cross the server/client boundary, so the server sends the plain `base`
 * string and this component turns it into callbacks. They carry the filters
 * along, which is what keeps the list narrowed when you open a file in a new tab.
 */
export function UrlRunSpecs({ base, runNumber, runRef }: { base: string; runNumber: number; runRef: RunRef }) {
  const { params, set } = useShallowSearch();
  const q = params.get('q') || undefined;
  const sort = parseSpecSort(params.get('sort') ?? undefined);
  const statusKey = params.getAll('status').join(',');
  const filters = useMemo<SpecFilters>(() => ({ q, sort, status: parseSpecStatuses(statusKey || undefined) }), [q, sort, statusKey]);
  const selected = params.get('file') || undefined;

  const queryClient = useQueryClient();
  const specsQuery = useQuery(runSpecsQuery(runRef));
  const wholeRun = runRowsQuery(runRef);
  const rowsQuery = useQuery({
    ...runRowsQuery(runRef, selected),
    enabled: selected !== undefined,
    // The summary's whole-run rows already hold this file's: start from them.
    initialData: () => {
      const all = queryClient.getQueryData(wholeRun.queryKey);
      return all && selected ? { rows: all.rows.filter((r) => r.file === selected), cursor: all.cursor } : undefined;
    },
    initialDataUpdatedAt: () => queryClient.getQueryState(wholeRun.queryKey)?.dataUpdatedAt,
  });

  const specs = specsQuery.data;
  const liveSpecs = useLivePart('specs', specs?.specs ?? [], specs?.cursor ?? 0, reduceSpecs, specs?.specs, specs !== undefined);
  const fileFilter = useMemo(() => ({ file: selected }), [selected]);
  const rows = selected ? rowsQuery.data : undefined;
  const liveRows = useLiveRows(rows?.rows ?? NO_ROWS, rows?.cursor ?? 0, fileFilter, runRef, { enabled: rows !== undefined });

  if (!specs) {
    if (specsQuery.isError) return <RunTabError onRetry={() => void specsQuery.refetch()} retrying={specsQuery.isFetching} />;
    return <RunTabSkeleton tab="specs" />;
  }

  const onFilterChange = (change: SpecFilterChange) => {
    // An absent key is untouched; an explicit `null` clears it.
    const updates: Record<string, string | string[] | null> = {};
    if (change.q !== undefined) updates.q = change.q;
    if (change.sort !== undefined) updates.sort = change.sort;
    if (change.status !== undefined) updates.status = change.status;
    set(updates);
  };

  return (
    <RunSpecs
      hrefs={runHrefs(base, runNumber, filters)}
      specs={liveSpecs}
      selected={selected}
      rows={rows ? liveRows : null}
      rowsLoading={selected !== undefined && rows === undefined && !rowsQuery.isError}
      filters={filters}
      onFilterChange={onFilterChange}
      onSelectSpec={(file) => set({ file })}
    />
  );
}
