import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getRun, start } from 'workflow/api';
import { db } from '@/lib/db/drizzle';
import { runs } from '@/lib/db/schema';
import { runWatchdog } from './run-watchdog.workflow';
import type { RunWatchdog } from './types';

/** A claim that never got its watchdog started (the instance died) expires. */
const CLAIM_TTL = sql`interval '2 minutes'`;

/**
 * Guards runs with the `runWatchdog` workflow. The SDK has no idempotent
 * start, so a run's row decides who starts it: every shard start, heartbeat
 * and revive asks, and only the instance whose claim lands calls `start()`.
 */
export class WorkflowRunWatchdog implements RunWatchdog {
  readonly name = 'workflow' as const;

  async arm(runId: string) {
    const claimed = await db
      .update(runs)
      .set({ watchdogClaimedAt: sql`now()` })
      .where(
        and(
          eq(runs.id, runId),
          eq(runs.status, 'running'),
          isNull(runs.watchdogId),
          or(isNull(runs.watchdogClaimedAt), lt(runs.watchdogClaimedAt, sql`now() - ${CLAIM_TTL}`)),
        ),
      )
      .returning({ id: runs.id });
    if (!claimed.length) return;
    try {
      const run = await start(runWatchdog, [runId]);
      await db
        .update(runs)
        .set({ watchdogId: run.runId })
        .where(and(eq(runs.id, runId), isNull(runs.watchdogId)));
    } catch (err) {
      // Let the next heartbeat try again instead of waiting out the claim.
      await db
        .update(runs)
        .set({ watchdogClaimedAt: null })
        .where(and(eq(runs.id, runId), isNull(runs.watchdogId)));
      throw err;
    }
  }

  async disarm(watchdogId: string) {
    try {
      await getRun(watchdogId).cancel();
    } catch {
      // Already over: it closed the run, handed off, or was cancelled before.
    }
  }
}
