'use client';

import { RunTabs as RunTabsView } from '@miguelfranken/ui/views/run/run-tabs';
import { RunTabSkeleton } from '@miguelfranken/ui/views/run/run-skeleton';
import type { RunTab } from '@miguelfranken/ui/lib/run-tab';
import { useUrlTab } from '@/components/filters/url-filters';
import { useLivePeek } from '@/components/live/live-store';

/**
 * URL-driven tab strip; the active tab's content is rendered by the server
 * below it.
 *
 * The strip moves the moment you click and the body becomes a placeholder
 * shaped like the tab you asked for, rather than the whole page sitting on the
 * old tab until the query returns. Which placeholder to draw is decided here,
 * in the client, because the server cannot hand a component down as a prop —
 * and it does not need to: the skeletons take no data.
 */
export function RunTabs({
  value,
  counts,
  children,
}: {
  value: RunTab;
  counts?: Partial<Record<RunTab, number>>;
  children: React.ReactNode;
}) {
  // Switching tabs clears the filters the old tab left behind.
  const { tab, select, switching } = useUrlTab<RunTab>('tab', value, {
    defaultValue: 'summary',
    resets: ['outcome', 'q', 'file', 'signature', 'sort', 'status'],
  });

  // The summary's badge is the run's test count, which grows while it runs.
  const total = useLivePeek<{ counts: { total: number } } | null>('header', null)?.counts.total;
  const liveCounts = total === undefined ? counts : { ...counts, summary: total };

  return (
    <RunTabsView value={tab} counts={liveCounts} onValueChange={select}>
      {switching ? <RunTabSkeleton tab={tab} /> : children}
    </RunTabsView>
  );
}
