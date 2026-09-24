import { describe, expect, it } from 'vitest';
import { verifyFix, type SinceExecution } from './fix-verification';

let n = 100;
const ex = (outcome: string, signature: string | null = null): SinceExecution => ({ runNumber: n, startedAt: new Date(2026, 0, 1, 0, n++), outcome, attempts: outcome === 'flaky' ? 2 : 1, signature });
const verify = (since: SinceExecution[], opts: { baselineOutcome?: string | null; requirePasses?: number } = {}) =>
  verifyFix({ baselineOutcome: 'baselineOutcome' in opts ? opts.baselineOutcome! : 'failed', baselineSignature: 'sig-a', since, requirePasses: opts.requirePasses });

describe('verifyFix', () => {
  it('rejects a baseline in which the test did not fail', () => {
    expect(verify([ex('passed')], { baselineOutcome: 'passed' }).status).toBe('baseline_invalid');
    expect(verify([ex('passed')], { baselineOutcome: null }).status).toBe('baseline_invalid');
  });

  it('waits for a run after the baseline', () => {
    expect(verify([]).status).toBe('no_runs_since');
    expect(verify([ex('skipped')]).status).toBe('no_runs_since');
  });

  it('tells the same failure from a different one', () => {
    expect(verify([ex('failed', 'sig-a')]).status).toBe('still_failing');
    expect(verify([ex('failed', 'sig-b')]).status).toBe('different_failure');
  });

  it('calls passing-with-retries unstable, not fixed', () => {
    expect(verify([ex('passed'), ex('flaky')]).status).toBe('unstable');
  });

  it('calls a pass, a failure and a pass intermittent', () => {
    expect(verify([ex('passed'), ex('failed', 'sig-a'), ex('passed')]).status).toBe('intermittent');
  });

  it('calls first-try passes fixed, with confidence growing per run', () => {
    expect(verify([ex('passed')])).toMatchObject({ status: 'fixed', confidence: 'low' });
    expect(verify([ex('passed'), ex('passed')])).toMatchObject({ status: 'fixed', confidence: 'medium' });
    expect(verify(Array.from({ length: 5 }, () => ex('passed')))).toMatchObject({ status: 'fixed', confidence: 'high' });
  });

  it('honours requirePasses', () => {
    expect(verify([ex('passed')], { requirePasses: 3 }).status).toBe('unstable');
  });
});
