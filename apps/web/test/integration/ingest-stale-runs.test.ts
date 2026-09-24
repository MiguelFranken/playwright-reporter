/**
 * 8.3 — runs that stop reporting. `markStaleRuns` runs lazily from the read
 * paths, and the raw-SQL settlement derives an outcome for every result that is
 * still `running` when the run ends.
 */
import { asc, eq, sql } from 'drizzle-orm';
import { STALE_RUN_MS, markStaleRuns } from '@/lib/ingest/service';
import { getRunByNumber, listRuns } from '@/lib/db/queries/runs';
import { runEvents, runs, testResults } from '@/lib/db/schema';
import { playRun } from './factories';
import { describe, expect, test, type Db } from './fixtures';

/** Pushes the run's activity into the past, the way a crashed reporter would leave it. */
async function silentSince(db: Db, runId: string, minutes: number) {
  const at = new Date(Date.now() - minutes * 60_000);
  await db.update(runs).set({ lastEventAt: at, startedAt: at }).where(eq(runs.id, runId));
  return at;
}

describe('markStaleRuns', () => {
  test('marks a run that stopped reporting as incomplete and stamps finished_at', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const lastEventAt = await silentSince(db, runId, 11);

    await markStaleRuns(tenant.project.id);

    const [row] = await db.select().from(runs).where(eq(runs.id, runId));
    expect(row.status).toBe('incomplete');
    expect(row.finishedAt?.getTime()).toBe(lastEventAt.getTime());

    const events = await db.select().from(runEvents).where(eq(runEvents.type, 'run.finished'));
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ status: 'incomplete' });
  });

  test('leaves a run that reported recently alone', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, runId, 9);

    await markStaleRuns(tenant.project.id);

    const [row] = await db.select().from(runs).where(eq(runs.id, runId));
    expect(row.status).toBe('running');
    expect(row.finishedAt).toBeNull();
    expect(STALE_RUN_MS).toBe(10 * 60 * 1000);
  });

  test('does not touch runs of another project', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, runId, 30);

    await markStaleRuns('00000000-0000-4000-8000-000000000000');

    expect((await db.select().from(runs).where(eq(runs.id, runId)))[0].status).toBe('running');
  });

  test('is idempotent: a second pass emits no further event', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, runId, 20);

    await markStaleRuns(tenant.project.id);
    await markStaleRuns(tenant.project.id);

    expect(await db.select().from(runEvents).where(eq(runEvents.type, 'run.finished'))).toHaveLength(1);
  });
});

describe('settling the results of a stale run', () => {
  /** Builds one open run whose results have the given last attempts, then lets it go stale. */
  async function settleWith(db: Db, tenant: { tokenProject: Parameters<typeof playRun>[0]; project: { id: string } }) {
    const { runId } = await playRun(tenant.tokenProject, {
      finish: false,
      tests: [
        { outcome: 'passed', title: 'passed once', durationMs: 1000 },
        { outcome: 'flaky', title: 'passed after a retry', durationMs: 1000 },
        { outcome: 'timedout', title: 'timed out', durationMs: 1000 },
        { outcome: 'failed', title: 'failed', durationMs: 1000 },
        { outcome: 'skipped', title: 'skipped' },
        { outcome: 'running', title: 'never reported an attempt' },
      ],
    });
    // Re-open every result: this is the state a crashed run leaves behind.
    await db.update(testResults).set({ outcome: 'running', finishedAt: null }).where(eq(testResults.runId, runId));
    await silentSince(db, runId, 15);
    await markStaleRuns(tenant.project.id);
    return runId;
  }

  test('derives each outcome from the last recorded attempt', async ({ db, tenant }) => {
    const runId = await settleWith(db, tenant);

    const rows = await db.query.testResults.findMany({ where: eq(testResults.runId, runId), with: { test: true } });
    const byTitle = Object.fromEntries(rows.map((r) => [r.test.title, r.outcome]));
    expect(byTitle).toEqual({
      'passed once': 'passed',
      // attempt_count > 1 with a passing last attempt is a flake, not a pass.
      'passed after a retry': 'flaky',
      'timed out': 'timedout',
      failed: 'failed',
      skipped: 'skipped',
      // No attempt at all: the worker was cut off.
      'never reported an attempt': 'interrupted',
    });
  });

  test('derives finished_at from the last attempt via make_interval', async ({ db, tenant }) => {
    const runId = await settleWith(db, tenant);

    const rows = await db.query.testResults.findMany({
      where: eq(testResults.runId, runId),
      with: { test: true, attempts: true },
    });
    for (const row of rows) {
      const last = [...row.attempts].sort((a, b) => b.retry - a.retry)[0];
      if (!last) {
        expect(row.finishedAt).toBeNull();
        continue;
      }
      expect(row.finishedAt?.getTime()).toBe(last.startedAt.getTime() + last.durationMs);
    }
  });

  test('leaves nothing running behind', async ({ db, tenant }) => {
    const runId = await settleWith(db, tenant);
    const [{ n }] = Array.from(
      await db.execute<{ n: string }>(sql`select count(*) as n from test_results where run_id = ${runId} and outcome = 'running'`),
    );
    expect(Number(n)).toBe(0);
  });
});

describe('lazy settlement from the read paths', () => {
  test('listRuns marks a stale run on the way past', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, runId, 12);

    const { rows } = await listRuns(tenant.project.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('incomplete');
    expect(rows[0].counts).toMatchObject({ total: 1, running: 0, interrupted: 1 });
  });

  test('getRunByNumber marks a stale run on the way past', async ({ db, tenant }) => {
    const { runId, runNumber } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, runId, 12);

    const run = await getRunByNumber(tenant.project.id, runNumber);
    expect(run?.status).toBe('incomplete');
    expect(run?.shards).toHaveLength(1);
  });

  test('a fresh run survives a read untouched', async ({ tenant }) => {
    const { runNumber } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const run = await getRunByNumber(tenant.project.id, runNumber);
    expect(run?.status).toBe('running');
    expect(run?.counts.running).toBe(1);
  });
});

describe('settlement at the end of a normal run', () => {
  test('finishRun settles results the reporter never closed', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, {
      tests: [
        { outcome: 'passed', title: 'reported' },
        { outcome: 'running', title: 'left open' },
      ],
    });

    const rows = await db.query.testResults.findMany({ where: eq(testResults.runId, runId), with: { test: true } });
    const byTitle = Object.fromEntries(rows.map((r) => [r.test.title, r.outcome]));
    expect(byTitle).toEqual({ reported: 'passed', 'left open': 'interrupted' });

    // An interrupted result makes the run interrupted, even with a passing shard.
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    expect(run.status).toBe('interrupted');
  });

  test('run events stay in order across the whole lifecycle', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    const events = await db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.id));
    expect(events.map((e) => e.type)).toEqual([
      'run.started',
      'shard.started',
      'test.begin',
      'attempt.end',
      'shard.finished',
      'run.finished',
    ]);
  });
});
