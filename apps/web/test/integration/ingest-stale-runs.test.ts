/**
 * 8.3 — runs that stop reporting. Reads derive a stale run's status without
 * writing; the watchdog's step (`checkStaleRun`) records it, settling every
 * result still `running`; and a run closed as stale revives when its reporter
 * turns out to be alive.
 */
import { asc, eq, sql } from 'drizzle-orm';
import { finishRun, getRunForProject, heartbeat, ingestEvents, startRun } from '@/lib/ingest/service';
import { getRunByNumber, getRunSummary, listActiveRuns, listRunItems, listRuns } from '@/lib/db/queries/runs';
import { projects, runEvents, runShards, runs, testResults } from '@/lib/db/schema';
import { DEFAULT_STALE_TIMEOUT_MS } from '@/lib/runs/config';
import { checkStaleRun } from '@/lib/runs/lifecycle';
import { attemptEnd, eventBatch, playRun, runFinish, runStart, testBegin } from './factories';
import { describe, expect, test, type Db } from './fixtures';

/** Pushes the run's activity into the past, the way a crashed reporter would leave it. */
async function silentSince(db: Db, runId: string, minutes: number) {
  const at = new Date(Date.now() - minutes * 60_000);
  await db.update(runs).set({ lastEventAt: at, startedAt: new Date(at.getTime() - 60_000) }).where(eq(runs.id, runId));
  return at;
}

const runRow = async (db: Db, runId: string) => (await db.select().from(runs).where(eq(runs.id, runId)))[0];
const eventTypes = async (db: Db, runId: string) =>
  (await db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.id))).map((e) => e.type);

describe('the stale timeout', () => {
  test('a run takes the default when it starts', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    expect((await runRow(db, runId)).staleAfterMs).toBe(DEFAULT_STALE_TIMEOUT_MS);
  });

  test("a project's settings override it", async ({ db, tenant }) => {
    await db.update(projects).set({ settings: { staleTimeoutMs: 120_000 } }).where(eq(projects.id, tenant.project.id));
    const project = { ...tenant.tokenProject, settings: { staleTimeoutMs: 120_000 } };
    const { runId } = await playRun(project, { tests: [{ outcome: 'running' }], finish: false });
    expect((await runRow(db, runId)).staleAfterMs).toBe(120_000);
  });
});

describe('checkStaleRun', () => {
  test('closes a run that stopped reporting: incomplete, stale, ended when last heard from', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const lastEventAt = await silentSince(db, runId, 6);

    expect(await checkStaleRun(runId)).toEqual({ state: 'closed' });

    const row = await runRow(db, runId);
    expect(row.status).toBe('incomplete');
    expect(row.endReason).toBe('stale');
    expect(row.finishedAt?.getTime()).toBe(lastEventAt.getTime());
    expect(row.durationMs).toBe(60_000);
    const [shard] = await db.select().from(runShards).where(eq(runShards.runId, runId));
    expect(shard.status).toBe('incomplete');

    const events = await db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.id));
    expect(events.slice(-2).map((e) => [e.type, e.payload])).toEqual([
      ['shard.finished', { shardIndex: 1, status: 'incomplete' }],
      ['run.finished', { status: 'incomplete', reason: 'stale', durationMs: 60_000, finishedAt: lastEventAt.toISOString() }],
    ]);
  });

  test('says when to look again at a run still within its timeout', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const lastEventAt = await silentSince(db, runId, 4);

    const check = await checkStaleRun(runId);
    expect(check).toEqual({ state: 'running', deadline: new Date(lastEventAt.getTime() + DEFAULT_STALE_TIMEOUT_MS) });
    expect((await runRow(db, runId)).status).toBe('running');
  });

  test("honours the run's own timeout", async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await db.update(runs).set({ staleAfterMs: 60_000 }).where(eq(runs.id, runId));
    await silentSince(db, runId, 2);

    expect(await checkStaleRun(runId)).toEqual({ state: 'closed' });
  });

  test('is idempotent: a second check finds the run ended and emits nothing', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, runId, 20);

    await checkStaleRun(runId);
    expect(await checkStaleRun(runId)).toEqual({ state: 'ended', status: 'incomplete' });
    expect(await db.select().from(runEvents).where(eq(runEvents.type, 'run.finished'))).toHaveLength(1);
  });

  test('leaves a finished run alone', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    await silentSince(db, runId, 30);
    expect(await checkStaleRun(runId)).toEqual({ state: 'ended', status: 'passed' });
  });

  test('reports a run that no longer exists', async () => {
    expect(await checkStaleRun('00000000-0000-4000-8000-000000000000')).toEqual({ state: 'gone' });
  });
});

describe('settling the results of a stale run', () => {
  /** Builds one open run whose results have the given last attempts, then lets it go stale. */
  async function settleWith(db: Db, tenant: { tokenProject: Parameters<typeof playRun>[0] }) {
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
    await checkStaleRun(runId);
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

describe('reads derive the status without writing it', () => {
  test('a stale run reads as incomplete, ended when last heard from, on every run query', async ({ db, tenant }) => {
    const { runId, runNumber } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const lastEventAt = await silentSince(db, runId, 12);

    const { rows } = await listRuns(tenant.project.id);
    expect(rows[0]).toMatchObject({ status: 'incomplete', durationMs: 60_000 });
    expect(rows[0].finishedAt?.getTime()).toBe(lastEventAt.getTime());
    expect((await getRunByNumber(tenant.project.id, runNumber))?.status).toBe('incomplete');
    expect((await getRunSummary(tenant.project.id, runId))?.status).toBe('incomplete');
    expect((await listRunItems(tenant.project.id, [runId]))[0].status).toBe('incomplete');
    expect(await listActiveRuns(tenant.project.id)).toEqual([]);

    // Nothing was written: that is the watchdog's job.
    const row = await runRow(db, runId);
    expect(row.status).toBe('running');
    expect(await eventTypes(db, runId)).not.toContain('run.finished');
  });

  test('the status filter goes by the effective status', async ({ db, tenant }) => {
    const stale = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, stale.runId, 12);
    const live = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });

    expect((await listRuns(tenant.project.id, { status: 'incomplete' })).rows.map((r) => r.id)).toEqual([stale.runId]);
    expect((await listRuns(tenant.project.id, { status: 'running' })).rows.map((r) => r.id)).toEqual([live.runId]);
    expect((await listActiveRuns(tenant.project.id)).map((r) => r.id)).toEqual([live.runId]);
  });

  test('a run within its timeout reads as running', async ({ db, tenant }) => {
    const { runId, runNumber } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, runId, 4);
    const run = await getRunByNumber(tenant.project.id, runNumber);
    expect(run?.status).toBe('running');
    expect(run?.finishedAt).toBeNull();
    expect(run?.counts.running).toBe(1);
  });
});

describe('a run closed as stale revives when its reporter is alive', () => {
  async function closedRun(db: Db, tenant: { tokenProject: Parameters<typeof playRun>[0] }, shards = 1) {
    const ciRunId = `ci-${crypto.randomUUID().slice(0, 8)}`;
    const started = await startRun(
      tenant.tokenProject,
      runStart({ ciRunId, expectedTests: 1, shard: shards > 1 ? { current: 1, total: shards } : null }),
    );
    await silentSince(db, started.runId, 10);
    await checkStaleRun(started.runId);
    return { ...started, ciRunId, run: await getRunForProject(tenant.tokenProject, started.runId) };
  }

  async function expectRevived(db: Db, runId: string) {
    const row = await runRow(db, runId);
    expect(row).toMatchObject({ status: 'running', endReason: null, finishedAt: null, durationMs: null, watchdogId: null });
    expect(Date.now() - row.lastEventAt.getTime()).toBeLessThan(10_000);
    expect(await eventTypes(db, runId)).toContain('run.resumed');
  }

  test('on an event batch — and asks for a watchdog', async ({ db, tenant }) => {
    const { runId, run } = await closedRun(db, tenant);
    const res = await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0 })]));
    await expectRevived(db, runId);
    expect(res.watchdog).toEqual({ arm: runId });
    const [shard] = await db.select().from(runShards).where(eq(runShards.runId, runId));
    expect(shard.status).toBe('running');
  });

  test('on a heartbeat', async ({ db, tenant }) => {
    const { runId, run } = await closedRun(db, tenant);
    const res = await heartbeat(tenant.tokenProject, run, { shardIndex: 1 });
    expect(res).toEqual({ runStatus: 'running', watchdog: { arm: runId } });
    await expectRevived(db, runId);
  });

  test('on another shard starting', async ({ db, tenant }) => {
    const { runId, ciRunId } = await closedRun(db, tenant, 2);
    await startRun(tenant.tokenProject, runStart({ ciRunId, expectedTests: 1, shard: { current: 2, total: 2 } }));
    await expectRevived(db, runId);
  });

  test('on one of several shards finishing', async ({ db, tenant }) => {
    const { runId, run } = await closedRun(db, tenant, 2);
    const res = await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 1 }));
    expect(res.runStatus).toBe('running');
    await expectRevived(db, runId);
  });

  test('its last shard finishing records the real result', async ({ db, tenant }) => {
    const { runId, run } = await closedRun(db, tenant);
    await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0 }), attemptEnd({ seq: 1 })]));
    const res = await finishRun(tenant.tokenProject, run, runFinish());
    expect(res.runStatus).toBe('passed');
    expect(await runRow(db, runId)).toMatchObject({ status: 'passed', endReason: 'reporter' });
  });
});

describe('heartbeat', () => {
  test('keeps a quiet run alive without writing a run event', async ({ db, tenant }) => {
    const { runId, run } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await silentSince(db, runId, 4);
    const before = await eventTypes(db, runId);

    await heartbeat(tenant.tokenProject, run, { shardIndex: 1 });

    expect(Date.now() - (await runRow(db, runId)).lastEventAt.getTime()).toBeLessThan(10_000);
    expect(await eventTypes(db, runId)).toEqual(before);
    expect((await checkStaleRun(runId)).state).toBe('running');
  });

  test('asks for a watchdog only while the run has none', async ({ db, tenant }) => {
    const { runId, run } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    expect((await heartbeat(tenant.tokenProject, run, { shardIndex: 1 })).watchdog).toEqual({ arm: runId });
    await db.update(runs).set({ watchdogId: 'wrun_1' }).where(eq(runs.id, runId));
    expect((await heartbeat(tenant.tokenProject, run, { shardIndex: 1 })).watchdog).toEqual({});
  });

  test('a finished run ignores it', async ({ db, tenant }) => {
    const { runId, run } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    const before = await runRow(db, runId);
    expect(await heartbeat(tenant.tokenProject, run, { shardIndex: 1 })).toEqual({ runStatus: 'passed', watchdog: {} });
    expect((await runRow(db, runId)).lastEventAt).toEqual(before.lastEventAt);
  });
});

describe('the watchdog of a normal run', () => {
  test('is asked for when the run starts, and stopped when it finishes', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    expect(started.watchdog).toEqual({ arm: started.runId });
    await db.update(runs).set({ watchdogId: 'wrun_1', watchdogClaimedAt: new Date() }).where(eq(runs.id, started.runId));

    const run = await getRunForProject(tenant.tokenProject, started.runId);
    const res = await finishRun(tenant.tokenProject, run, runFinish());

    expect(res.watchdog).toEqual({ disarm: 'wrun_1' });
    expect(await runRow(db, started.runId)).toMatchObject({ endReason: 'reporter', watchdogId: null, watchdogClaimedAt: null });
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
    expect(await eventTypes(db, runId)).toEqual([
      'run.started',
      'shard.started',
      'test.begin',
      'attempt.end',
      'shard.finished',
      'run.finished',
    ]);
  });
});
