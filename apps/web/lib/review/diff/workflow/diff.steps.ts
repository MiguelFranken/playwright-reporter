import { approveWithinTolerance, measureDiff, planRun, runCaptures } from '../store';
import { proactiveAnalyses } from '../../analysis/jobs';

// Steps of `diffRun` and `diffPairs`. Their ids derive from this file's path
// and the function names: renaming either breaks workflows already in flight.
// Each returns a few numbers, never image bytes: the workflow's event log
// keeps every step's result.

/** The run's pending comparisons, and how many wait for an upload. */
export async function planRunDiffs(runId: string) {
  'use step';
  return planRun(runId);
}

/** Measures one comparison; a failure is retried by the runtime, then recorded as failed. */
export async function measure(diffId: string) {
  'use step';
  return measureDiff(diffId);
}

/** Approves the run's changes that the project's tolerance calls noise. */
export async function approveRun(runId: string) {
  'use step';
  return approveWithinTolerance(runId);
}

/** With the project in proactive mode: one AI analysis per changed screen, within the budget. */
export async function analyzeRun(runId: string) {
  'use step';
  return proactiveAnalyses(runId, await runCaptures(runId));
}
