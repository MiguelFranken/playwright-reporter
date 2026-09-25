'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RunCounts } from '@miguelfranken/ui/patterns/counts-bar';
import { RunErrors, type ErrorGroup } from '@miguelfranken/ui/views/run/run-errors';
import { RunHeader, type RunHeaderData, type RunHeaderShard } from '@miguelfranken/ui/views/run/run-header';
import { DebugWithAiMenu } from '@miguelfranken/ui/patterns/debug-with-ai-menu';
import type { RunResultRow } from '@miguelfranken/ui/views/run/run-result';
import type { SpecSummary } from '@miguelfranken/ui/views/run/run-specs';
import type { LiveEvent } from '@/lib/live/events';
import {
  reduceErrorGroups,
  reduceHeader,
  reduceRows,
  visibleRows,
  type HeaderState,
  type LiveRow,
  type RowFilters,
  type RowMap,
} from '@/lib/live/reducers';
import { orpc, type RunRef } from '@/lib/rpc/client';
import { runHrefs } from '@/lib/view-models';
import type { LiveStore } from '@/lib/live/store';
import { LiveConnection, useLivePart, useLivePeek, useLiveStore } from './live-store';

type Header = HeaderState<RunHeaderData> & { shards: RunHeaderShard[] };

/**
 * The run's header, its counts and shards kept current, and the page's stream.
 *
 * `aiPrompt` arrives prebuilt from the server (a string, not a builder — trap 1
 * in packages/ui/AGENTS.md); whether to offer it is decided here from the *live*
 * counts, so the menu appears as soon as a running run records its first failure.
 */
export function LiveRunHeader({
  run,
  counts,
  shards,
  cursor,
  streamUrl,
  pollUrl,
  runRef,
  branchHref,
  pullRequestHref,
  aiPrompt,
  aiSetupHref,
}: {
  run: RunHeaderData;
  counts: RunCounts;
  shards: RunHeaderShard[];
  cursor: number;
  streamUrl: string;
  pollUrl: string;
  /** The run as the RPC procedures address it, for settling on its final numbers. */
  runRef: RunRef;
  branchHref?: string;
  pullRequestHref?: string;
  /** Scope-only triage prompt for the "Debug with AI" menu. */
  aiPrompt?: string;
  /** Where the menu sends users who have not connected an assistant yet. */
  aiSetupHref?: string;
}) {
  const store = useLiveStore();
  const queryClient = useQueryClient();
  const header = useLivePart<Header>('header', { run, counts, shards }, cursor, reduceHeader, run);
  const running = header.run.status === 'running';
  // A running run's elapsed time is derived from the clock, not from events.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const hasFailures = header.counts.failed + header.counts.flaky > 0;

  return (
    <RunHeader
      run={header.run}
      counts={header.counts}
      shards={header.shards}
      branchHref={branchHref}
      pullRequestHref={pullRequestHref}
      now={now}
      actions={aiPrompt && aiSetupHref && hasFailures ? <DebugWithAiMenu prompt={aiPrompt} setupHref={aiSetupHref} /> : undefined}
      liveIndicator={
        <LiveConnection
          streamUrl={streamUrl}
          pollUrl={pollUrl}
          enabled={run.status === 'running'}
          onFinish={() => settleFinishedRun(store, queryClient, runRef)}
        />
      }
    />
  );
}

/**
 * Once a run has finished, the page takes the server's final numbers: the
 * finish settles results still open in bulk, without an event for each. One
 * summary request (plus the rows still shown as running) replaces what a
 * route refresh used to do — without emptying the router cache.
 */
async function settleFinishedRun(store: LiveStore, queryClient: QueryClient, runRef: RunRef): Promise<boolean> {
  const parts = (['specs', 'errors'] as const).filter((p) => store.peek(p) !== undefined);
  try {
    const body = await queryClient.fetchQuery({ ...orpc.runs.summary.queryOptions({ input: { ...runRef, parts: [...parts] } }), staleTime: 0 });
    const never = () => false;
    store.merge<Header>('header', () => body.header, never);
    if (body.specs) store.merge<SpecSummary[]>('specs', () => body.specs!, never);
    if (body.errors) store.merge<ErrorGroup[]>('errors', () => body.errors!, never);

    const rows = store.peek<RowMap>('rows');
    const open = rows ? [...rows.values()].filter((r) => r.outcome === 'running').map((r) => r.id) : [];
    for (let i = 0; i < open.length; i += BACKFILL_BATCH) {
      const fresh = await fetchRows(queryClient, runRef, open.slice(i, i + BACKFILL_BATCH));
      store.merge<RowMap>(
        'rows',
        (current) => {
          const next = new Map(current);
          for (const row of fresh) next.set(row.id, row);
          return next;
        },
        never,
      );
    }
    return true;
  } catch {
    return false;
  }
}

/** Result rows by id, always fresh: a row is asked for because it changed. */
async function fetchRows(queryClient: QueryClient, runRef: RunRef, ids: string[]): Promise<RunResultRow[]> {
  const { rows } = await queryClient.fetchQuery({ ...orpc.runs.results.queryOptions({ input: { ...runRef, ids } }), staleTime: 0 });
  return rows;
}

/** The run's counts as the header currently has them. */
export function useLiveRunCounts(fallback: RunCounts): RunCounts {
  return useLivePeek<Header | null>('header', null)?.counts ?? fallback;
}

/**
 * How long partial rows wait before their full data is fetched, so the tests
 * a wave of workers starts together are one request. The row is on screen
 * meanwhile; only its history and uploads arrive with the fetch.
 */
const BACKFILL_MS = 2000;
const BACKFILL_BATCH = 100;

/**
 * A run's result rows, kept current by the stream and narrowed by `filters`
 * in the browser — the same predicate and order the server applies — so a
 * test that starts, fails or turns flaky moves into place without a request.
 *
 * Rows the store knows only from an event lack the test's history and its
 * uploads; those are fetched by id, in batches, once they are on screen.
 */
export function useLiveRows(
  rows: RunResultRow[],
  cursor: number,
  filters: RowFilters,
  runRef: RunRef,
  { backfill = true }: { backfill?: boolean } = {},
): LiveRow[] {
  const store = useLiveStore();
  const queryClient = useQueryClient();
  const { team, project, runId } = runRef;
  const initial = useMemo(() => new Map(rows.map((r) => [r.id, r as LiveRow])) as RowMap, [rows]);
  const map = useLivePart<RowMap>('rows', initial, cursor, reduceRows, rows);
  const visible = useMemo(() => visibleRows(map, filters), [map, filters]);

  // Only requests in flight are remembered: a row that becomes partial again
  // (recreated from an event after a filter change) is fetched again.
  const inFlight = useRef(new Set<string>());
  const partialIds = backfill ? visible.filter((r) => r.partial && !inFlight.current.has(r.id)).map((r) => r.id) : [];
  const key = partialIds.join(',');
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(async () => {
      const ids = key.split(',').slice(0, BACKFILL_BATCH);
      for (const id of ids) inFlight.current.add(id);
      try {
        const fresh = new Map((await fetchRows(queryClient, { team, project, runId }, ids)).map((r) => [r.id, r]));
        store.merge<RowMap>(
          'rows',
          (current) => {
            const next = new Map(current);
            for (const [id, row] of fresh) next.set(id, row);
            return next;
          },
          (ev: LiveEvent) => (ev.type === 'test.begin' || ev.type === 'attempt.end') && fresh.has(ev.data.resultId),
        );
      } catch {
        // Tried again with the next change.
      } finally {
        for (const id of ids) inFlight.current.delete(id);
      }
    }, BACKFILL_MS);
    return () => clearTimeout(timer);
  }, [key, team, project, runId, store, queryClient]);

  return visible;
}

/** The errors tab: groups move as results fail, turn flaky or change signature. */
export function LiveRunErrors({ base, runNumber, groups, cursor }: { base: string; runNumber: number; groups: ErrorGroup[]; cursor: number }) {
  const live = useLivePart('errors', groups, cursor, reduceErrorGroups);
  return <RunErrors hrefs={runHrefs(base, runNumber)} groups={live} />;
}
