/**
 * How one live event changes each piece of data a run view shows.
 *
 * Pure functions over plain data, so they run in the browser and in unit
 * tests alike. Two kinds of update, and the difference matters for replay:
 *
 * - **Rows** take absolute values from the event (this outcome, this total
 *   duration). Replaying events a row already reflects is harmless: the last
 *   event touching a field wins, as it did on the server.
 * - **Totals** (counts, spec tallies, error groups) move one result from its
 *   `prev*` bucket to its new one. Those must see each event exactly once,
 *   which is what the snapshot cursor guarantees (see `runCursorSql`).
 */
import type { RunCounts } from '@miguelfranken/ui/patterns/counts-bar';
import type { ErrorGroup } from '@miguelfranken/ui/views/run/run-errors';
import type { RunResultRow } from '@miguelfranken/ui/views/run/run-result';
import type { SpecSummary } from '@miguelfranken/ui/views/run/run-specs';
import type { AttemptEndPayload, LiveEvent, TestBeginPayload } from './events';

type ResultEvent = Extract<LiveEvent, { type: 'test.begin' | 'attempt.end' }>;

function isResultEvent(ev: LiveEvent): ev is ResultEvent {
  return ev.type === 'test.begin' || ev.type === 'attempt.end';
}

/** A result's move from one outcome to another; `from: null` is a new result. */
interface Move {
  from: string | null;
  to: string;
}

function moveOf(ev: LiveEvent): Move | null {
  if (!isResultEvent(ev)) return null;
  // Events stored before payloads carried their previous state cannot move a total.
  if (ev.data.prevOutcome === undefined) return null;
  const { prevOutcome, outcome } = ev.data;
  if (prevOutcome === outcome) return null;
  return { from: prevOutcome, to: outcome };
}

// ---------------------------------------------------------------- counts

/** The `RunCounts` bucket an outcome lands in, as `countsSql` sorts them. */
function countsKey(outcome: string): keyof RunCounts | null {
  switch (outcome) {
    case 'passed':
    case 'flaky':
    case 'skipped':
    case 'interrupted':
    case 'running':
      return outcome;
    case 'failed':
    case 'timedout':
      return 'failed';
    default:
      return null;
  }
}

export function applyMoveToCounts(counts: RunCounts, move: Move): RunCounts {
  const next = { ...counts };
  if (move.from === null) next.total += 1;
  else {
    const key = countsKey(move.from);
    if (key) next[key] = Math.max(0, next[key] - 1);
  }
  const key = countsKey(move.to);
  if (key) next[key] += 1;
  return next;
}

export function reduceCounts(counts: RunCounts, ev: LiveEvent): RunCounts {
  const move = moveOf(ev);
  return move ? applyMoveToCounts(counts, move) : counts;
}

// ---------------------------------------------------------------- header

export interface LiveShard {
  shardIndex: number;
  status: string;
  expectedTests: number;
  durationMs: number | null;
  hostname: string | null;
}

export interface HeaderState<Run extends { status: string; expectedTests: number } = { status: string; expectedTests: number }> {
  run: Run;
  counts: RunCounts;
  shards: LiveShard[];
}

export function reduceHeader<S extends HeaderState>(state: S, ev: LiveEvent): S {
  switch (ev.type) {
    case 'test.begin':
    case 'attempt.end': {
      const counts = reduceCounts(state.counts, ev);
      return counts === state.counts ? state : { ...state, counts };
    }
    case 'shard.started': {
      const { shardIndex, expectedTests } = ev.data;
      const known = state.shards.some((s) => s.shardIndex === shardIndex);
      const shards = known
        ? state.shards.map((s) => (s.shardIndex === shardIndex ? { ...s, status: 'running' } : s))
        : [...state.shards, { shardIndex, status: 'running', expectedTests, durationMs: null, hostname: null }].sort(
            (a, b) => a.shardIndex - b.shardIndex,
          );
      // A new shard of the same run adds its tests to the run's total, as `startRun` does.
      const run = known ? state.run : { ...state.run, expectedTests: state.run.expectedTests + expectedTests };
      return { ...state, run, shards };
    }
    case 'shard.finished': {
      const shards = state.shards.map((s) => (s.shardIndex === ev.data.shardIndex ? { ...s, status: ev.data.status } : s));
      return { ...state, shards };
    }
    case 'run.finished': {
      const { status, durationMs } = ev.data;
      return { ...state, run: { ...state.run, status, ...(durationMs !== undefined ? { durationMs } : {}) } };
    }
    case 'run.resumed': {
      // Closed as stale, then heard from again: the shards it closed run on.
      const shards = state.shards.map((s) => (s.status === 'incomplete' ? { ...s, status: 'running' } : s));
      return { ...state, run: { ...state.run, status: 'running', durationMs: null }, shards };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------- rows

/**
 * A row known only from an event. It is shown straight away and fetched in
 * full shortly after — the event does not carry the test's history or its
 * uploaded attachments.
 */
export type LiveRow = RunResultRow & { partial?: boolean };

function rowFromBegin(d: TestBeginPayload): LiveRow {
  return {
    id: d.resultId,
    testId: d.testId,
    outcome: d.outcome,
    durationMs: 0,
    attemptCount: 0,
    errorMessage: null,
    errorSignature: null,
    annotations: d.annotations ?? [],
    tags: d.tags ?? [],
    title: d.title,
    titlePath: d.titlePath ?? [d.title],
    file: d.file,
    pwProject: d.project,
    line: d.line ?? 0,
    history: [],
    attachmentKinds: [],
    partial: true,
  };
}

function rowFromEnd(d: AttemptEndPayload): LiveRow {
  return {
    id: d.resultId,
    testId: d.testId,
    outcome: d.outcome,
    durationMs: d.resultDurationMs ?? d.durationMs ?? 0,
    attemptCount: d.attemptCount ?? d.retry + 1,
    errorMessage: d.errorMessage ?? null,
    errorSignature: d.errorSignature ?? null,
    annotations: d.annotations ?? [],
    tags: [],
    title: d.title,
    titlePath: [d.title],
    file: d.file,
    pwProject: d.project,
    line: 0,
    history: [],
    attachmentKinds: [],
    partial: true,
  };
}

export type RowMap = ReadonlyMap<string, LiveRow>;

export function reduceRows(rows: RowMap, ev: LiveEvent): RowMap {
  if (!isResultEvent(ev)) return rows;
  const existing = rows.get(ev.data.resultId);
  let row: LiveRow;
  if (ev.type === 'test.begin') {
    row = existing ? { ...existing, outcome: ev.data.outcome ?? existing.outcome, tags: ev.data.tags ?? existing.tags } : rowFromBegin(ev.data);
  } else {
    const d = ev.data;
    row = existing
      ? {
          ...existing,
          outcome: d.outcome,
          // `??` for events stored before payloads carried the result's totals.
          durationMs: d.resultDurationMs ?? existing.durationMs,
          attemptCount: d.attemptCount ?? existing.attemptCount,
          errorMessage: d.errorMessage ?? existing.errorMessage,
          errorSignature: d.errorSignature ?? existing.errorSignature,
          annotations: d.annotations ?? existing.annotations,
        }
      : rowFromEnd(d);
  }
  const next = new Map(rows);
  next.set(row.id, row);
  return next;
}

export interface RowFilters {
  outcome?: string;
  q?: string;
  file?: string;
  signature?: string;
}

/** The same predicate `listRunResults` applies in SQL. */
export function matchesRowFilters(row: RunResultRow, f: RowFilters): boolean {
  if (f.outcome && f.outcome !== 'all') {
    if (f.outcome === 'failed') {
      if (!['failed', 'timedout', 'interrupted'].includes(row.outcome)) return false;
    } else if (row.outcome !== f.outcome) return false;
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!row.title.toLowerCase().includes(q) && !row.file.toLowerCase().includes(q)) return false;
  }
  if (f.file && row.file !== f.file) return false;
  if (f.signature && row.errorSignature !== f.signature) return false;
  return true;
}

const OUTCOME_RANK: Record<string, number> = { failed: 0, timedout: 0, interrupted: 1, flaky: 2, running: 3, passed: 4 };
const collator = new Intl.Collator('en');

/** The same order `listRunResults` sorts by: problems first, then by file and title. */
export function compareRows(a: RunResultRow, b: RunResultRow): number {
  return (
    (OUTCOME_RANK[a.outcome] ?? 5) - (OUTCOME_RANK[b.outcome] ?? 5) ||
    collator.compare(a.file, b.file) ||
    collator.compare(a.title, b.title) ||
    collator.compare(a.pwProject, b.pwProject)
  );
}

export function visibleRows(rows: RowMap, filters: RowFilters): LiveRow[] {
  return [...rows.values()].filter((r) => matchesRowFilters(r, filters)).sort(compareRows);
}

// ---------------------------------------------------------------- specs

/** The `SpecSummary` bucket an outcome lands in, as `listRunSpecs` sorts them. */
function specKey(outcome: string): 'passed' | 'failed' | 'flaky' | 'skipped' | 'running' | null {
  switch (outcome) {
    case 'passed':
    case 'flaky':
    case 'skipped':
    case 'running':
      return outcome;
    case 'failed':
    case 'timedout':
    case 'interrupted':
      return 'failed';
    default:
      return null;
  }
}

export function reduceSpecs(specs: SpecSummary[], ev: LiveEvent): SpecSummary[] {
  if (!isResultEvent(ev)) return specs;
  const move = moveOf(ev);
  const addedMs = ev.type === 'attempt.end' ? ev.data.durationMs : 0;
  if (!move && addedMs === 0) return specs;
  const file = ev.data.file;
  const index = specs.findIndex((s) => s.file === file);
  const spec: SpecSummary =
    index >= 0 ? { ...specs[index] } : { file, total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, running: 0, durationMs: 0 };
  if (move) {
    if (move.from === null) spec.total += 1;
    else {
      const key = specKey(move.from);
      if (key) spec[key] = Math.max(0, spec[key] - 1);
    }
    const key = specKey(move.to);
    if (key) spec[key] += 1;
  }
  spec.durationMs += addedMs;
  const next = [...specs];
  if (index >= 0) next[index] = spec;
  else {
    next.push(spec);
    next.sort((a, b) => collator.compare(a.file, b.file));
  }
  return next;
}

// ---------------------------------------------------------------- errors

const FAILED = ['failed', 'timedout', 'interrupted'];

function contribution(outcome: string | null) {
  return { failed: outcome && FAILED.includes(outcome) ? 1 : 0, flaky: outcome === 'flaky' ? 1 : 0 };
}

/**
 * Moves one result between error groups. A group's `files` only ever grows:
 * knowing whether another result still holds a file would take the rows.
 */
export function reduceErrorGroups(groups: ErrorGroup[], ev: LiveEvent): ErrorGroup[] {
  if (ev.type !== 'attempt.end') return groups;
  const d = ev.data;
  if (d.prevErrorSignature === d.errorSignature && d.prevOutcome === d.outcome) return groups;
  let next = groups;
  if (d.prevErrorSignature) {
    const c = contribution(d.prevOutcome);
    next = next
      .map((g) => (g.signature === d.prevErrorSignature ? { ...g, count: g.count - 1, failed: g.failed - c.failed, flaky: g.flaky - c.flaky } : g))
      .filter((g) => g.count > 0);
  }
  if (d.errorSignature) {
    const c = contribution(d.outcome);
    const found = next.some((g) => g.signature === d.errorSignature);
    next = found
      ? next.map((g) =>
          g.signature === d.errorSignature
            ? { ...g, count: g.count + 1, failed: g.failed + c.failed, flaky: g.flaky + c.flaky, files: g.files.includes(d.file) ? g.files : [...g.files, d.file] }
            : g,
        )
      : [
          ...next,
          { signature: d.errorSignature, message: d.errorMessage ?? '', count: 1, failed: c.failed, flaky: c.flaky, files: [d.file], sampleResultId: d.resultId },
        ];
  }
  return [...next].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------- runs list

/**
 * A project page's rows each carry their own run's cursor: a project-wide one
 * is not ordered across runs that ingest at the same time. An event a row
 * already reflects is skipped.
 */
export function reduceRunCounts<R extends { id: string; counts: RunCounts; cursor?: number }>(runs: R[], ev: LiveEvent): R[] {
  const index = runs.findIndex((r) => r.id === ev.data.runId);
  if (index < 0) return runs;
  const run = runs[index];
  if (run.cursor !== undefined && ev.id <= run.cursor) return runs;
  const move = moveOf(ev);
  const next = [...runs];
  next[index] = { ...run, cursor: ev.id, counts: move ? applyMoveToCounts(run.counts, move) : run.counts };
  return next;
}

type ListedRun = { id: string; counts: RunCounts; cursor?: number; status: string; durationMs: number | null };

/** The runs table: counts, a finished run's status and duration, and a stale run resuming. */
export function reduceRunsTable<R extends ListedRun>(runs: R[], ev: LiveEvent): R[] {
  if (ev.type !== 'run.finished' && ev.type !== 'run.resumed') return reduceRunCounts(runs, ev);
  const index = runs.findIndex((r) => r.id === ev.data.runId);
  if (index < 0) return runs;
  const next = [...runs];
  if (ev.type === 'run.resumed') {
    next[index] = { ...runs[index], status: 'running', durationMs: null };
    return next;
  }
  const { status, durationMs } = ev.data;
  next[index] = { ...runs[index], status, durationMs: durationMs ?? runs[index].durationMs };
  return next;
}

type ActiveListedRun = ListedRun & { shardTotal: number; shards: { shardIndex: number; status: string }[] };

/** The active-run cards: counts, shard progress, and a finished run leaving. */
export function reduceActiveRuns<R extends ActiveListedRun>(runs: R[], ev: LiveEvent): R[] {
  switch (ev.type) {
    case 'run.finished':
      return runs.some((r) => r.id === ev.data.runId) ? runs.filter((r) => r.id !== ev.data.runId) : runs;
    case 'shard.started':
    case 'shard.finished': {
      const index = runs.findIndex((r) => r.id === ev.data.runId);
      if (index < 0) return runs;
      const run = runs[index];
      const status = ev.type === 'shard.started' ? 'running' : ev.data.status;
      const known = run.shards.some((sh) => sh.shardIndex === ev.data.shardIndex);
      const shards = known
        ? run.shards.map((sh) => (sh.shardIndex === ev.data.shardIndex ? { ...sh, status } : sh))
        : [...run.shards, { shardIndex: ev.data.shardIndex, status }].sort((a, b) => a.shardIndex - b.shardIndex);
      const shardTotal = ev.type === 'shard.started' ? Math.max(run.shardTotal, ev.data.shardTotal) : run.shardTotal;
      const next = [...runs];
      next[index] = { ...run, shards, shardTotal };
      return next;
    }
    default:
      return reduceRunCounts(runs, ev);
  }
}

export interface RunListFilters {
  status?: string;
  branch?: string;
  prNumber?: number;
  environment?: string;
  q?: string;
  days?: number;
  page?: number;
}

type FilterableRun = {
  number: number;
  status: string;
  gitBranch: string | null;
  prNumber: number | null;
  environment: string | null;
  gitMessage: string | null;
  gitShortSha: string | null;
  startedAt: Date;
};

/** The same predicate `listRuns` applies in SQL. */
export function matchesRunFilters(run: FilterableRun, f: RunListFilters, now = Date.now()): boolean {
  if (f.status && f.status !== 'all' && run.status !== f.status) return false;
  if (f.branch && run.gitBranch !== f.branch) return false;
  if (f.prNumber !== undefined && run.prNumber !== f.prNumber) return false;
  if (f.environment && run.environment !== f.environment) return false;
  if (f.days && run.startedAt.getTime() < now - f.days * 86_400_000) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hit =
      (run.gitMessage ?? '').toLowerCase().includes(q) ||
      (run.gitBranch ?? '').toLowerCase().includes(q) ||
      String(run.number) === f.q.replace(/^#/, '') ||
      (run.gitShortSha ?? '').toLowerCase().startsWith(q);
    if (!hit) return false;
  }
  return true;
}

/** Dates arrive from a JSON endpoint as strings; the views expect `Date`s. */
export function reviveDates<T extends object>(row: T): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (key.endsWith('At') && typeof value === 'string' && !Number.isNaN(Date.parse(value))) out[key] = new Date(value);
  }
  return out as T;
}
