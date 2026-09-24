/**
 * Did the fix hold? Strict on purpose: passing only after a retry is
 * "unstable", never "fixed", and a failure with a different error is reported
 * as such instead of as "still failing".
 */
export type FixStatus = 'fixed' | 'unstable' | 'intermittent' | 'still_failing' | 'different_failure' | 'no_runs_since' | 'baseline_invalid';

export interface SinceExecution {
  runNumber: number;
  startedAt: Date;
  outcome: string;
  attempts: number;
  signature: string | null;
}

const isFail = (o: string) => o === 'failed' || o === 'timedout';
const isPass = (e: SinceExecution) => e.outcome === 'passed';

export function verifyFix(input: {
  baselineOutcome: string | null;
  baselineSignature: string | null;
  since: SinceExecution[];
  requirePasses?: number;
}): { status: FixStatus; confidence: 'low' | 'medium' | 'high' | null; explanation: string } {
  const requirePasses = Math.max(1, input.requirePasses ?? 1);
  if (!input.baselineOutcome || !(isFail(input.baselineOutcome) || input.baselineOutcome === 'flaky')) {
    return { status: 'baseline_invalid', confidence: null, explanation: 'The test did not fail or flake in the baseline run, so there is nothing to verify against.' };
  }
  const since = [...input.since].filter((e) => e.outcome !== 'skipped' && e.outcome !== 'running').sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  if (since.length === 0) return { status: 'no_runs_since', confidence: null, explanation: 'The test has not run since the baseline. Verify again after the next run.' };

  const latest = since.at(-1)!;
  if (isFail(latest.outcome)) {
    if (input.baselineSignature && latest.signature && latest.signature !== input.baselineSignature) {
      return { status: 'different_failure', confidence: null, explanation: `Still failing in #${latest.runNumber}, but with a different error than the baseline: the original problem may be fixed and a new one exposed.` };
    }
    return { status: 'still_failing', confidence: null, explanation: `Still failing in #${latest.runNumber} with the same error as the baseline.` };
  }
  const firstPass = since.findIndex((e) => e.outcome === 'passed' || e.outcome === 'flaky');
  if (since.slice(firstPass + 1).some((e) => isFail(e.outcome))) {
    return { status: 'intermittent', confidence: null, explanation: 'It passed after the baseline, then failed again, and passes now: the fix did not hold every time.' };
  }
  if (since.some((e) => e.outcome === 'flaky')) {
    return { status: 'unstable', confidence: null, explanation: 'It no longer fails outright, but it needed retries to pass: that is not fixed.' };
  }
  const streak = [...since].reverse().findIndex((e) => !isPass(e));
  const firstTry = (streak === -1 ? since.length : streak);
  if (firstTry < requirePasses) {
    return { status: 'unstable', confidence: null, explanation: `Only ${firstTry} first-try pass(es) since the baseline; ${requirePasses} required.` };
  }
  const confidence = firstTry >= 5 ? 'high' : firstTry >= 2 ? 'medium' : 'low';
  return {
    status: 'fixed',
    confidence,
    explanation: `Passed on the first attempt in all ${firstTry} run(s) since the baseline.${confidence === 'low' ? ' One run is thin evidence; check again after more runs.' : ''}`,
  };
}
