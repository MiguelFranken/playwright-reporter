/**
 * Evidence → which fixes it rules out and where it points. Every rule is one
 * row with a unit test. The output describes behaviour; it never claims to
 * know the cause.
 */
import type { AttemptVerdict } from './attempt-verdict';
import type { RegressionKind } from './regression-window';

export interface Evidence {
  attemptVerdict: AttemptVerdict | null;
  category: string | null;
  /** Outcomes of the same test in other browser projects of the same run. */
  siblingOutcomes: string[];
  /** Per environment over the window: [environment, failureRate]. */
  environments: { environment: string | null; failureRate: number; runs: number }[];
  regression: RegressionKind | null;
  /** The test's latest result on the base branch failed. */
  failingOnBase: boolean | null;
  onBaseBranch: boolean;
  /** Other tests in the run failing with the same signature. */
  sameErrorInRun: number;
  sameCommitConflicts: number;
}

export interface Finding {
  fix?: string;
  direction?: string;
  because: string;
}

const isFail = (o: string) => o === 'failed' || o === 'timedout';

export function ruledOut(e: Evidence): { ruledOut: Finding[]; pointsTo: Finding[] } {
  const out: Finding[] = [];
  const to: Finding[] = [];
  const waitCategories = new Set(['timeout', 'locator']);

  if (e.attemptVerdict === 'deterministic' && e.category && waitCategories.has(e.category)) {
    out.push({ fix: 'Longer timeouts, extra waits or more retries', because: 'every retry hit the same failure at the same place, so time was not the problem' });
    to.push({ direction: 'The element never appears or no longer matches: check the selector, the test data, or a product change in the regression window', because: `deterministic ${e.category} failure` });
  }
  if (e.attemptVerdict === 'deterministic' && (e.category === 'assertion' || e.category === 'snapshot')) {
    out.push({ fix: 'Timing fixes (waits, retries)', because: 'the observed value was the same on every attempt' });
    to.push({ direction: 'Changed product behaviour (see the regression window) or an outdated expectation or snapshot', because: `deterministic ${e.category} failure` });
  }
  if (e.attemptVerdict === 'flaky') {
    out.push({ fix: 'Changing the expected value', because: 'the same code passed on retry, so the expectation can be met' });
    to.push({ direction: 'A race: a missing web-first assertion, network or animation timing, or test isolation and shared data', because: 'it failed and then passed without a code change' });
  }
  if (e.attemptVerdict === 'inconclusive' && e.category !== null) {
    to.push({ direction: 'If attempts failed differently: unstable state or environment — check worker and test-order dependence', because: 'the attempts did not agree' });
  }
  if (e.siblingOutcomes.length > 0 && e.siblingOutcomes.every((o) => o === 'passed')) {
    out.push({ fix: 'A browser-independent logic bug', because: `the same test passed in the other browser project(s) of this run` });
    to.push({ direction: 'Browser-specific behaviour: engine differences, viewport, fonts, or timing', because: 'only this browser project failed' });
  }
  const failingEnvs = e.environments.filter((x) => x.runs >= 2 && x.failureRate > 0.5);
  const cleanEnvs = e.environments.filter((x) => x.runs >= 2 && x.failureRate === 0);
  if (failingEnvs.length === 1 && cleanEnvs.length >= 1) {
    out.push({ fix: 'A cause in the test code alone', because: `it fails in ${failingEnvs[0].environment ?? '(no environment)'} but passes in ${cleanEnvs.map((x) => x.environment ?? '(none)').join(', ')}` });
    to.push({ direction: `Configuration, data or deployment differences of ${failingEnvs[0].environment ?? 'that environment'}`, because: 'the failure is tied to one environment' });
  }
  if (!e.onBaseBranch && e.failingOnBase === false && e.regression !== 'not_failing') {
    out.push({ fix: 'Pre-existing breakage', because: 'the test passes on the base branch' });
    to.push({ direction: 'A change introduced on this branch — start with the compare link of the regression window', because: 'it fails here, not on the base branch' });
  }
  if (e.failingOnBase === true && !e.onBaseBranch) {
    to.push({ direction: 'The failure is not caused by this branch: it also fails on the base branch', because: 'the latest base-branch run failed too' });
  }
  if (e.sameErrorInRun >= 3) {
    out.push({ fix: 'A cause specific to this test', because: `${e.sameErrorInRun} other tests in the run fail with the same error` });
    to.push({ direction: 'A shared cause (fixture, beforeAll, backend outage, app-wide regression): fix the group once', because: 'one error signature spans several tests' });
  }
  if (e.sameCommitConflicts >= 1) {
    out.push({ fix: 'A code change as the cause of the pass/fail flips', because: 'the same commit both passed and failed' });
    to.push({ direction: 'Non-determinism in the test or the environment', because: 'identical code gave different results' });
  }
  return { ruledOut: out, pointsTo: to };
}

export { isFail };
