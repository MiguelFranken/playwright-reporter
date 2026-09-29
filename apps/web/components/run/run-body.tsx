'use client';

import { Images } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@miguelfranken/ui/components/button';
import { RunConfig, type RunConfigData } from '@miguelfranken/ui/views/run/run-config';
import { RunTabs } from '@miguelfranken/ui/views/run/run-tabs';
import type { RunCounts } from '@miguelfranken/ui/patterns/counts-bar';
import { useShallowSearch } from '@/components/filters/url-filters';
import { useLivePeek } from '@/components/live/live-store';
import { PrefetchLink } from '@/components/prefetch-link';
import type { RunRef } from '@/lib/rpc/client';
import { runErrorsQuery, runRowsQuery, runSpecsQuery } from '@/lib/rpc/queries';
import { parseRunTab, type RunTab } from './run-tab';
import { UrlRunErrors } from './url-run-errors';
import { UrlRunSpecs } from './url-run-specs';
import { UrlRunSummary, type SummaryHead } from './url-run-summary';

/** Params cleared on a tab switch — a filter from the old tab rarely fits the new one. */
const TAB_RESETS = {
  outcome: null,
  q: null,
  file: null,
  signature: null,
  sort: null,
  status: null,
  artifact: null,
  pwProject: null,
  tag: null,
  retried: null,
};

/**
 * The run's tab strip and the active tab's body, switched in the browser.
 *
 * Every tab's data is a TanStack Query (`lib/rpc/queries.ts`) the server seeds
 * for the tab it rendered, so switching tabs — and going back — updates the
 * URL without a navigation and answers from the cache: no server render, no
 * placeholder once a tab has been seen. A tab not yet loaded starts fetching
 * when the pointer rests on it, and shows its placeholder only if the click
 * beats the answer. A reload renders the same tab on the server.
 */
export function RunBody({
  base,
  runNumber,
  runRef,
  counts,
  config,
  summaryHead,
  review,
}: {
  base: string;
  runNumber: number;
  runRef: RunRef;
  counts: RunCounts;
  config: RunConfigData;
  /** The summary's first paint, when the server rendered that tab. */
  summaryHead?: SummaryHead;
  /** The run's visual review, when it captured review checkpoints. */
  review?: { href: string; toReview: number; total: number };
}) {
  const { params, set } = useShallowSearch();
  const tab = parseRunTab(params.get('tab') ?? undefined);
  const queryClient = useQueryClient();

  // The summary's badge is the run's test count, which grows while it runs.
  const total = useLivePeek<{ counts: { total: number } } | null>('header', null)?.counts.total ?? counts.total;

  const prefetch = (next: RunTab) => {
    if (next === 'summary') void queryClient.prefetchQuery(runRowsQuery(runRef));
    else if (next === 'specs') void queryClient.prefetchQuery(runSpecsQuery(runRef));
    else if (next === 'errors') void queryClient.prefetchQuery(runErrorsQuery(runRef));
  };

  const select = (next: RunTab) => {
    if (next === tab) return;
    set({ ...TAB_RESETS, tab: next === 'summary' ? null : next });
  };

  return (
    <RunTabs
      value={tab}
      counts={{ summary: total }}
      onValueChange={select}
      onTabIntent={prefetch}
      actions={
        review ? (
          <Button variant={review.toReview ? 'default' : 'outline'} size="sm" nativeButton={false} render={<PrefetchLink href={review.href} />}>
            <Images /> Visual review
            <span className="tabular-nums opacity-80">{review.toReview ? `${review.toReview} to review` : review.total}</span>
          </Button>
        ) : null
      }
    >
      {tab === 'specs' ? (
        <UrlRunSpecs base={base} runNumber={runNumber} runRef={runRef} />
      ) : tab === 'errors' ? (
        <UrlRunErrors base={base} runNumber={runNumber} runRef={runRef} />
      ) : tab === 'config' ? (
        <RunConfig run={config} />
      ) : (
        <UrlRunSummary base={base} runNumber={runNumber} counts={counts} runRef={runRef} head={summaryHead} />
      )}
    </RunTabs>
  );
}
