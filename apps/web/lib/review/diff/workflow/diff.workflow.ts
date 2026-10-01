import { sleep } from 'workflow';
import { analyzeRun, approveRun, measure, planRunDiffs } from './diff.steps';

/** Comparisons measured at once: each holds about three decoded images in memory. */
export const BATCH = 6;
/** How often a run is planned again while its images still upload (one minute apart). */
export const MAX_ROUNDS = 10;

async function measureAll(ids: readonly string[]) {
  let measured = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const outcomes = await Promise.all(ids.slice(i, i + BATCH).map((id) => measure(id)));
    measured += outcomes.filter((o) => o !== 'busy' && o !== 'gone').length;
  }
  return measured;
}

/**
 * Measures a finished run's changed images against their references, then
 * approves the changes within the project's tolerance. Images still
 * uploading are waited for, a minute at a time.
 *
 * Its id derives from this file's path and the function name: renaming
 * either breaks runs already in flight.
 */
export async function diffRun(runId: string) {
  'use workflow';
  let measured = 0;
  let approved = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const plan = await planRunDiffs(runId);
    measured += await measureAll(plan.ids);
    approved += await approveRun(runId);
    if (plan.waiting === 0) break;
    await sleep('1m');
  }
  const analyses = await analyzeRun(runId);
  return { runId, measured, approved, analyses: analyses.created };
}

/** Measures comparisons already planned (a reviewer opened an image nobody measured yet). */
export async function diffPairs(diffIds: string[], runId: string) {
  'use workflow';
  const measured = await measureAll(diffIds);
  const approved = await approveRun(runId);
  return { runId, measured, approved };
}

/**
 * Measures comparisons already planned and approves nothing: an agent asked
 * to see a pair of images (`get_visual_diff`). The run's review approves its
 * noise when the run is shown or finishes, as it does today.
 */
export async function measurePairs(diffIds: string[]) {
  'use workflow';
  const measured = await measureAll(diffIds);
  return { measured };
}
