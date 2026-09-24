/**
 * The workflow watchdog adapter's claim on the run row: however many ingest
 * calls arm a run at once, one watchdog starts. The Workflow SDK itself is
 * stubbed; the watchdog's step runs against the database in
 * `ingest-stale-runs.test.ts`.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, vi } from 'vitest';
import { runs } from '@/lib/db/schema';
import { playRun } from './factories';
import { describe, expect, test, type Db } from './fixtures';

const start = vi.fn();
const cancel = vi.fn();
vi.mock('workflow/api', () => ({
  start: (...args: unknown[]) => start(...args),
  getRun: (id: string) => ({ cancel: () => cancel(id) }),
}));

const { WorkflowRunWatchdog } = await import('@/lib/runs/watchdog/workflow');

let n = 0;
beforeEach(() => {
  start.mockReset().mockImplementation(async () => ({ runId: `wrun_${++n}` }));
  cancel.mockReset().mockResolvedValue(undefined);
});

const row = async (db: Db, runId: string) => (await db.select().from(runs).where(eq(runs.id, runId)))[0];

describe('WorkflowRunWatchdog', () => {
  test('starts one watchdog per run, however often and concurrently it is armed', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const watchdog = new WorkflowRunWatchdog();

    await Promise.all([watchdog.arm(runId), watchdog.arm(runId), watchdog.arm(runId)]);
    await watchdog.arm(runId);

    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][1]).toEqual([runId]);
    const { watchdogId, watchdogClaimedAt } = await row(db, runId);
    expect(watchdogId).toMatch(/^wrun_/);
    expect(watchdogClaimedAt).not.toBeNull();
  });

  test('a failed start releases the claim, so the next heartbeat tries again', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const watchdog = new WorkflowRunWatchdog();
    start.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(watchdog.arm(runId)).rejects.toThrow('queue unavailable');
    expect(await row(db, runId)).toMatchObject({ watchdogId: null, watchdogClaimedAt: null });

    await watchdog.arm(runId);
    expect(start).toHaveBeenCalledTimes(2);
    expect((await row(db, runId)).watchdogId).toMatch(/^wrun_/);
  });

  test('a claim left by an instance that died is taken over after two minutes', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const watchdog = new WorkflowRunWatchdog();

    await db.update(runs).set({ watchdogClaimedAt: new Date(Date.now() - 60_000) }).where(eq(runs.id, runId));
    await watchdog.arm(runId);
    expect(start).not.toHaveBeenCalled();

    await db.update(runs).set({ watchdogClaimedAt: new Date(Date.now() - 3 * 60_000) }).where(eq(runs.id, runId));
    await watchdog.arm(runId);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('does not guard a run that is not running', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    await new WorkflowRunWatchdog().arm(runId);
    expect(start).not.toHaveBeenCalled();
    expect((await row(db, runId)).watchdogId).toBeNull();
  });

  test('disarming cancels the workflow run, and tolerates one that is already over', async () => {
    const watchdog = new WorkflowRunWatchdog();
    await watchdog.disarm('wrun_a');
    expect(cancel).toHaveBeenCalledWith('wrun_a');

    cancel.mockRejectedValueOnce(new Error('run already completed'));
    await expect(watchdog.disarm('wrun_b')).resolves.toBeUndefined();
  });
});
