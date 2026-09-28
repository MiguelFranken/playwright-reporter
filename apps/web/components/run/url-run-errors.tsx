'use client';

import { useQuery } from '@tanstack/react-query';
import { RunTabSkeleton } from '@miguelfranken/ui/views/run/run-skeleton';
import { RunTabError } from '@miguelfranken/ui/views/run/run-tab-error';
import { useShallowSearch } from '@/components/filters/url-filters';
import { LiveRunErrors } from '@/components/live/live-run';
import type { RunRef } from '@/lib/rpc/client';
import { runErrorsQuery } from '@/lib/rpc/queries';

/**
 * The errors tab, from its query. "Show the affected tests" switches to the
 * summary filtered to that group without a navigation: the summary's rows
 * are one query for the whole run, usually cached by then.
 */
export function UrlRunErrors({ base, runNumber, runRef }: { base: string; runNumber: number; runRef: RunRef }) {
  const { set } = useShallowSearch();
  const query = useQuery(runErrorsQuery(runRef));
  if (!query.data) {
    if (query.isError) return <RunTabError onRetry={() => void query.refetch()} retrying={query.isFetching} />;
    return <RunTabSkeleton tab="errors" />;
  }
  return (
    <LiveRunErrors
      base={base}
      runNumber={runNumber}
      groups={query.data.groups}
      cursor={query.data.cursor}
      onSelectGroup={(signature) => set({ tab: null, outcome: null, q: null, signature })}
    />
  );
}
