import { describe, expect, it } from 'vitest';
import type { RunCounts } from '@miguelfranken/ui/patterns/counts-bar';
import type { AttemptEndPayload, LiveEvent, TestBeginPayload } from './events';
import {
  compareRows,
  matchesRowFilters,
  reduceCounts,
  reduceErrorGroups,
  matchesRunFilters,
  reduceActiveRuns,
  reduceHeader,
  reduceRows,
  reduceRunsTable,
  reviveDates,
  reduceRunCounts,
  reduceSpecs,
  visibleRows,
  type LiveRow,
} from './reducers';

const zero: RunCounts = { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, interrupted: 0, running: 0 };
const meta = { runId: 'run-1', at: '2026-09-24T10:00:00.000Z' };

function begin(id: number, over: Partial<TestBeginPayload> = {}): LiveEvent {
  return {
    id,
    type: 'test.begin',
    data: {
      testId: 't1',
      resultId: 'r1',
      title: 'renders',
      titlePath: ['home.spec.ts', 'renders'],
      file: 'home.spec.ts',
      project: 'chromium',
      line: 3,
      tags: [],
      annotations: [],
      retry: 0,
      outcome: 'running',
      prevOutcome: null,
      ...over,
      ...meta,
    },
  };
}

function end(id: number, over: Partial<AttemptEndPayload> = {}): LiveEvent {
  return {
    id,
    type: 'attempt.end',
    data: {
      testId: 't1',
      resultId: 'r1',
      title: 'renders',
      file: 'home.spec.ts',
      project: 'chromium',
      retry: 0,
      status: 'passed',
      isFinal: true,
      durationMs: 100,
      outcome: 'passed',
      prevOutcome: 'running',
      resultDurationMs: 100,
      attemptCount: 1,
      errorMessage: null,
      errorSignature: null,
      prevErrorSignature: null,
      annotations: [],
      ...over,
      ...meta,
    },
  };
}

describe('reduceCounts', () => {
  it('adds a new result as running, then moves it to its outcome', () => {
    const started = reduceCounts(zero, begin(1));
    expect(started).toMatchObject({ total: 1, running: 1 });
    expect(reduceCounts(started, end(2, { outcome: 'failed' }))).toMatchObject({ total: 1, running: 0, failed: 1 });
  });

  it('counts timedout as failed, like the SQL does', () => {
    expect(reduceCounts({ ...zero, total: 1, running: 1 }, end(2, { outcome: 'timedout' }))).toMatchObject({ failed: 1, running: 0 });
  });

  it('ignores a begin that does not change the outcome (a retry)', () => {
    const counts = { ...zero, total: 1, running: 1 };
    expect(reduceCounts(counts, begin(3, { prevOutcome: 'running', retry: 1 }))).toBe(counts);
  });
});

describe('events stored before the live payloads', () => {
  it('leave totals alone instead of guessing the previous outcome', () => {
    const old = end(9, { outcome: 'passed' });
    delete (old.data as Partial<AttemptEndPayload>).prevOutcome;
    const counts = { ...zero, total: 1, running: 1 };
    expect(reduceCounts(counts, old)).toBe(counts);
  });
});

describe('reduceHeader', () => {
  const state = { run: { status: 'running', expectedTests: 4 }, counts: zero, shards: [{ shardIndex: 1, status: 'running', expectedTests: 4, durationMs: null, hostname: null }] };

  it('adds a second shard and its expected tests', () => {
    const next = reduceHeader(state, { id: 1, type: 'shard.started', data: { shardIndex: 2, shardTotal: 2, expectedTests: 3, ...meta } });
    expect(next.shards.map((s) => s.shardIndex)).toEqual([1, 2]);
    expect(next.run.expectedTests).toBe(7);
  });

  it('marks shards and the run finished', () => {
    const shard = reduceHeader(state, { id: 1, type: 'shard.finished', data: { shardIndex: 1, status: 'passed', ...meta } });
    expect(shard.shards[0].status).toBe('passed');
    const run = reduceHeader(shard, { id: 2, type: 'run.finished', data: { status: 'failed', ...meta } });
    expect(run.run.status).toBe('failed');
  });

  it('closes a stale run with its shards, and runs it on when it resumes', () => {
    const shard = reduceHeader(state, { id: 1, type: 'shard.finished', data: { shardIndex: 1, status: 'incomplete', ...meta } });
    const closed = reduceHeader(shard, {
      id: 2,
      type: 'run.finished',
      data: { status: 'incomplete', reason: 'stale', durationMs: 60_000, finishedAt: meta.at, ...meta },
    });
    expect(closed.run).toMatchObject({ status: 'incomplete', durationMs: 60_000 });

    const resumed = reduceHeader(closed, { id: 3, type: 'run.resumed', data: meta });
    expect(resumed.run).toMatchObject({ status: 'running', durationMs: null });
    expect(resumed.shards[0].status).toBe('running');
  });
});

describe('reduceRows', () => {
  it('creates a partial row from a begin and completes it from the attempt', () => {
    const rows = reduceRows(new Map(), begin(1));
    expect(rows.get('r1')).toMatchObject({ outcome: 'running', titlePath: ['home.spec.ts', 'renders'], partial: true });
    const done = reduceRows(rows, end(2, { outcome: 'flaky', resultDurationMs: 250, attemptCount: 2, errorSignature: 'sig' }));
    expect(done.get('r1')).toMatchObject({ outcome: 'flaky', durationMs: 250, attemptCount: 2, errorSignature: 'sig', partial: true });
  });

  it('patches a full row in place and keeps what the event does not carry', () => {
    const full: LiveRow = { ...(reduceRows(new Map(), begin(1)).get('r1') as LiveRow), history: ['passed'], attachmentKinds: ['video'], partial: undefined };
    const next = reduceRows(new Map([['r1', full]]), end(2));
    expect(next.get('r1')).toMatchObject({ outcome: 'passed', history: ['passed'], attachmentKinds: ['video'] });
    expect(next.get('r1')!.partial).toBeUndefined();
  });

  it('reaches the same row whatever state a replayed suffix starts from', () => {
    const events = [begin(1), end(2, { outcome: 'running', isFinal: false, attemptCount: 1 }), begin(3, { prevOutcome: 'running', retry: 1 }), end(4, { outcome: 'flaky', attemptCount: 2, resultDurationMs: 300 })];
    const all = events.reduce(reduceRows, new Map() as ReturnType<typeof reduceRows>);
    // A snapshot taken after event 4, then events 3 and 4 replayed on top of it.
    const replayed = events.slice(2).reduce(reduceRows, all);
    expect(replayed.get('r1')).toEqual(all.get('r1'));
  });
});

describe('row filters and order', () => {
  const row = (over: Partial<LiveRow>): LiveRow => ({ ...(reduceRows(new Map(), begin(1)).get('r1') as LiveRow), ...over });

  it('matches the SQL filters', () => {
    expect(matchesRowFilters(row({ outcome: 'timedout' }), { outcome: 'failed' })).toBe(true);
    expect(matchesRowFilters(row({ outcome: 'passed' }), { outcome: 'failed' })).toBe(false);
    expect(matchesRowFilters(row({ title: 'Renders the page' }), { q: 'render' })).toBe(true);
    expect(matchesRowFilters(row({ file: 'a.spec.ts' }), { file: 'b.spec.ts' })).toBe(false);
    expect(matchesRowFilters(row({ errorSignature: 'x' }), { signature: 'x' })).toBe(true);
  });

  it('sorts problems first, then by file and title', () => {
    const rows = new Map([
      ['a', row({ id: 'a', outcome: 'passed', file: 'a.spec.ts' })],
      ['b', row({ id: 'b', outcome: 'failed', file: 'z.spec.ts' })],
      ['c', row({ id: 'c', outcome: 'running', file: 'b.spec.ts' })],
    ]);
    expect(visibleRows(rows, {}).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(compareRows(rows.get('a')!, rows.get('a')!)).toBe(0);
  });
});

describe('reduceSpecs', () => {
  it('adds a file on its first test and tallies outcomes and duration', () => {
    const specs = reduceSpecs([], begin(1));
    expect(specs).toEqual([{ file: 'home.spec.ts', total: 1, passed: 0, failed: 0, flaky: 0, skipped: 0, running: 1, durationMs: 0 }]);
    const done = reduceSpecs(specs, end(2, { outcome: 'interrupted', durationMs: 40 }));
    expect(done[0]).toMatchObject({ total: 1, running: 0, failed: 1, durationMs: 40 });
  });

  it('adds a retry attempt’s duration even when the outcome stays the same', () => {
    const specs = [{ file: 'home.spec.ts', total: 1, passed: 0, failed: 0, flaky: 0, skipped: 0, running: 1, durationMs: 100 }];
    expect(reduceSpecs(specs, end(2, { outcome: 'running', prevOutcome: 'running', durationMs: 50 }))[0].durationMs).toBe(150);
  });
});

describe('reduceErrorGroups', () => {
  it('opens a group for a new signature and grows it', () => {
    const one = reduceErrorGroups([], end(1, { outcome: 'failed', errorSignature: 's', errorMessage: 'boom' }));
    expect(one).toEqual([{ signature: 's', message: 'boom', count: 1, failed: 1, flaky: 0, files: ['home.spec.ts'], sampleResultId: 'r1' }]);
    const two = reduceErrorGroups(one, end(2, { resultId: 'r2', file: 'b.spec.ts', outcome: 'failed', errorSignature: 's' }));
    expect(two[0]).toMatchObject({ count: 2, failed: 2, files: ['home.spec.ts', 'b.spec.ts'] });
  });

  it('moves a failed result that turned flaky within its group', () => {
    const groups = [{ signature: 's', message: 'boom', count: 1, failed: 0, flaky: 0, files: ['home.spec.ts'], sampleResultId: 'r1' }];
    const next = reduceErrorGroups(groups, end(2, { prevOutcome: 'running', outcome: 'flaky', prevErrorSignature: 's', errorSignature: 's' }));
    expect(next[0]).toMatchObject({ count: 1, failed: 0, flaky: 1 });
  });

  it('drops a group whose last result moved to another signature', () => {
    const groups = [{ signature: 'old', message: 'a', count: 1, failed: 1, flaky: 0, files: ['home.spec.ts'], sampleResultId: 'r1' }];
    const next = reduceErrorGroups(groups, end(2, { prevOutcome: 'failed', outcome: 'failed', prevErrorSignature: 'old', errorSignature: 'new' }));
    expect(next.map((g) => g.signature)).toEqual(['new']);
  });
});

describe('reduceRunCounts', () => {
  it('updates only the run the event belongs to', () => {
    const runs = [
      { id: 'run-1', counts: zero },
      { id: 'run-2', counts: zero },
    ];
    const next = reduceRunCounts(runs, begin(1));
    expect(next[0].counts).toMatchObject({ total: 1, running: 1 });
    expect(next[1]).toBe(runs[1]);
  });

  it('skips an event the row’s own snapshot already reflects', () => {
    const runs = [{ id: 'run-1', counts: { ...zero, total: 1, running: 1 }, cursor: 5 }];
    expect(reduceRunCounts(runs, begin(4))).toBe(runs);
    expect(reduceRunCounts(runs, end(6))[0]).toMatchObject({ cursor: 6, counts: { running: 0, passed: 1 } });
  });
});

describe('runs list reducers', () => {
  const run = { id: 'run-1', number: 7, status: 'running', durationMs: null, counts: zero, cursor: 0, shardTotal: 2, shards: [{ shardIndex: 1, status: 'running' }] };
  const finished = (id: number, over = {}): LiveEvent => ({ id, type: 'run.finished', data: { status: 'failed', durationMs: 5000, ...over, ...meta } });

  it('finishes a table row from the event, duration included', () => {
    expect(reduceRunsTable([run], finished(3))[0]).toMatchObject({ status: 'failed', durationMs: 5000 });
    // A stale run's event has no duration; the row keeps what it had.
    expect(reduceRunsTable([run], finished(3, { status: 'incomplete', durationMs: undefined }))[0].durationMs).toBeNull();
  });

  it('puts a resumed stale run back to running', () => {
    const closed = reduceRunsTable([run], finished(3, { status: 'incomplete', reason: 'stale', durationMs: 60_000 }));
    expect(reduceRunsTable(closed, { id: 4, type: 'run.resumed', data: meta })[0]).toMatchObject({ status: 'running', durationMs: null });
    // Not on the page: nothing to do.
    expect(reduceRunsTable(closed, { id: 4, type: 'run.resumed', data: { ...meta, runId: 'other' } })).toBe(closed);
  });

  it('moves shard progress on an active card and drops it once the run finishes', () => {
    const second = reduceActiveRuns([run], { id: 2, type: 'shard.started', data: { shardIndex: 2, shardTotal: 2, expectedTests: 3, ...meta } });
    expect(second[0].shards.map((sh) => [sh.shardIndex, sh.status])).toEqual([[1, 'running'], [2, 'running']]);
    const done = reduceActiveRuns(second, { id: 3, type: 'shard.finished', data: { shardIndex: 1, status: 'passed', ...meta } });
    expect(done[0].shards[0].status).toBe('passed');
    expect(reduceActiveRuns(done, finished(4))).toEqual([]);
  });

  it('matches the SQL filters for a run that starts while the page is open', () => {
    const r = { number: 12, status: 'running', gitBranch: 'feature/x', prNumber: 7, environment: 'local', gitMessage: 'Add footer', gitShortSha: 'abc1234', startedAt: new Date() };
    expect(matchesRunFilters(r, {})).toBe(true);
    expect(matchesRunFilters(r, { status: 'failed' })).toBe(false);
    expect(matchesRunFilters(r, { branch: 'main' })).toBe(false);
    expect(matchesRunFilters(r, { prNumber: 7 })).toBe(true);
    expect(matchesRunFilters(r, { prNumber: 8 })).toBe(false);
    expect(matchesRunFilters({ ...r, prNumber: null }, { prNumber: 7 })).toBe(false);
    expect(matchesRunFilters(r, { q: '#12' })).toBe(true);
    expect(matchesRunFilters(r, { q: 'ABC' })).toBe(true);
    expect(matchesRunFilters({ ...r, startedAt: new Date(Date.now() - 9 * 86_400_000) }, { days: 7 })).toBe(false);
  });

  it('revives the dates a JSON endpoint sends as strings', () => {
    const at = '2026-09-24T10:00:00.000Z';
    expect(reviveDates({ startedAt: at, finishedAt: null, gitMessage: 'x' })).toEqual({ startedAt: new Date(at), finishedAt: null, gitMessage: 'x' });
  });
});
