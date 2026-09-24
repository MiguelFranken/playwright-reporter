import { getWorkflowMetadata, sleep } from 'workflow';
import { checkRun, releaseRun } from './run-watchdog.steps';

/**
 * Each wake-up replays the workflow's event log, so a watchdog keeps it short
 * and hands off to a fresh one after this many checks (about four hours at the
 * default five-minute timeout).
 */
export const MAX_CHECKS = 50;

/**
 * Guards one running run: sleeps until the run would turn stale, then checks.
 * Activity in between moves the deadline, so the check sleeps again; silence
 * closes the run. Ingest never wakes the watchdog — it only moves
 * `last_event_at` — so a busy run costs no more than a quiet one.
 *
 * Its id derives from this file's path and the function name: renaming either
 * breaks watchdogs already in flight.
 */
export async function runWatchdog(runId: string) {
  'use workflow';
  for (let i = 0; i < MAX_CHECKS; i++) {
    const check = await checkRun(runId);
    if (check.done) return { runId, outcome: check.outcome };
    await sleep(new Date(check.deadline));
  }
  await releaseRun(runId, getWorkflowMetadata().workflowRunId);
  return { runId, outcome: 'handed-off' as const };
}
