'use client';

import { RunSummary, type RunSummaryFilters } from '@miguelfranken/ui/views/run/run-summary';
import type { RunResultRow } from '@miguelfranken/ui/views/run/run-result';
import type { RunCounts } from '@miguelfranken/ui/patterns/counts-bar';
import { useUrlParams } from '@/components/filters/url-filters';
import { runHrefs } from '@/lib/view-models';

/**
 * Binds the summary tab's search and outcome filters to the query string. The
 * rows are fetched on the server and passed straight through.
 *
 * The href builders are constructed *here* rather than handed down: a function
 * cannot cross the server/client boundary, so the server sends the plain `base`
 * string and this component turns it into callbacks.
 */
export function UrlRunSummary({
  base,
  runNumber,
  counts,
  rows,
  filters,
}: {
  base: string;
  runNumber: number;
  counts: RunCounts;
  rows: RunResultRow[];
  filters: RunSummaryFilters;
}) {
  const { set, isPending } = useUrlParams();
  return (
    <RunSummary
      hrefs={runHrefs(base, runNumber, filters)}
      counts={counts}
      rows={rows}
      filters={filters}
      isPending={isPending}
      onFilterChange={(key, next) => set({ [key]: next })}
    />
  );
}
