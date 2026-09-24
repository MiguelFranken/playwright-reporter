'use client';

import { useEffect } from 'react';
import { ActiveRuns, type ActiveRun } from '@miguelfranken/ui/views/runs/active-runs';
import { RunsTable, type RunListItem } from '@miguelfranken/ui/views/runs/runs-table';
import type { LiveEvent } from '@/lib/live/events';
import { matchesRunFilters, reduceActiveRuns, reduceRunsTable, reviveDates, type RunListFilters } from '@/lib/live/reducers';
import type { LiveStore } from '@/lib/live/store';
import { projectHrefs } from '@/lib/view-models';
import { useLivePart, useLiveStore } from './live-store';

type Listed = RunListItem & { cursor?: number };
type ActiveListed = ActiveRun & { cursor?: number };

/** Runs that start while the page is open arrive in a short burst (a sharded run); one request fetches them. */
const INSERT_MS = 500;

/**
 * Fetches each run that starts while the page is open, once, and hands it to
 * `insert`. The run's later events then apply through the part's reducer; the
 * replay after the insert is exact because each row carries its own cursor.
 */
function useRunInserts<T extends { id: string }>(name: string, itemsUrl: string, insert: (current: T[], fresh: T[]) => T[]) {
  const store = useLiveStore();
  useEffect(() => {
    const queued = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = async () => {
      timer = null;
      const ids = [...queued];
      queued.clear();
      const fresh = await fetchRuns<T>(store, itemsUrl, ids);
      if (!fresh.length) return;
      const idSet = new Set(fresh.map((r) => r.id));
      store.merge<T[]>(name, (current) => insert(current, fresh), (ev) => idSet.has(ev.data.runId));
    };
    return store.onEvent((ev: LiveEvent) => {
      if (ev.type !== 'run.started') return;
      const current = store.peek<T[]>(name);
      if (current?.some((r) => r.id === ev.data.runId)) return;
      queued.add(ev.data.runId);
      timer ??= setTimeout(() => void flush(), INSERT_MS);
    });
  }, [store, name, itemsUrl, insert]);
}

/** Both lists want the same new run; the request is shared. */
const pending = new WeakMap<LiveStore, Map<string, Promise<unknown[]>>>();

async function fetchRuns<T extends object>(store: LiveStore, itemsUrl: string, ids: string[]): Promise<T[]> {
  if (!ids.length) return [];
  let byKey = pending.get(store);
  if (!byKey) pending.set(store, (byKey = new Map()));
  const key = ids.sort().join(',');
  let request = byKey.get(key);
  if (!request) {
    request = fetch(`${itemsUrl}?ids=${key}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { runs: [] }))
      .then((body: { runs: T[] }) => body.runs.map((r) => reviveDates(r)))
      .catch(() => []);
    byKey.set(key, request);
    setTimeout(() => byKey.delete(key), 10_000);
  }
  return (await request) as T[];
}

/**
 * The runs list with each run's counts, status and duration following the
 * project stream. A run that starts is fetched once and inserted when it
 * matches the page's filters, so nothing re-renders the route.
 */
export function LiveRunsTable({
  base,
  runs,
  cursor,
  filters,
  pageSize,
}: {
  base: string;
  runs: Listed[];
  cursor: number;
  filters: RunListFilters;
  pageSize: number;
}) {
  const live = useLivePart('runs-table', runs, cursor, reduceRunsTable);
  const page = filters.page ?? 1;
  useRunInserts<Listed>('runs-table', `/api${base}/runs/items`, insertIntoTable(filters, page, pageSize));
  // A finished run can leave a status filter; the rest matched when the server listed them.
  const shown = live.filter((r) => matchesRunFilters(r, { status: filters.status }));
  return <RunsTable hrefs={projectHrefs(base)} runs={shown} />;
}

const tableInserts = new Map<string, (current: Listed[], fresh: Listed[]) => Listed[]>();

/** Stable per filter set, so the insert effect is not re-subscribed on every render. */
function insertIntoTable(filters: RunListFilters, page: number, pageSize: number) {
  const key = JSON.stringify([filters, page, pageSize]);
  let fn = tableInserts.get(key);
  if (!fn) {
    fn = (current, fresh) => {
      // Only the first page shows the newest runs.
      if (page !== 1) return current;
      const known = new Set(current.map((r) => r.id));
      const added = fresh.filter((r) => !known.has(r.id) && matchesRunFilters(r, filters));
      if (!added.length) return current;
      const merged = [...added, ...current];
      return merged.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, pageSize);
    };
    tableInserts.set(key, fn);
  }
  return fn;
}

export function LiveActiveRuns({ base, runs, cursor }: { base: string; runs: ActiveListed[]; cursor: number }) {
  const live = useLivePart('active-runs', runs, cursor, reduceActiveRuns);
  useRunInserts<ActiveListed>('active-runs', `/api${base}/runs/items`, insertActive);
  return <ActiveRuns hrefs={projectHrefs(base)} runs={live} />;
}

function insertActive(current: ActiveListed[], fresh: ActiveListed[]) {
  const known = new Set(current.map((r) => r.id));
  const added = fresh.filter((r) => !known.has(r.id) && r.status === 'running');
  return added.length ? [...added, ...current].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 10) : current;
}
