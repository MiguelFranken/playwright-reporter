import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { runEvents, runShards, runs, testAttempts, testResults, type Run } from '@/lib/db/schema';
import type { RunFinishedPayload, ShardFinishedPayload } from '@/lib/live/events';
import { isStale, staleDeadline } from './staleness';

/**
 * The run state changes shared by ingest and the watchdog. Kept apart from
 * `lib/ingest/service` so the watchdog's step bundle stays small: it needs
 * the database, not the storage adapters or the event fold.
 *
 * Every writer of a run's `run_events` holds that run's row lock first, so
 * its event ids commit in order (see `ingestEvents`).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Every `duration_ms` column is a Postgres `integer`. Durations are derived
 * from timestamps a reporter supplies, so a skewed clock or a run that stayed
 * open for weeks would otherwise overflow the column and turn an ingest call
 * into a 500. Clamping keeps the value monotone and the request successful.
 */
export const MAX_DURATION_MS = 2_147_483_647;

export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.min(MAX_DURATION_MS, Math.max(0, Math.round(ms)));
}

/**
 * Results still marked `running` when a run ends: derive the outcome from the last recorded
 * attempt (Playwright sometimes skips retries, e.g. for a missing screenshot baseline); results
 * without any attempt were cut off and become `interrupted`.
 */
export async function settleOpenResults(tx: Tx | typeof db, runId: string) {
  await tx.execute(sql`
    update ${testResults} tr
    set outcome = (case la.status
        when 'passed' then (case when tr.attempt_count > 1 then 'flaky' else 'passed' end)
        when 'timedOut' then 'timedout'
        when 'skipped' then 'skipped'
        when 'interrupted' then 'interrupted'
        else 'failed' end)::test_outcome,
      finished_at = coalesce(tr.finished_at, la.started_at + make_interval(secs => la.duration_ms / 1000.0))
    from (select distinct on (test_result_id) test_result_id, status, started_at, duration_ms
          from ${testAttempts} order by test_result_id, retry desc) la
    where la.test_result_id = tr.id and tr.run_id = ${runId} and tr.outcome = 'running'`);
  await tx
    .update(testResults)
    .set({ outcome: 'interrupted' })
    .where(and(eq(testResults.runId, runId), eq(testResults.outcome, 'running')));
}

// ---------------------------------------------------------------- staleness

export type StaleCheck =
  | { state: 'gone' }
  | { state: 'ended'; status: Run['status'] }
  | { state: 'closed' }
  | { state: 'running'; deadline: Date };

/**
 * The watchdog's one question about a run: has it ended, gone stale (then it
 * is closed here), or when should it be asked again? Safe to repeat.
 */
export async function checkStaleRun(runId: string, now: Date = new Date()): Promise<StaleCheck> {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(runs).where(eq(runs.id, runId)).for('update');
    if (!run) return { state: 'gone' };
    if (run.status !== 'running') return { state: 'ended', status: run.status };
    if (!isStale(run, now)) return { state: 'running', deadline: staleDeadline(run) };
    await closeStaleRun(tx, run);
    return { state: 'closed' };
  });
}

/**
 * Records a silent run as `incomplete`: it ended when it was last heard from.
 * Open shards end with it, and open results settle as at a normal finish.
 */
async function closeStaleRun(tx: Tx, run: Run) {
  const finishedAt = run.lastEventAt;
  const durationMs = clampDuration(finishedAt.getTime() - run.startedAt.getTime());
  await tx
    .update(runs)
    .set({ status: 'incomplete', endReason: 'stale', finishedAt, durationMs, watchdogId: null, watchdogClaimedAt: null })
    .where(eq(runs.id, run.id));
  const shards = await tx
    .update(runShards)
    .set({ status: 'incomplete', finishedAt })
    .where(and(eq(runShards.runId, run.id), eq(runShards.status, 'running')))
    .returning({ shardIndex: runShards.shardIndex });
  await settleOpenResults(tx, run.id);
  const finished: RunFinishedPayload = { status: 'incomplete', reason: 'stale', durationMs, finishedAt: finishedAt.toISOString() };
  await tx.insert(runEvents).values([
    ...shards
      .sort((a, b) => a.shardIndex - b.shardIndex)
      .map((s) => {
        const payload: ShardFinishedPayload = { shardIndex: s.shardIndex, status: 'incomplete' };
        return { runId: run.id, projectId: run.projectId, type: 'shard.finished', payload: { ...payload } };
      }),
    { runId: run.id, projectId: run.projectId, type: 'run.finished', payload: { ...finished } },
  ]);
}

/**
 * Back to `running`: a run closed as stale heard from its reporter again.
 * The caller holds the run's row lock. The watchdog fields are cleared so the
 * run can be armed again.
 */
export async function reviveRun(tx: Tx, run: Pick<Run, 'id' | 'projectId'>): Promise<boolean> {
  const revived = await tx
    .update(runs)
    .set({
      status: 'running',
      finishedAt: null,
      durationMs: null,
      endReason: null,
      watchdogId: null,
      watchdogClaimedAt: null,
      lastEventAt: new Date(),
    })
    .where(and(eq(runs.id, run.id), eq(runs.status, 'incomplete')))
    .returning({ id: runs.id });
  if (!revived.length) return false;
  await tx
    .update(runShards)
    .set({ status: 'running', finishedAt: null })
    .where(and(eq(runShards.runId, run.id), eq(runShards.status, 'incomplete')));
  await tx.insert(runEvents).values({ runId: run.id, projectId: run.projectId, type: 'run.resumed', payload: {} });
  return true;
}
