/**
 * What the attempts of *one* execution say about a failure. Deterministic:
 * the same stored attempts always give the same verdict.
 *
 * An attempt's signature is its normalised first error message plus where it
 * failed (error location and failing step), so two timeouts on different
 * calls do not count as "the same failure".
 */
import { createHash } from 'node:crypto';
import type { Step, TestError } from '@miguelfranken/protocol';
import { normalizeErrorMessage } from '@/lib/metrics/error-signature';

export interface AttemptLike {
  retry: number;
  status: string;
  errors: TestError[];
  steps: Step[];
}

export type AttemptVerdict = 'deterministic' | 'flaky' | 'inconclusive';

export const FAILED_ATTEMPT = new Set(['failed', 'timedOut', 'interrupted']);

export function failingStepTitle(steps: Step[]): string | null {
  let found: Step | null = null;
  for (const step of steps) if (step.error && (!found || step.depth >= found.depth)) found = step;
  return found?.title ?? null;
}

export function attemptSignature(attempt: Pick<AttemptLike, 'errors' | 'steps' | 'status'>): string | null {
  if (!FAILED_ATTEMPT.has(attempt.status)) return null;
  const error = attempt.errors[0];
  const message = normalizeErrorMessage(error?.message ?? error?.value ?? attempt.status);
  const location = error?.location?.file ? `${error.location.file}:${error.location.line ?? 0}` : '';
  const step = failingStepTitle(attempt.steps) ?? '';
  return createHash('sha1').update(`${message}|${location}|${step}`).digest('hex').slice(0, 12);
}

export interface AttemptSummary {
  retry: number;
  status: string;
  signature: string | null;
}

export interface VerdictResult {
  verdict: AttemptVerdict | null;
  reason: string;
  attempts: AttemptSummary[];
}

export function attemptVerdict(attempts: AttemptLike[]): VerdictResult {
  const summaries = attempts.map((a) => ({ retry: a.retry, status: a.status, signature: attemptSignature(a) }));
  const failed = summaries.filter((a) => FAILED_ATTEMPT.has(a.status));
  const last = summaries.at(-1);
  if (failed.length === 0) return { verdict: null, reason: 'No attempt failed.', attempts: summaries };
  if (last && last.status === 'passed') {
    const first = failed[0];
    return { verdict: 'flaky', reason: `Failed on attempt ${first.retry + 1}, passed on attempt ${last.retry + 1} without a code change.`, attempts: summaries };
  }
  if (failed.length === 1) {
    return { verdict: 'inconclusive', reason: 'Only one attempt ran (no retries), so the attempts cannot tell flaky from broken. check_flakiness looks across runs.', attempts: summaries };
  }
  const signatures = new Set(failed.map((a) => a.signature));
  if (signatures.size === 1) {
    return { verdict: 'deterministic', reason: `Failed identically on all ${failed.length} attempts (same error, location and step).`, attempts: summaries };
  }
  return {
    verdict: 'inconclusive',
    reason: `Failed differently across ${failed.length} attempts (${signatures.size} distinct failures), which points at unstable state or environment rather than one bug.`,
    attempts: summaries,
  };
}
