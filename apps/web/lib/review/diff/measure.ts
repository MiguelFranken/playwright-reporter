/**
 * Which driver measures comparisons, and measuring planned pairs without
 * touching a review: the part of dispatching that the comparison service and
 * the workflow steps may import. `dispatch.ts` adds what needs Next.js
 * request handling (`after()`), which a workflow step's bundle must not carry.
 */
import { start } from 'workflow/api';
import { measureDiff } from './store';
import { measurePairs } from './workflow/diff.workflow';

export type DiffDriver = 'workflow' | 'inline' | 'none';

/**
 * `IMAGE_DIFF_DRIVER`:
 * - `workflow`: the Workflow SDK — durable, retried steps.
 * - `inline`: in the same function, after the response (or awaited).
 * - `none`: nothing is measured; the viewer's comparisons work by eye.
 *
 * Vercel previews default to `none`: they share the production database.
 */
export function diffDriver(env: Record<string, string | undefined> = process.env): DiffDriver {
  const d = env.IMAGE_DIFF_DRIVER;
  if (d === 'workflow' || d === 'inline' || d === 'none') return d;
  if (env.VERCEL) return env.VERCEL_ENV === 'production' ? 'workflow' : 'none';
  return 'workflow';
}

export const diffsEnabled = () => diffDriver() !== 'none';

/**
 * Measures comparisons already planned *without* approving anything: what a
 * read (an agent asking for a comparison) may set off. A measurement is a
 * fact about two images; approving a run's noise is a review decision, and
 * the review paths (`dispatchRun`, `dispatchPairs`) are the ones that take it.
 */
export async function dispatchMeasurements(ids: readonly string[]) {
  if (ids.length === 0) return;
  const driver = diffDriver();
  if (driver === 'workflow') await start(measurePairs, [[...ids]]);
  else if (driver === 'inline') for (const id of ids) await measureDiff(id).catch(() => measureDiff(id));
}
