/**
 * The watchdog's loop, without the workflow runtime: the directives are
 * no-ops uncompiled, so `sleep` and the steps are mocked and the function runs
 * as plain async code. The real runtime is exercised by `next dev`/deployments.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sleep = vi.fn(async (_until: Date) => undefined);
vi.mock('workflow', () => ({
  sleep: (until: Date) => sleep(until),
  getWorkflowMetadata: () => ({ workflowRunId: 'wrun_self' }),
}));

const checkRun = vi.fn();
const releaseRun = vi.fn(async (_runId: string, _watchdogId: string) => undefined);
vi.mock('./run-watchdog.steps', () => ({
  checkRun: (runId: string) => checkRun(runId),
  releaseRun: (runId: string, watchdogId: string) => releaseRun(runId, watchdogId),
}));

const { MAX_CHECKS, runWatchdog } = await import('./run-watchdog.workflow');

beforeEach(() => {
  sleep.mockClear();
  checkRun.mockReset();
  releaseRun.mockClear();
});

describe('runWatchdog', () => {
  it('sleeps until each deadline the check names, and stops once the run is closed', async () => {
    checkRun
      .mockResolvedValueOnce({ done: false, deadline: '2026-09-24T10:05:01.000Z' })
      .mockResolvedValueOnce({ done: false, deadline: '2026-09-24T10:09:31.000Z' })
      .mockResolvedValueOnce({ done: true, outcome: 'closed' });

    expect(await runWatchdog('run-1')).toEqual({ runId: 'run-1', outcome: 'closed' });
    expect(sleep.mock.calls.map(([until]) => until.toISOString())).toEqual(['2026-09-24T10:05:01.000Z', '2026-09-24T10:09:31.000Z']);
    expect(releaseRun).not.toHaveBeenCalled();
  });

  it('stops at once for a run that already ended', async () => {
    checkRun.mockResolvedValueOnce({ done: true, outcome: 'ended' });
    expect(await runWatchdog('run-1')).toEqual({ runId: 'run-1', outcome: 'ended' });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('hands off after MAX_CHECKS, freeing the run for a fresh watchdog', async () => {
    checkRun.mockResolvedValue({ done: false, deadline: '2026-09-24T10:05:01.000Z' });
    expect(await runWatchdog('run-1')).toEqual({ runId: 'run-1', outcome: 'handed-off' });
    expect(checkRun).toHaveBeenCalledTimes(MAX_CHECKS);
    expect(releaseRun).toHaveBeenCalledWith('run-1', 'wrun_self');
  });
});
