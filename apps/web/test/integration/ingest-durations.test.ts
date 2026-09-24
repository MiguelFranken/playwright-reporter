/**
 * Durations reach the database as `integer` columns but originate in numbers a
 * reporter supplies, so they are attacker- and clock-controlled. These are
 * regression tests for the 500s that used to come out of that.
 */
import { eq } from 'drizzle-orm';
import { finishRun, getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { runShards, runs, testAttempts, testResults } from '@/lib/db/schema';
import { attemptEnd, eventBatch, runFinish, runStart, testBegin } from './factories';
import { describe, expect, test } from './fixtures';

const INT_MAX = 2_147_483_647;
const KEY = 'tests/home.spec.ts::renders the page';

describe('run duration', () => {
  test('a run that started weeks ago still finishes', async ({ db, tenant }) => {
    // 40 days in milliseconds is 3.4e9, well past the integer column's range.
    const startedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
    const run = await getRunForProject(tenant.tokenProject, started.runId);

    const finished = await finishRun(tenant.tokenProject, run, runFinish({ status: 'passed' }));
    expect(finished.runStatus).toBe('passed');

    const [row] = await db.select().from(runs).where(eq(runs.id, run.id));
    expect(row.durationMs).toBe(INT_MAX);
    expect(row.status).toBe('passed');
  });

  test('a start timestamp in the future does not store a negative duration', async ({ db, tenant }) => {
    const startedAt = new Date(Date.now() + 60 * 60 * 1000);
    const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
    const run = await getRunForProject(tenant.tokenProject, started.runId);

    await finishRun(tenant.tokenProject, run, runFinish({ status: 'passed' }));

    const [row] = await db.select().from(runs).where(eq(runs.id, run.id));
    expect(row.durationMs).toBe(0);
  });

  test('a shard reporting an absurd duration is clamped, not rejected', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);

    await finishRun(tenant.tokenProject, run, runFinish({ status: 'passed', durationMs: 9e12 }));

    const [shard] = await db.select().from(runShards).where(eq(runShards.runId, run.id));
    expect(shard.durationMs).toBe(INT_MAX);
  });
});

describe('attempt duration', () => {
  test('an out-of-range attempt duration is clamped on both the attempt and the result', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);

    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({ seq: 1, testKey: KEY, status: 'passed', durationMs: 5e12 }),
      ]),
    );

    const [attempt] = await db.select().from(testAttempts);
    expect(attempt.durationMs).toBe(INT_MAX);
    const [result] = await db.select().from(testResults);
    expect(result.durationMs).toBe(INT_MAX);
  });

  test('summing attempt durations never overflows the result column', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);

    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({ seq: 1, testKey: KEY, retry: 0, status: 'failed', durationMs: INT_MAX - 1, outcome: 'flaky', isFinal: false }),
        attemptEnd({ seq: 2, testKey: KEY, retry: 1, status: 'passed', durationMs: INT_MAX - 1, outcome: 'flaky', isFinal: true }),
      ]),
    );

    const [result] = await db.select().from(testResults);
    expect(result.durationMs).toBe(INT_MAX);
    expect(result.outcome).toBe('flaky');
    expect(result.attemptCount).toBe(2);
  });

  test('ordinary durations are untouched', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);

    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({ seq: 1, testKey: KEY, status: 'passed', durationMs: 1234.6 }),
      ]),
    );

    const [attempt] = await db.select().from(testAttempts);
    expect(attempt.durationMs).toBe(1235);
  });
});
