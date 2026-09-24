import { describe, expect, it } from 'vitest';
import { ruledOut, type Evidence } from './ruled-out';

const base: Evidence = {
  attemptVerdict: null,
  category: null,
  siblingOutcomes: [],
  environments: [],
  regression: null,
  failingOnBase: null,
  onBaseBranch: true,
  sameErrorInRun: 0,
  sameCommitConflicts: 0,
};
const fixes = (e: Partial<Evidence>) => ruledOut({ ...base, ...e }).ruledOut.map((f) => f.fix);

describe('ruledOut', () => {
  it('rules out waits for a deterministic timeout', () => {
    expect(fixes({ attemptVerdict: 'deterministic', category: 'timeout' })).toContain('Longer timeouts, extra waits or more retries');
  });

  it('rules out timing fixes for a deterministic assertion', () => {
    expect(fixes({ attemptVerdict: 'deterministic', category: 'assertion' })).toContain('Timing fixes (waits, retries)');
  });

  it('rules out changing the expectation for a flaky test', () => {
    expect(fixes({ attemptVerdict: 'flaky', category: 'assertion' })).toContain('Changing the expected value');
  });

  it('points at the browser when siblings passed', () => {
    expect(fixes({ siblingOutcomes: ['passed', 'passed'] })).toContain('A browser-independent logic bug');
  });

  it('points at one environment when only it fails', () => {
    const e = { environments: [{ environment: 'staging', failureRate: 1, runs: 4 }, { environment: 'prod', failureRate: 0, runs: 3 }] };
    expect(ruledOut({ ...base, ...e }).pointsTo[0].direction).toContain('staging');
  });

  it('blames the branch when the base branch passes', () => {
    expect(fixes({ onBaseBranch: false, failingOnBase: false, regression: 'regressed' })).toContain('Pre-existing breakage');
  });

  it('groups a shared error and a same-commit conflict', () => {
    expect(fixes({ sameErrorInRun: 4 })).toContain('A cause specific to this test');
    expect(fixes({ sameCommitConflicts: 1 })).toContain('A code change as the cause of the pass/fail flips');
  });

  it('says nothing without evidence', () => {
    expect(ruledOut(base)).toEqual({ ruledOut: [], pointsTo: [] });
  });
});
