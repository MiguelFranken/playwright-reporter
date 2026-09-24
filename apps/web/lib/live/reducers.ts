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
    case 'run.finished':
      return { ...state, run: { ...state.run, status: ev.data.status } };
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
    annotations: d.annotations,
    tags: d.tags,
    title: d.title,
    titlePath: d.titlePath,
    file: d.file,
    pwProject: d.project,
    line: d.line,
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
    durationMs: d.resultDurationMs,
    attemptCount: d.attemptCount,
    errorMessage: d.errorMessage,
    errorSignature: d.errorSignature,
    annotations: d.annotations,
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
    row = existing ? { ...existing, outcome: ev.data.outcome, tags: ev.data.tags } : rowFromBegin(ev.data);
  } else {
    const d = ev.data;
    row = existing
      ? {
          ...existing,
          outcome: d.outcome,
          durationMs: d.resultDurationMs,
          attemptCount: d.attemptCount,
          errorMessage: d.errorMessage,
          errorSignature: d.errorSignature,
          annotations: d.annotations,
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

export function reduceRunCounts<R extends { id: string; counts: RunCounts }>(runs: R[], ev: LiveEvent): R[] {
  const move = moveOf(ev);
  if (!move) return runs;
  const index = runs.findIndex((r) => r.id === ev.data.runId);
  if (index < 0) return runs;
  const next = [...runs];
  next[index] = { ...runs[index], counts: applyMoveToCounts(runs[index].counts, move) };
  return next;
}
