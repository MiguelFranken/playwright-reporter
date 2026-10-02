/**
 * Who measures comparisons, `IMAGE_DIFF_DRIVER`:
 * - `workflow`: the Workflow SDK — on Vercel its managed runtime; self-hosted
 *   the Postgres world (`WORKFLOW_TARGET_WORLD`), locally the local world.
 *   Durable: a run's images are measured even when the request that asked
 *   is long gone, uploads still in flight are waited for, and each
 *   measurement is its own retried step.
 * - `inline`: in the same function, after the response (`after()`). For a
 *   deployment without a workflow runtime; a crash loses the work until the
 *   next time a page asks.
 * - `none`: nothing is measured; the viewer's comparisons work by eye.
 *
 * Vercel previews default to `none`: they share the production database, and
 * a tolerance approval written from a preview would be a real decision.
 */
import { after } from 'next/server';
import { start } from 'workflow/api';
import type { ComparedCapture } from '../queries';
import { approveWithinTolerance, measureDiff, needsPlanning, planCaptures, planRun, runCaptures } from './store';
import { proactiveAnalyses } from '../analysis/jobs';
import { diffDriver, diffsEnabled, dispatchMeasurements, type DiffDriver } from './measure';
import { diffPairs, diffRun } from './workflow/diff.workflow';

export { diffDriver, diffsEnabled, dispatchMeasurements, type DiffDriver };

async function inline(ids: readonly string[], runId: string) {
  for (const id of ids) {
    // One retry for a transient failure; `measureDiff` records the rest as failed.
    await measureDiff(id).catch(() => measureDiff(id));
  }
  await approveWithinTolerance(runId);
}

/** Measures a run: planned, measured and approved, by the configured driver. */
export async function dispatchRun(runId: string) {
  const driver = diffDriver();
  if (driver === 'workflow') await start(diffRun, [runId]);
  else if (driver === 'inline') {
    const plan = await planRun(runId);
    await inline(plan.ids, runId);
    await proactiveAnalyses(runId, await runCaptures(runId));
  }
}

/** Measures comparisons already planned. */
export async function dispatchPairs(ids: string[], runId: string) {
  if (ids.length === 0) return;
  const driver = diffDriver();
  if (driver === 'workflow') await start(diffPairs, [ids, runId]);
  else if (driver === 'inline') await inline(ids, runId);
}

function later(what: string, fn: () => Promise<unknown>) {
  after(async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[image-diff] ${what} failed`, err);
    }
  });
}

/** A run finished: measure its images once the reporter has its response. */
export function afterRunFinished(runId: string) {
  if (!diffsEnabled()) return;
  later('scheduling a finished run', () => dispatchRun(runId));
}

/**
 * A page showed a run's captures: plan and measure what nobody measured yet
 * (a run closed by the watchdog, a baseline approved since, a worker that
 * died), once the page is sent.
 */
export function afterCapturesShown(runId: string, captures: readonly ComparedCapture[]) {
  if (!diffsEnabled()) return;
  // A comparison an agent had measured (without approving) may be within the tolerance already.
  const due = captures.some((c) => c.status === 'changed' && c.withinTolerance && !c.decision);
  if (!needsPlanning(captures)) {
    if (due) later('approving shown captures', () => approveWithinTolerance(runId, captures));
    return;
  }
  later('planning shown captures', async () => {
    const plan = await planCaptures(captures);
    await dispatchPairs(plan.ids, runId);
  });
}

/** Plans one capture's comparison now and has it measured; answers whether anything was queued. */
export async function requestCaptureDiff(capture: ComparedCapture): Promise<boolean> {
  if (!diffsEnabled() || !needsPlanning([capture])) return false;
  const plan = await planCaptures([capture]);
  await dispatchPairs(plan.ids, capture.runId);
  return plan.ids.length > 0;
}
