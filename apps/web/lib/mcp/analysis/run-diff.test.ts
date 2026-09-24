import { describe, expect, it } from 'vitest';
import { bucketOf, diffRuns, isSlower, type DiffRow } from './run-diff';

const row = (baseOutcome: string | null, headOutcome: string | null, extra: Partial<DiffRow> = {}): DiffRow => ({
  testId: `${baseOutcome}-${headOutcome}`,
  title: 't',
  file: 'f',
  browser: 'chromium',
  baseOutcome,
  headOutcome,
  baseSignature: null,
  headSignature: null,
  baseMs: 1000,
  headMs: 1000,
  headResultId: null,
  headError: null,
  ...extra,
});

describe('bucketOf', () => {
  it.each([
    ['passed', 'failed', ['newFailure']],
    ['flaky', 'timedout', ['newFailure']],
    ['failed', 'passed', ['fixed']],
    ['failed', 'flaky', ['fixed']],
    ['passed', 'flaky', ['newFlaky']],
    ['failed', 'failed', ['stillFailing']],
    [null, 'failed', ['added', 'newFailure']],
    [null, 'passed', ['added']],
    ['passed', null, ['removed']],
    ['flaky', 'flaky', ['unchanged']],
    ['passed', 'passed', ['unchanged']],
  ])('%s → %s is %j', (b, h, expected) => {
    expect(bucketOf({ baseOutcome: b, headOutcome: h })).toEqual(expected);
  });
});

describe('isSlower', () => {
  it('needs both a 1.5× ratio and a second of difference, on passing runs', () => {
    expect(isSlower(row('passed', 'passed', { baseMs: 1000, headMs: 2500 }))).toBe(true);
    expect(isSlower(row('passed', 'passed', { baseMs: 100, headMs: 900 }))).toBe(false);
    expect(isSlower(row('passed', 'failed', { baseMs: 1000, headMs: 5000 }))).toBe(false);
  });
});

describe('diffRuns', () => {
  it('sorts rows into buckets', () => {
    const d = diffRuns([row('passed', 'failed'), row('failed', 'passed'), row('passed', 'passed', { baseMs: 1000, headMs: 4000 })]);
    expect(d.newFailure).toHaveLength(1);
    expect(d.fixed).toHaveLength(1);
    expect(d.slower).toHaveLength(1);
  });
});
