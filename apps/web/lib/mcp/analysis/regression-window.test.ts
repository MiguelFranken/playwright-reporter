import { describe, expect, it } from 'vitest';
import { regressionWindow, type HistoryPoint } from './regression-window';

const point = (i: number, outcome: string): HistoryPoint => ({
  resultId: `r${i}`,
  runNumber: i,
  startedAt: new Date(2026, 0, i),
  outcome,
  sha: `sha${i}`,
  shortSha: `s${i}`,
  author: 'Dev',
  message: `commit ${i}`,
});
/** Newest first, like the history query returns it. */
const history = (...outcomes: string[]) => outcomes.map((o, i) => point(outcomes.length - i, o));

describe('regressionWindow', () => {
  it('finds the last pass and the first failure of the current streak', () => {
    const w = regressionWindow(history('failed', 'timedout', 'skipped', 'failed', 'passed', 'failed'), 'r6', new Date(2020, 0, 1));
    expect(w.kind).toBe('regressed');
    expect(w.firstFail?.runNumber).toBe(3);
    expect(w.lastPass?.runNumber).toBe(2);
    expect(w.failingRuns).toBe(3);
  });

  it('starts at the target, not at the newest execution', () => {
    const w = regressionWindow(history('passed', 'failed', 'passed'), 'r2', new Date(2020, 0, 1));
    expect(w).toMatchObject({ kind: 'regressed', failingRuns: 1 });
    expect(w.lastPass?.runNumber).toBe(1);
  });

  it('treats a flaky pass as the last good run', () => {
    expect(regressionWindow(history('failed', 'flaky'), 'r2', new Date(2020, 0, 1)).lastPass?.runNumber).toBe(1);
  });

  it('tells a new test from one that never passed in the window', () => {
    const h = history('failed', 'failed');
    expect(regressionWindow(h, 'r2', new Date(2026, 0, 1)).kind).toBe('new_test');
    expect(regressionWindow(h, 'r2', new Date(2020, 0, 1)).kind).toBe('never_passed');
  });

  it('reports a passing target as not failing', () => {
    expect(regressionWindow(history('passed'), 'r1', new Date()).kind).toBe('not_failing');
  });
});
