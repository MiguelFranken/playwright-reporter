'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExplorerTable, type ExplorerRow } from '@miguelfranken/ui/views/explorer/explorer-table';
import type { ExplorerSort, SortDir } from '@miguelfranken/ui/lib/explorer-sort';
import { TestDrawer } from '@miguelfranken/ui/views/explorer/test-drawer';
import { TestOverview, type TestOverviewPreview } from '@miguelfranken/ui/views/explorer/test-overview';
import { useUrlParams } from '@/components/filters/url-filters';
import type { ProjectRef } from '@/lib/rpc/client';
import { testOverviewQuery } from '@/lib/rpc/queries';
import { projectHrefs } from '@/lib/view-models';

/** How long the pointer rests on a row before its overview is prefetched. */
const INTENT_MS = 120;

/** The part of a row the drawer can render before its own query answers. */
function toPreview(row: ExplorerRow): TestOverviewPreview {
  return {
    lastOutcome: row.lastOutcome,
    lastRunAt: row.lastRunAt,
    lastRunNumber: row.lastRunNumber,
    lastBranch: row.lastBranch,
    runs: row.runs,
    passed: row.passed,
    failed: row.failed,
    flaky: row.flaky,
    skipped: row.skipped,
    reliability: row.reliability,
    avgDurationMs: row.avgDurationMs,
    flakyRate: row.flakyRate,
    failureRate: row.failureRate,
    streak: row.streak,
  };
}

/**
 * The explorer table and its drawer, with the selection held on the client.
 *
 * Selection used to be a normal search-param navigation, which meant every row
 * click re-ran the page's own query and put the table back behind its skeleton
 * — a table the click never changed. So the selection is written with
 * `history.replaceState` instead: the URL stays shareable and `useSearchParams`
 * stays in sync (the other filters read it), but the server is not asked for
 * anything the click did not actually invalidate.
 *
 * The drawer then opens on the click itself rather than on its data. It paints
 * the header and the whole summary from the row that was clicked, and fetches
 * the history, the errors and the environment breakdown underneath — so the
 * only placeholders on screen are for the parts genuinely not known yet. And
 * "underneath" usually means "already": hovering or focusing a row prefetches
 * its overview, so by the time the click lands the request is in flight or
 * done.
 */
export function UrlExplorer({
  base,
  projectRef,
  rows,
  sort,
  dir,
  days,
  initialTestId,
}: {
  /** Path prefix for in-app links, e.g. `/teams/a/projects/b`. */
  base: string;
  /** The project's slugs, for the drawer's own query. */
  projectRef: ProjectRef;
  rows: ExplorerRow[];
  sort: ExplorerSort;
  dir: SortDir;
  days: number;
  /** A `?test=` the page was loaded with, so a shared link opens the drawer. */
  initialTestId?: string;
}) {
  const { set, isPending } = useUrlParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<string | null>(initialTestId ?? null);

  const queryClient = useQueryClient();
  const { data: overview = null, error } = useQuery({
    ...testOverviewQuery(projectRef, selected ?? '', days),
    enabled: selected !== null,
  });
  // A row the pointer rests on for a moment is prefetched; one it only crosses
  // on the way elsewhere is not. Fresh cache entries are left alone, so moving
  // back and forth costs nothing.
  const intentTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onIntent = useCallback(
    (testId: string | null) => {
      clearTimeout(intentTimer.current);
      if (testId) intentTimer.current = setTimeout(() => void queryClient.prefetchQuery(testOverviewQuery(projectRef, testId, days)), INTENT_MS);
    },
    [queryClient, projectRef, days],
  );
  useEffect(() => () => clearTimeout(intentTimer.current), []);
  useEffect(() => {
    if (error) console.error('Failed to load test overview', error);
  }, [error]);

  /** Moves the selection now and reconciles the URL without a server round trip. */
  const select = useCallback(
    (testId: string | null) => {
      setSelected(testId);
      const next = new URLSearchParams(searchParams.toString());
      if (testId) next.set('test', testId);
      else next.delete('test');
      const qs = next.toString();
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams],
  );

  const selectedRow = selected ? rows.find((r) => r.testId === selected) : undefined;
  const header = selectedRow
    ? { title: selectedRow.title, file: selectedRow.file, platform: selectedRow.pwProject }
    : overview
      ? { title: overview.test.title, file: overview.test.file, platform: overview.test.pwProject }
      : { title: undefined, file: undefined, platform: undefined };

  // A sibling link keeps every filter and swaps only the test, so it stays
  // shareable even though a plain click is handled in place.
  const siblingHref = (testId: string) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set('test', testId);
    return `${pathname}?${qs.toString()}`;
  };

  return (
    <>
      <ExplorerTable
        hrefs={projectHrefs(base)}
        rows={rows}
        sort={sort}
        dir={dir}
        activeTestId={selected ?? undefined}
        isPending={isPending}
        onSortChange={(nextSort, nextDir) => set({ sort: nextSort, dir: nextDir })}
        onSelectTest={select}
        onTestIntent={onIntent}
      />
      {selected ? (
        <TestDrawer
          open
          onOpenChange={(next) => {
            if (!next) select(null);
          }}
          testPageHref={`${base}/tests/${selected}`}
          {...header}
        >
          <TestOverview
            // Remounting on the selection drops the previous test's open tab and
            // scroll position, which would otherwise carry over to the new one.
            key={selected}
            hrefs={{ ...projectHrefs(base), sibling: siblingHref }}
            overview={overview}
            preview={selectedRow ? toPreview(selectedRow) : undefined}
            onSiblingSelect={select}
            days={days}
          />
        </TestDrawer>
      ) : null}
    </>
  );
}
