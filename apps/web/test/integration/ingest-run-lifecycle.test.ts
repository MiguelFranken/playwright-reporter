/**
 * 8.1 — the core flow: RunStart → events → finish, asserted on the rows that
 * end up in the database rather than on the return values alone.
 */
import { and, asc, eq } from 'drizzle-orm';
import { IngestError } from '@/lib/ingest/http';
import { finishRun, getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { errorSignature, firstLine } from '@/lib/metrics/error-signature';
import { runEvents, runShards, runs, testAttempts, testResults, tests } from '@/lib/db/schema';
import { attemptEnd, eventBatch, runFinish, runStart, testBegin } from './factories';
import { describe, expect, test } from './fixtures';

const KEY = 'tests/home.spec.ts::renders the page';

describe('startRun', () => {
  test('creates the run, its shard and a run.started event', async ({ db, tenant }) => {
    const body = runStart({ ciRunId: 'build-1', expectedTests: 12 });
    const started = await startRun(tenant.tokenProject, body);

    expect(started).toMatchObject({ runNumber: 1, shardIndex: 1 });
    expect(started.url).toBe(`http://test.local/teams/${tenant.team.slug}/projects/${tenant.project.slug}/runs/1`);

    const [run] = await db.select().from(runs).where(eq(runs.id, started.runId));
    expect(run).toMatchObject({
      number: 1,
      ciRunId: 'build-1',
      status: 'running',
      executor: 'ci',
      environment: 'staging',
      expectedTests: 12,
      shardTotal: 1,
      gitBranch: 'main',
      gitShortSha: '0123456',
      gitMessage: 'Add a thing',
      gitAuthorEmail: 'dev@example.test',
      ciProvider: 'github-actions',
      ciJob: 'e2e',
    });
    // The jsonb mirrors carry the whole payload, not just the promoted columns.
    expect(run.git.repoUrl).toBe('https://github.com/acme/app');
    expect(run.system.hostname).toBe('runner-1');
    expect(run.playwright.projects[0]).toMatchObject({ name: 'chromium', retries: 1 });

    const shards = await db.select().from(runShards).where(eq(runShards.runId, started.runId));
    expect(shards).toHaveLength(1);
    expect(shards[0]).toMatchObject({ shardIndex: 1, status: 'running', lastSeq: -1, expectedTests: 12 });

    const events = await db.select().from(runEvents).where(eq(runEvents.runId, started.runId)).orderBy(asc(runEvents.id));
    expect(events.map((e) => e.type)).toEqual(['run.started', 'shard.started']);
    expect(events[0].payload).toEqual({ runNumber: 1 });
    expect(events[1].payload).toEqual({ shardIndex: 1, shardTotal: 1, expectedTests: 12 });
  });

  test('bumps the project run counter for the next run', async ({ db, tenant }) => {
    const first = await startRun(tenant.tokenProject, runStart({ ciRunId: 'build-1' }));
    const second = await startRun(tenant.tokenProject, runStart({ ciRunId: 'build-2' }));
    expect([first.runNumber, second.runNumber]).toEqual([1, 2]);

    const rows = await db.select({ number: runs.number }).from(runs).orderBy(asc(runs.number));
    expect(rows.map((r) => r.number)).toEqual([1, 2]);
  });

  test('returns the same run for a repeated ciRunId instead of creating a second one', async ({ db, tenant }) => {
    const first = await startRun(tenant.tokenProject, runStart({ ciRunId: 'build-1', expectedTests: 5 }));
    const again = await startRun(tenant.tokenProject, runStart({ ciRunId: 'build-1', expectedTests: 4 }));

    expect(again.runId).toBe(first.runId);
    expect(again.runNumber).toBe(1);
    const rows = await db.select().from(runs);
    expect(rows).toHaveLength(1);
    // The second call is another shard's worth of expected tests.
    expect(rows[0].expectedTests).toBe(9);
  });
});

describe('test.begin', () => {
  test('upserts the test and inserts a running result', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: KEY, tags: ['@smoke'] })]));

    const [test] = await db.select().from(tests);
    expect(test).toMatchObject({
      projectId: tenant.project.id,
      testKey: KEY,
      file: 'tests/home.spec.ts',
      title: 'renders the page',
      pwProject: 'chromium',
      tags: ['@smoke'],
    });

    const [result] = await db.select().from(testResults);
    expect(result).toMatchObject({ runId: run.id, testId: test.id, outcome: 'running', attemptCount: 0, line: 10, column: 3 });
  });

  test('reuses the tests row across runs and moves last_seen_at forward', async ({ db, tenant }) => {
    const first = await startRun(tenant.tokenProject, runStart({ ciRunId: 'build-1' }));
    await ingestEvents(
      tenant.tokenProject,
      await getRunForProject(tenant.tokenProject, first.runId),
      eventBatch([testBegin({ seq: 0, testKey: KEY })]),
    );
    const [before] = await db.select().from(tests);

    const second = await startRun(tenant.tokenProject, runStart({ ciRunId: 'build-2' }));
    await ingestEvents(
      tenant.tokenProject,
      await getRunForProject(tenant.tokenProject, second.runId),
      eventBatch([testBegin({ seq: 0, testKey: KEY, title: 'renders the page' })]),
    );

    const after = await db.select().from(tests);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(before.lastSeenAt.getTime());
    expect(after[0].firstSeenAt.getTime()).toBe(before.firstSeenAt.getTime());

    // One result per run, both pointing at the same test.
    const results = await db.select().from(testResults).where(eq(testResults.testId, before.id));
    expect(results).toHaveLength(2);
  });
});

describe('attempt.end', () => {
  test('a failed retry followed by a pass records a flaky result with both attempts', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    const t0 = new Date('2026-09-17T10:00:00.000Z');
    const message = 'Error: expected "a" to equal "b"\n  at home.spec.ts:12:5';

    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY, startedAt: t0.toISOString() }),
        attemptEnd({
          seq: 1,
          testKey: KEY,
          retry: 0,
          status: 'failed',
          durationMs: 1500,
          startedAt: t0.toISOString(),
          errors: [{ message }],
          outcome: 'flaky',
          isFinal: false,
        }),
        attemptEnd({
          seq: 2,
          testKey: KEY,
          retry: 1,
          status: 'passed',
          durationMs: 900,
          startedAt: new Date(t0.getTime() + 1500).toISOString(),
          outcome: 'flaky',
          isFinal: true,
        }),
      ]),
    );

    const [result] = await db.select().from(testResults);
    expect(result).toMatchObject({
      outcome: 'flaky',
      attemptCount: 2,
      durationMs: 2400,
      errorSignature: errorSignature(message),
      errorMessage: firstLine(message),
    });
    expect(result.finishedAt?.getTime()).toBe(t0.getTime() + 1500 + 900);

    const attempts = await db.select().from(testAttempts).orderBy(asc(testAttempts.retry));
    expect(attempts.map((a) => [a.retry, a.status, a.durationMs])).toEqual([
      [0, 'failed', 1500],
      [1, 'passed', 900],
    ]);

    const events = await db.select().from(runEvents).where(eq(runEvents.type, 'attempt.end')).orderBy(asc(runEvents.id));
    expect(events.map((e) => e.payload.isFinal)).toEqual([false, true]);
    expect(events[1].payload).toMatchObject({ outcome: 'flaky', status: 'passed', retry: 1, durationMs: 900 });
  });

  test('a non-final attempt leaves the result running', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({ seq: 1, testKey: KEY, status: 'failed', outcome: 'unexpected', isFinal: false }),
      ]),
    );
    const [result] = await db.select().from(testResults);
    expect(result).toMatchObject({ outcome: 'running', attemptCount: 1, finishedAt: null });
  });

  test.for([
    { status: 'timedOut', outcome: 'unexpected', expected: 'timedout' },
    { status: 'interrupted', outcome: 'unexpected', expected: 'interrupted' },
    { status: 'skipped', outcome: 'skipped', expected: 'skipped' },
    { status: 'passed', outcome: 'expected', expected: 'passed' },
    { status: 'failed', outcome: 'unexpected', expected: 'failed' },
    // Playwright reports a passing test that was expected to fail as unexpected.
    { status: 'passed', outcome: 'unexpected', expected: 'failed' },
  ] as const)('maps status=$status outcome=$outcome to $expected', async ({ status, outcome, expected }, { db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({ seq: 1, testKey: KEY, status, outcome, isFinal: true }),
      ]),
    );
    const [result] = await db.select().from(testResults);
    expect(result.outcome).toBe(expected);
  });

  test('recreates a placeholder test when test.begin was lost', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(tenant.tokenProject, run, eventBatch([attemptEnd({ seq: 0, testKey: KEY, status: 'passed' })]));

    const [test] = await db.select().from(tests);
    expect(test).toMatchObject({ testKey: KEY, file: 'unknown', title: KEY.slice(0, 12), pwProject: '' });
    const [result] = await db.select().from(testResults);
    expect(result).toMatchObject({ testId: test.id, outcome: 'passed', attemptCount: 1 });
  });

  test('keeps the failing attempt error when a later attempt passes', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({ seq: 1, testKey: KEY, retry: 0, status: 'failed', errors: [{ message: 'boom' }], outcome: 'flaky', isFinal: false }),
        attemptEnd({ seq: 2, testKey: KEY, retry: 1, status: 'passed', outcome: 'flaky', isFinal: true }),
      ]),
    );
    const [result] = await db.select().from(testResults);
    expect(result.errorMessage).toBe('boom');
  });
});

describe('sequence handling', () => {
  test('re-sending the same batch accepts nothing and creates no duplicate attempts', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    const batch = eventBatch([
      testBegin({ seq: 0, testKey: KEY }),
      attemptEnd({ seq: 1, testKey: KEY, status: 'passed' }),
    ]);

    const first = await ingestEvents(tenant.tokenProject, run, batch);
    expect(first).toEqual({ accepted: 2, lastSeq: 1 });

    const again = await ingestEvents(tenant.tokenProject, run, batch);
    expect(again).toEqual({ accepted: 0, lastSeq: 1 });

    expect(await db.select().from(testAttempts)).toHaveLength(1);
    expect(await db.select().from(testResults)).toHaveLength(1);
    const [shard] = await db.select().from(runShards).where(eq(runShards.runId, run.id));
    expect(shard.lastSeq).toBe(1);
  });

  test('filters events at or below last_seq and processes the rest in seq order', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: KEY })]));

    // Deliberately unsorted, and seq 0 is already known.
    const result = await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        attemptEnd({ seq: 2, testKey: KEY, retry: 1, status: 'passed', outcome: 'flaky', isFinal: true }),
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({ seq: 1, testKey: KEY, retry: 0, status: 'failed', errors: [{ message: 'first' }], outcome: 'flaky', isFinal: false }),
      ]),
    );
    expect(result).toEqual({ accepted: 2, lastSeq: 2 });

    const attempts = await db.select().from(testAttempts).orderBy(asc(testAttempts.retry));
    expect(attempts.map((a) => a.retry)).toEqual([0, 1]);
    // Order mattered: the final pass was applied after the failure, not before.
    const [row] = await db.select().from(testResults);
    expect(row.outcome).toBe('flaky');
  });

  test('a batch for an unregistered shard is a 404', async ({ tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await expect(ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0 })], 7))).rejects.toSatisfy(
      (error: unknown) => error instanceof IngestError && error.status === 404,
    );
  });

  test('a run from another project is not reachable with this project token', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const other = await db.select().from(runs).where(eq(runs.id, started.runId));
    expect(other).toHaveLength(1);
    const foreign = { ...tenant.tokenProject, id: crypto.randomUUID() };
    await expect(getRunForProject(foreign, started.runId)).rejects.toSatisfy(
      (error: unknown) => error instanceof IngestError && error.status === 404,
    );
  });
});

describe('finishRun', () => {
  test('derives passed from the results and stamps the run', async ({ db, tenant }) => {
    const startedAt = new Date('2026-09-17T10:00:00.000Z');
    const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([testBegin({ seq: 0, testKey: KEY }), attemptEnd({ seq: 1, testKey: KEY, status: 'passed' })]),
    );

    const finished = await finishRun(tenant.tokenProject, run, runFinish({ status: 'passed' }));
    expect(finished.runStatus).toBe('passed');

    const [row] = await db.select().from(runs).where(eq(runs.id, run.id));
    expect(row.status).toBe('passed');
    expect(row.finishedAt).not.toBeNull();
    expect(row.durationMs).toBe(row.finishedAt!.getTime() - startedAt.getTime());

    const [event] = await db
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, run.id), eq(runEvents.type, 'run.finished')));
    // The live views finish the run from the event alone.
    expect(event.payload).toEqual({ status: 'passed', durationMs: row.durationMs, finishedAt: row.finishedAt!.toISOString() });
  });

  test('a single failed result makes the whole run failed', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: 'a' }),
        attemptEnd({ seq: 1, testKey: 'a', status: 'passed' }),
        testBegin({ seq: 2, testKey: 'b' }),
        attemptEnd({ seq: 3, testKey: 'b', status: 'failed', errors: [{ message: 'nope' }], outcome: 'unexpected' }),
      ]),
    );

    // The shard reports success; the results still decide.
    const finished = await finishRun(tenant.tokenProject, run, runFinish({ status: 'passed' }));
    expect(finished.runStatus).toBe('failed');
    const [row] = await db.select().from(runs);
    expect(row.status).toBe('failed');
  });

  test('marks the shard finished with its duration', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await finishRun(tenant.tokenProject, run, runFinish({ status: 'passed', durationMs: 4321 }));

    const [shard] = await db.select().from(runShards).where(eq(runShards.runId, run.id));
    expect(shard).toMatchObject({ status: 'passed', durationMs: 4321 });
    expect(shard.finishedAt).not.toBeNull();
  });
});
