/**
 * When a run ends: at its last shard's reported finish, on the reporter's
 * clock like its start, clamped into [start, now]. This is what lets the demo
 * backfill replay a run on an earlier day and keep its real duration.
 */
import { eq } from 'drizzle-orm';
import { finishRun, runFinishedAt, startRun } from '@/lib/ingest/service';
import { runEvents, runs } from '@/lib/db/schema';
import { runFinish, runStart } from './factories';
import { describe, expect, test } from './fixtures';

const DAY = 24 * 60 * 60 * 1000;

async function runRow(db: typeof import('@/lib/db/drizzle').db, runId: string) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  return run;
}

describe('finishRun', () => {
  test('ends a run replayed on an earlier day on that day, with its own duration', async ({ db, tenant }) => {
    const startedAt = new Date(Date.now() - 20 * DAY);
    const finishedAt = new Date(startedAt.getTime() + 95_000);
    const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));

    await finishRun(tenant.tokenProject, await runRow(db, started.runId), runFinish({ finishedAt: finishedAt.toISOString() }));

    const run = await runRow(db, started.runId);
    expect(run.finishedAt?.toISOString()).toBe(finishedAt.toISOString());
    expect(run.durationMs).toBe(95_000);
    // lastEventAt follows, so the run never reads as stale.
    expect(run.lastEventAt.toISOString()).toBe(finishedAt.toISOString());
    const [event] = await db.select().from(runEvents).where(eq(runEvents.type, 'run.finished'));
    expect(event.payload).toMatchObject({ durationMs: 95_000, finishedAt: finishedAt.toISOString() });
  });

  test('a sharded run ends with its last shard', async ({ db, tenant }) => {
    const startedAt = new Date(Date.now() - 2 * DAY);
    const body = { ciRunId: 'sharded', startedAt: startedAt.toISOString() };
    const one = await startRun(tenant.tokenProject, runStart({ ...body, shard: { current: 1, total: 2 } }));
    const two = await startRun(tenant.tokenProject, runStart({ ...body, shard: { current: 2, total: 2 } }));

    const late = new Date(startedAt.getTime() + 120_000);
    await finishRun(tenant.tokenProject, await runRow(db, one.runId), runFinish({ shardIndex: two.shardIndex, finishedAt: late.toISOString() }));
    await finishRun(
      tenant.tokenProject,
      await runRow(db, one.runId),
      runFinish({ shardIndex: one.shardIndex, finishedAt: new Date(startedAt.getTime() + 60_000).toISOString() }),
    );

    const run = await runRow(db, one.runId);
    expect(run.status).toBe('passed');
    expect(run.finishedAt?.toISOString()).toBe(late.toISOString());
    expect(run.durationMs).toBe(120_000);
  });

  test('a reporter clock ahead of the server cannot end a run in the future', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart({ startedAt: new Date(Date.now() - 1000).toISOString() }));
    const before = Date.now();

    await finishRun(
      tenant.tokenProject,
      await runRow(db, started.runId),
      runFinish({ finishedAt: new Date(Date.now() + DAY).toISOString() }),
    );

    const run = await runRow(db, started.runId);
    expect(run.finishedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(run.finishedAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('runFinishedAt', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const run = { startedAt: new Date('2026-09-24T11:00:00Z') };

  test('is the latest shard finish', () => {
    const shards = [{ finishedAt: new Date('2026-09-24T11:10:00Z') }, { finishedAt: new Date('2026-09-24T11:20:00Z') }];
    expect(runFinishedAt(run, shards, now).toISOString()).toBe('2026-09-24T11:20:00.000Z');
  });

  test('never before the start, never after now', () => {
    expect(runFinishedAt(run, [{ finishedAt: new Date('2026-09-24T10:00:00Z') }], now)).toEqual(run.startedAt);
    expect(runFinishedAt(run, [{ finishedAt: new Date('2026-09-25T00:00:00Z') }], now)).toEqual(now);
  });

  test('a shard without a finish counts as finishing now', () => {
    expect(runFinishedAt(run, [{ finishedAt: new Date('2026-09-24T11:10:00Z') }, { finishedAt: null }], now)).toEqual(now);
  });
});
