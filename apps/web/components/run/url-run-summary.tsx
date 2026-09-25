'use client';

import { RunSummary, type RunSummaryFilters } from '@miguelfranken/ui/views/run/run-summary';
import type { RunResultRow } from '@miguelfranken/ui/views/run/run-result';
import type { RunCounts } from '@miguelfranken/ui/patterns/counts-bar';
import { useUrlParams } from '@/components/filters/url-filters';
import { useLiveRows, useLiveRunCounts } from '@/components/live/live-run';
import type { RunRef } from '@/lib/rpc/client';
import { runHrefs } from '@/lib/view-models';

/**
 * Binds the summary tab's search and outcome filters to the query string. The
 * rows are fetched on the server and passed straight through.
 *
 * The href builders are constructed *here* rather than handed down: a function
 * cannot cross the server/client boundary, so the server sends the plain `base`
 * string and this component turns it into callbacks.
 *
 * While the run is going, the rows and counts follow the live stream: the
 * server's rows are the starting point, the filters are applied again in the
 * browser as results change.
 */
export function UrlRunSummary({
  base,
  runNumber,
  counts,
  rows,
  cursor,
  runRef,
  filters,
}: {
  base: string;
  runNumber: number;
  counts: RunCounts;
  rows: RunResultRow[];
  cursor: number;
  /** The run as the RPC procedures address it, for fetching rows the stream only announced. */
  runRef: RunRef;
  filters: RunSummaryFilters & { signature?: string };
}) {
  const { set, isPending } = useUrlParams();
  const liveRows = useLiveRows(rows, cursor, filters, runRef);
  const liveCounts = useLiveRunCounts(counts);
  return (
    <RunSummary
      hrefs={runHrefs(base, runNumber, filters)}
      counts={liveCounts}
      rows={liveRows}
      filters={filters}
      isPending={isPending}
      onFilterChange={(key, next) => set({ [key]: next })}
    />
  );
}
