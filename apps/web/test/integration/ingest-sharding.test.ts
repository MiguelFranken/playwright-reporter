/**
 * 8.2 — sharded runs. Shards start concurrently and finish independently, so
 * these assertions lean on the real `FOR UPDATE` serialization rather than on
 * calls that happen to be sequential.
 */
import { asc, eq } from 'drizzle-orm';
import { finishRun, getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { runShards, runs } from '@/lib/db/schema';
import { attemptEnd, eventBatch, runFinish, runStart, testBegin } from './factories';
import { describe, expect, test } from './fixtures';

const sharded = (current: number, total: number, overrides = {}) =>
  runStart({ ciRunId: 'build-1', shard: { current, total }, expectedTests: 5, ...overrides });

describe('two shards of one run', () => {
  test('share a run row and sum their expected tests', async ({ db, tenant }) => {
    const a = await startRun(tenant.tokenProject, sharded(1, 2));
    const b = await startRun(tenant.tokenProject, sharded(2, 2));

    expect(b.runId).toBe(a.runId);
    expect([a.shardIndex, b.shardIndex]).toEqual([1, 2]);

    const rows = await db.select().from(runs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ number: 1, shardTotal: 2, expectedTests: 10, status: 'running' });

    const shards = await db.select().from(runShards).where(eq(runShards.runId, a.runId)).orderBy(asc(runShards.shardIndex));
    expect(shards.map((s) => [s.shardIndex, s.status, s.expectedTests])).toEqual([
      [1, 'running', 5],
      [2, 'running', 5],
    ]);
  });

  test('starting both concurrently still produces exactly one run', async ({ db, tenant }) => {
    const [a, b] = await Promise.all([
      startRun(tenant.tokenProject, sharded(1, 2)),
      startRun(tenant.tokenProject, sharded(2, 2)),
    ]);
    expect(a.runId).toBe(b.runId);

    const rows = await db.select().from(runs);
    expect(rows).toHaveLength(1);
    expect(rows[0].expectedTests).toBe(10);
    expect(await db.select().from(runShards)).toHaveLength(2);
  });

  test('concurrent starts of different runs get consecutive numbers', async ({ db, tenant }) => {
    const started = await Promise.all(
      [1, 2, 3, 4].map((n) => startRun(tenant.tokenProject, runStart({ ciRunId: `build-${n}` }))),
    );
    expect(started.map((s) => s.runNumber).sort((x, y) => x - y)).toEqual([1, 2, 3, 4]);

    const rows = await db.select({ number: runs.number }).from(runs).orderBy(asc(runs.number));
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4]);
  });
});

describe('finishing a sharded run', () => {
  test('stays running until the last shard reports', async ({ db, tenant }) => {
    const a = await startRun(tenant.tokenProject, sharded(1, 2));
    await startRun(tenant.tokenProject, sharded(2, 2));
    const run = await getRunForProject(tenant.tokenProject, a.runId);

    const first = await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 1, status: 'passed' }));
    expect(first.runStatus).toBe('running');
    expect((await db.select().from(runs))[0].status).toBe('running');

    const second = await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 2, status: 'passed' }));
    expect(second.runStatus).toBe('passed');
    const [row] = await db.select().from(runs);
    expect(row.status).toBe('passed');
    expect(row.finishedAt).not.toBeNull();
  });

  test.for([
    { statuses: ['passed', 'failed'], expected: 'failed' },
    { statuses: ['passed', 'timedout'], expected: 'timedout' },
    { statuses: ['passed', 'interrupted'], expected: 'interrupted' },
    { statuses: ['passed', 'passed'], expected: 'passed' },
    // Failure outranks a timeout, which outranks an interruption.
    { statuses: ['failed', 'timedout'], expected: 'failed' },
    { statuses: ['timedout', 'interrupted'], expected: 'timedout' },
  ] as const)('shard statuses $statuses settle the run as $expected', async ({ statuses, expected }, { db, tenant }) => {
    const a = await startRun(tenant.tokenProject, sharded(1, 2));
    await startRun(tenant.tokenProject, sharded(2, 2));
    const run = await getRunForProject(tenant.tokenProject, a.runId);

    await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 1, status: statuses[0] }));
    const final = await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 2, status: statuses[1] }));

    expect(final.runStatus).toBe(expected);
    expect((await db.select().from(runs))[0].status).toBe(expected);
  });

  test('a failed result outranks shards that all reported success', async ({ db, tenant }) => {
    const a = await startRun(tenant.tokenProject, sharded(1, 2));
    await startRun(tenant.tokenProject, sharded(2, 2));
    const run = await getRunForProject(tenant.tokenProject, a.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch(
        [testBegin({ seq: 0, testKey: 'a' }), attemptEnd({ seq: 1, testKey: 'a', status: 'failed', outcome: 'unexpected' })],
        1,
      ),
    );

    await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 1, status: 'passed' }));
    const final = await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 2, status: 'passed' }));
    expect(final.runStatus).toBe('failed');
    expect((await db.select().from(runs))[0].status).toBe('failed');
  });

  test('results are recorded against the shard that reported them', async ({ db, tenant }) => {
    const a = await startRun(tenant.tokenProject, sharded(1, 2));
    const b = await startRun(tenant.tokenProject, sharded(2, 2));
    const run = await getRunForProject(tenant.tokenProject, a.runId);
    await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: 'a' })], a.shardIndex));
    await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: 'b' })], b.shardIndex));

    const rows = await db.query.testResults.findMany({ with: { test: true } });
    expect(rows.map((r) => [r.test.testKey, r.shardIndex]).sort()).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });
});

describe('a shard restarting', () => {
  test('resets its sequence cursor so a retried shard is not deduplicated away', async ({ db, tenant }) => {
    const a = await startRun(tenant.tokenProject, sharded(1, 2));
    const run = await getRunForProject(tenant.tokenProject, a.runId);
    await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: 'a' })], 1));
    expect((await db.select().from(runShards).where(eq(runShards.shardIndex, 1)))[0].lastSeq).toBe(0);

    await startRun(tenant.tokenProject, sharded(1, 2));
    const [shard] = await db.select().from(runShards).where(eq(runShards.shardIndex, 1));
    expect(shard).toMatchObject({ status: 'running', lastSeq: -1 });

    // Sequence numbers start over, and the batch is accepted again.
    const accepted = await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: 'a' })], 1));
    expect(accepted.accepted).toBe(1);
    expect(await db.select().from(runShards)).toHaveLength(1);
  });

  test('revives a run that had been marked incomplete', async ({ db, tenant }) => {
    const a = await startRun(tenant.tokenProject, sharded(1, 2));
    await db.update(runs).set({ status: 'incomplete' }).where(eq(runs.id, a.runId));

    await startRun(tenant.tokenProject, sharded(2, 2));
    const [row] = await db.select().from(runs);
    expect(row.status).toBe('running');
  });

  test('leaves a finished run alone', async ({ db, tenant }) => {
    const a = await startRun(tenant.tokenProject, sharded(1, 1));
    const run = await getRunForProject(tenant.tokenProject, a.runId);
    await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 1, status: 'passed' }));

    await startRun(tenant.tokenProject, sharded(1, 1));
    const [row] = await db.select().from(runs);
    expect(row.status).toBe('passed');
  });
});
