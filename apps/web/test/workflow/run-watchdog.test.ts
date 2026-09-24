/**
 * The run watchdog on a real Workflow SDK runtime (in-process local world, see
 * the `workflow` project in vitest.config.ts) against a real database: it
 * sleeps until the run would turn stale, closes a silent run, sleeps again
 * while the run stays active, and lets a finished run go.
 */
import { eq } from 'drizzle-orm';
import { getRun, start } from 'workflow/api';
import { waitForSleep } from '@workflow/vitest';
import { finishRun, getRunForProject } from '@/lib/ingest/service';
import { runEvents, runs } from '@/lib/db/schema';
import { runWatchdog } from '@/lib/runs/watchdog/run-watchdog.workflow';
import { WorkflowRunWatchdog } from '@/lib/runs/watchdog/workflow';
import { playRun, runFinish } from '../integration/factories';
import { describe, expect, test, type Db } from '../integration/fixtures';

async function silentFor(db: Db, runId: string, minutes: number) {
  await db
    .update(runs)
    .set({ lastEventAt: new Date(Date.now() - minutes * 60_000) })
    .where(eq(runs.id, runId));
}

const runRow = async (db: Db, runId: string) => (await db.select().from(runs).where(eq(runs.id, runId)))[0];

describe('runWatchdog', () => {
  test('sleeps until the deadline, then closes a run that stayed silent', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const watchdog = await start(runWatchdog, [runId]);

    const sleepId = await waitForSleep(watchdog);
    expect((await runRow(db, runId)).status).toBe('running');

    await silentFor(db, runId, 10);
    await getRun(watchdog.runId).wakeUp({ correlationIds: [sleepId] });

    expect(await watchdog.returnValue).toEqual({ runId, outcome: 'closed' });
    expect(await runRow(db, runId)).toMatchObject({ status: 'incomplete', endReason: 'stale' });
    const finished = await db.select().from(runEvents).where(eq(runEvents.type, 'run.finished'));
    expect(finished.map((e) => e.payload)).toMatchObject([{ status: 'incomplete', reason: 'stale' }]);
  });

  test('sleeps again while the run is active, and lets it go once it finishes', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }], finish: false });
    const watchdog = await start(runWatchdog, [runId]);

    // Woken before the deadline (as after activity moved it): it checks and sleeps again.
    await getRun(watchdog.runId).wakeUp({ correlationIds: [await waitForSleep(watchdog)] });
    const second = await waitForSleep(watchdog);

    const run = await getRunForProject(tenant.tokenProject, runId);
    await finishRun(tenant.tokenProject, run, runFinish());
    await getRun(watchdog.runId).wakeUp({ correlationIds: [second] });

    expect(await watchdog.returnValue).toEqual({ runId, outcome: 'ended' });
    expect((await runRow(db, runId)).status).toBe('passed');
  });
});

describe('WorkflowRunWatchdog', () => {
  test('starts one watchdog per run however often it is armed, and disarms it', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const adapter = new WorkflowRunWatchdog();

    await Promise.all([adapter.arm(runId), adapter.arm(runId), adapter.arm(runId)]);
    const { watchdogId } = await runRow(db, runId);
    expect(watchdogId).toMatch(/^wrun_/);
    await adapter.arm(runId);
    expect((await runRow(db, runId)).watchdogId).toBe(watchdogId);

    await waitForSleep(getRun(watchdogId!));
    await adapter.disarm(watchdogId!);
    await expect.poll(() => getRun(watchdogId!).status).toBe('cancelled');
    // Disarming again is harmless.
    await adapter.disarm(watchdogId!);
  });
});
