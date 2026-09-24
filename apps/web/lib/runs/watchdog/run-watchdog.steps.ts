import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { runs } from '@/lib/db/schema';
import { notifyRun } from '@/lib/push/notify';
import { checkStaleRun } from '@/lib/runs/lifecycle';

// Steps of `runWatchdog`. Their ids derive from this file's path and the
// function names: renaming either breaks watchdogs already in flight.

/** Waking this long after the deadline absorbs clock drift between instances. */
const DEADLINE_SLACK_MS = 1000;

export type WatchdogCheck = { done: true; outcome: 'gone' | 'ended' | 'closed' } | { done: false; deadline: string };

/** Closes the run if it went stale; otherwise says when to look again. */
export async function checkRun(runId: string): Promise<WatchdogCheck> {
  'use step';
  const check = await checkStaleRun(runId);
  // Only the check that closed the run announces it; a retry finds it `ended`.
  if (check.state === 'closed') await notifyRun(runId, 'finished');
  if (check.state !== 'running') return { done: true, outcome: check.state };
  return { done: false, deadline: new Date(check.deadline.getTime() + DEADLINE_SLACK_MS).toISOString() };
}

/** Frees the run for a fresh watchdog, which its next heartbeat starts. */
export async function releaseRun(runId: string, watchdogId: string) {
  'use step';
  await db
    .update(runs)
    .set({ watchdogId: null, watchdogClaimedAt: null })
    .where(and(eq(runs.id, runId), eq(runs.watchdogId, watchdogId)));
}
