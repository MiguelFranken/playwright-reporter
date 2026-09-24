/**
 * Flaky or broken, judged across runs. Two kinds of evidence count as proof of
 * flakiness: a retry that passed, and the same commit both passing and
 * failing. Everything short of proof is "intermittent", so a real regression
 * that was later fixed is not mislabelled as flaky.
 */
import { FLAKY_FLIP_RATE, FLAKY_MIN_RETRY_RUNS, VERDICT_MIN_EXECUTIONS } from '@/lib/metrics/score';

export type FlakinessVerdict = 'flaky' | 'consistently_failing' | 'intermittent' | 'stable' | 'insufficient_data';
export type Confidence = 'low' | 'medium' | 'high';

export interface Execution {
  outcome: string;
  startedAt: Date;
  signature: string | null;
}

export interface SameCommitConflict {
  sha: string;
  passed: number;
  failed: number;
  flaky: number;
  runNumbers: number[];
}

export interface FlakinessEvidence {
  executions: number;
  outcomes: { passed: number; failed: number; flaky: number; skipped: number };
  retryFlakyRuns: number;
  sameCommitConflicts: number;
  flipRate: number;
}

const isFail = (o: string) => o === 'failed' || o === 'timedout';

/** Pass↔fail transitions over consecutive executions (oldest first); flaky counts as a noisy pass and is skipped. */
export function flipRate(executions: Execution[]): number {
  const seq = [...executions]
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((e) => e.outcome)
    .filter((o) => o === 'passed' || isFail(o));
  if (seq.length < 2) return 0;
  let flips = 0;
  for (let i = 1; i < seq.length; i++) if (isFail(seq[i]) !== isFail(seq[i - 1])) flips++;
  return flips / (seq.length - 1);
}

export function flakinessVerdict(executions: Execution[], conflicts: SameCommitConflict[]) {
  const counted = executions.filter((e) => e.outcome !== 'skipped' && e.outcome !== 'running' && e.outcome !== 'interrupted');
  const outcomes = {
    passed: executions.filter((e) => e.outcome === 'passed').length,
    failed: executions.filter((e) => isFail(e.outcome)).length,
    flaky: executions.filter((e) => e.outcome === 'flaky').length,
    skipped: executions.filter((e) => e.outcome === 'skipped').length,
  };
  const evidence: FlakinessEvidence = {
    executions: counted.length,
    outcomes,
    retryFlakyRuns: outcomes.flaky,
    sameCommitConflicts: conflicts.length,
    flipRate: flipRate(counted),
  };
  const confidence: Confidence = counted.length >= 10 || conflicts.length >= 2 ? 'high' : counted.length >= 5 ? 'medium' : 'low';

  let verdict: FlakinessVerdict;
  let reason: string;
  const newest = [...counted].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  if (counted.length < VERDICT_MIN_EXECUTIONS) {
    verdict = 'insufficient_data';
    reason = `Only ${counted.length} execution(s) in the window; at least ${VERDICT_MIN_EXECUTIONS} are needed.`;
  } else if (outcomes.flaky >= FLAKY_MIN_RETRY_RUNS || conflicts.length >= 1 || (outcomes.flaky >= 1 && evidence.flipRate >= FLAKY_FLIP_RATE)) {
    verdict = 'flaky';
    const parts = [];
    if (outcomes.flaky) parts.push(`passed only on retry in ${outcomes.flaky} run(s)`);
    if (conflicts.length) parts.push(`both passed and failed on the same commit ${conflicts.length} time(s)`);
    if (!conflicts.length && outcomes.flaky < FLAKY_MIN_RETRY_RUNS) parts.push(`flips between pass and fail (${Math.round(evidence.flipRate * 100)}% of consecutive runs)`);
    reason = `Flaky: ${parts.join('; ')}.`;
  } else if (newest.length >= 3 && newest.slice(0, 3).every((e) => isFail(e.outcome)) && dominantShare(newest.filter((e) => isFail(e.outcome))) >= 0.8) {
    verdict = 'consistently_failing';
    const streak = newest.findIndex((e) => !isFail(e.outcome));
    reason = `Failed the last ${streak === -1 ? newest.length : streak} executions with the same error and never passed on retry: broken, not flaky.`;
  } else if (outcomes.failed === 0 && outcomes.flaky === 0) {
    verdict = 'stable';
    reason = `Passed all ${counted.length} executions.`;
  } else {
    verdict = 'intermittent';
    reason = `Failed ${outcomes.failed} of ${counted.length} executions without proof of flakiness (no retry passed, no same-commit conflict) — possibly a regression that was fixed, or an environment problem.`;
  }
  return { verdict, confidence, reason, evidence };
}

/** Share of the most common signature among failures. */
function dominantShare(failures: Execution[]): number {
  if (failures.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const f of failures) counts.set(f.signature ?? '?', (counts.get(f.signature ?? '?') ?? 0) + 1);
  return Math.max(...counts.values()) / failures.length;
}
