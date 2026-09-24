/**
 * The live views apply run events without asking the server, so every result
 * event has to say what the result was before and what it is now — also when
 * one batch carries a test's whole retry cycle.
 */
import { asc, eq } from 'drizzle-orm';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { errorSignature } from '@/lib/metrics/error-signature';
import { runEvents, testAttempts, testResults, tests } from '@/lib/db/schema';
import { attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { describe, expect, test } from './fixtures';

const KEY = 'tests/home.spec.ts::renders the page';
const OTHER = 'tests/home.spec.ts::shows the footer';

describe('live event payloads', () => {
  test('one batch holding a whole retry cycle folds into the same result as separate batches', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    const message = 'expect(locator).toBeVisible() failed';
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY, retry: 0 }),
        attemptEnd({ seq: 1, testKey: KEY, retry: 0, status: 'failed', durationMs: 1500, errors: [{ message }], outcome: 'unexpected', isFinal: false }),
        testBegin({ seq: 2, testKey: KEY, retry: 1 }),
        attemptEnd({ seq: 3, testKey: KEY, retry: 1, status: 'passed', durationMs: 900, outcome: 'flaky', isFinal: true }),
        testBegin({ seq: 4, testKey: OTHER }),
        attemptEnd({ seq: 5, testKey: OTHER, status: 'passed', durationMs: 300 }),
      ]),
    );

    expect(await db.select().from(tests)).toHaveLength(2);
    const results = await db.select().from(testResults).innerJoin(tests, eq(tests.id, testResults.testId));
    const flaky = results.find((r) => r.tests.testKey === KEY)!.test_results;
    expect(flaky).toMatchObject({ outcome: 'flaky', attemptCount: 2, durationMs: 2400, errorSignature: errorSignature(message) });
    expect(await db.select().from(testAttempts)).toHaveLength(3);

    const events = await db.select().from(runEvents).where(eq(runEvents.runId, run.id)).orderBy(asc(runEvents.id));
    const payloads = events.filter((e) => e.type === 'test.begin' || e.type === 'attempt.end').map((e) => [e.type, e.payload]);
    expect(payloads).toEqual([
      ['test.begin', expect.objectContaining({ resultId: flaky.id, retry: 0, prevOutcome: null, outcome: 'running' })],
      [
        'attempt.end',
        expect.objectContaining({
          resultId: flaky.id,
          prevOutcome: 'running',
          outcome: 'running',
          resultDurationMs: 1500,
          attemptCount: 1,
          prevErrorSignature: null,
          errorSignature: errorSignature(message),
        }),
      ],
      ['test.begin', expect.objectContaining({ resultId: flaky.id, retry: 1, prevOutcome: 'running' })],
      ['attempt.end', expect.objectContaining({ prevOutcome: 'running', outcome: 'flaky', resultDurationMs: 2400, attemptCount: 2 })],
      ['test.begin', expect.objectContaining({ prevOutcome: null, title: expect.any(String), titlePath: expect.any(Array), line: expect.any(Number) })],
      ['attempt.end', expect.objectContaining({ prevOutcome: 'running', outcome: 'passed', resultDurationMs: 300 })],
    ]);
  });

  test('an attempt whose test.begin was lost reports a new result', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(tenant.tokenProject, run, eventBatch([attemptEnd({ seq: 0, testKey: KEY, status: 'passed' })]));

    const [event] = await db.select().from(runEvents).where(eq(runEvents.type, 'attempt.end'));
    expect(event.payload).toMatchObject({ prevOutcome: null, outcome: 'passed', attemptCount: 1 });
  });

  test('a redelivered attempt changes nothing and emits no event', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: KEY }), attemptEnd({ seq: 1, testKey: KEY })]));
    // Same attempt again under a new seq, as a reporter restart would send it.
    await ingestEvents(tenant.tokenProject, run, eventBatch([attemptEnd({ seq: 2, testKey: KEY })]));

    const [result] = await db.select().from(testResults);
    expect(result).toMatchObject({ attemptCount: 1, durationMs: 1200 });
    expect(await db.select().from(runEvents).where(eq(runEvents.type, 'attempt.end'))).toHaveLength(1);
  });

  test('a test begun again in a later batch keeps its result and reports the outcome it had', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([testBegin({ seq: 0, testKey: KEY }), attemptEnd({ seq: 1, testKey: KEY, status: 'failed', outcome: 'unexpected', isFinal: false })]),
    );
    await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 2, testKey: KEY, retry: 1 })]));

    expect(await db.select().from(testResults)).toHaveLength(1);
    const begins = await db.select().from(runEvents).where(eq(runEvents.type, 'test.begin')).orderBy(asc(runEvents.id));
    expect(begins.map((e) => e.payload.prevOutcome)).toEqual([null, 'running']);
  });
});
