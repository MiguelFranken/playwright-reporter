import { describe, expect, it } from 'vitest';
import { rankFixFirst, type HealthCandidate } from './health-ranking';

const base: HealthCandidate = {
  testId: 't',
  title: 'test',
  file: 'a.spec.ts',
  browser: 'chromium',
  runs: 10,
  failed: 0,
  flaky: 0,
  failureRate: 0,
  streak: 0,
  lastOutcome: 'passed',
  lastRunAt: new Date('2026-09-20T00:00:00Z'),
  lastRunNumber: 10,
};

describe('rankFixFirst', () => {
  it('weighs failures fully and flakes half, and drops healthy tests', () => {
    const ranked = rankFixFirst([
      { ...base, testId: 'flaky', flaky: 4 },
      { ...base, testId: 'failing', failed: 3, failureRate: 0.3 },
      { ...base, testId: 'healthy' },
    ]);
    expect(ranked.map((r) => [r.testId, r.impact])).toEqual([
      ['failing', 3],
      ['flaky', 2],
    ]);
    expect(ranked[0].rank).toBe(1);
  });

  it('puts chronic tests first on a tie and explains why', () => {
    const ranked = rankFixFirst([
      { ...base, testId: 'plain', failed: 5, failureRate: 0.5 },
      { ...base, testId: 'chronic', failed: 5, failureRate: 0.5, streak: 5, lastOutcome: 'failed' },
    ]);
    expect(ranked[0].testId).toBe('chronic');
    expect(ranked[0].chronic).toBe(true);
    expect(ranked[0].reason).toBe('failed 5 of 10 runs, chronic: 5 failures in a row, still failing');
  });
});
