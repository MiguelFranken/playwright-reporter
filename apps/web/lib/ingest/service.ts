import { randomUUID } from 'node:crypto';
import { and, eq, getTableColumns, gt, inArray, lt, lte, sql } from 'drizzle-orm';
import {
  classifyAttachment,
  type AttemptEndEvent,
  type EventBatch,
  type RunFinish,
  type RunStart,
  type TestBeginEvent,
  type UploadInstruction,
} from '@miguelfranken/protocol';
import { db } from '@/lib/db/drizzle';
import {
  attachments,
  projects,
  runEvents,
  runShards,
  runs,
  testAttempts,
  testResults,
  tests,
  type Attachment,
  type Run,
} from '@/lib/db/schema';
import { errorSignature, firstLine } from '@/lib/metrics/error-signature';
import { baseUrl, getStorage, storageKey } from '@/lib/storage';
import type { AttemptEndPayload, TestBeginPayload } from '@/lib/live/events';
import { IngestError, type TokenProject } from './http';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Outcome = NonNullable<(typeof testResults.$inferInsert)['outcome']>;

export const STALE_RUN_MS = 10 * 60 * 1000;

/**
 * Every `duration_ms` column is a Postgres `integer`. Durations are derived
 * from timestamps a reporter supplies, so a skewed clock or a run that stayed
 * open for weeks would otherwise overflow the column and turn an ingest call
 * into a 500. Clamping keeps the value monotone and the request successful.
 */
const MAX_DURATION_MS = 2_147_483_647;

export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.min(MAX_DURATION_MS, Math.max(0, Math.round(ms)));
}

export function runUrl(project: TokenProject, runNumber: number) {
  return `${baseUrl()}/teams/${project.teamSlug}/projects/${project.slug}/runs/${runNumber}`;
}

// ---------------------------------------------------------------- run start

export async function startRun(project: TokenProject, body: RunStart) {
  const shardIndex = body.shard?.current ?? 1;
  const shardTotal = body.shard?.total ?? 1;
  return db.transaction(async (tx) => {
    // Serialize concurrent run creation per project (shards start at the same time).
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, project.id)).for('update');
    let [run] = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.projectId, project.id), eq(runs.ciRunId, body.ciRunId)))
      .for('update');
    if (!run) {
      const [{ runCounter }] = await tx
        .update(projects)
        .set({ runCounter: sql`${projects.runCounter} + 1`, updatedAt: new Date() })
        .where(eq(projects.id, project.id))
        .returning({ runCounter: projects.runCounter });
      [run] = await tx
        .insert(runs)
        .values({
          id: randomUUID(),
          projectId: project.id,
          number: runCounter,
          ciRunId: body.ciRunId,
          status: 'running',
          executor: body.executor,
          environment: body.environment ?? null,
          tags: body.tags,
          startedAt: new Date(body.startedAt),
          expectedTests: body.expectedTests,
          shardTotal,
          gitBranch: body.git.branch ?? null,
          gitSha: body.git.sha ?? null,
          gitShortSha: body.git.shortSha ?? null,
          gitMessage: body.git.message ?? null,
          gitAuthorName: body.git.authorName ?? null,
          gitAuthorEmail: body.git.authorEmail ?? null,
          gitRepoUrl: body.git.repoUrl ?? null,
          prNumber: body.git.prNumber ?? null,
          prUrl: body.git.prUrl ?? null,
          ciProvider: body.ci.provider ?? null,
          ciBuildUrl: body.ci.buildUrl ?? null,
          ciJob: body.ci.job ?? null,
          ciBuildNumber: body.ci.buildNumber ?? null,
          git: body.git,
          ci: body.ci,
          system: body.system,
          playwright: body.playwright,
          lastEventAt: new Date(),
        })
        .returning();
      await tx.insert(runEvents).values({ runId: run.id, projectId: project.id, type: 'run.started', payload: { runNumber: run.number } });
    } else {
      // Another shard of the same run: extend expected test count and revive if marked stale.
      await tx
        .update(runs)
        .set({
          expectedTests: sql`${runs.expectedTests} + ${body.expectedTests}`,
          shardTotal: Math.max(run.shardTotal, shardTotal),
          status: run.status === 'incomplete' ? 'running' : run.status,
          lastEventAt: new Date(),
        })
        .where(eq(runs.id, run.id));
    }
    await tx
      .insert(runShards)
      .values({
        runId: run.id,
        shardIndex,
        status: 'running',
        expectedTests: body.expectedTests,
        startedAt: new Date(body.startedAt),
        hostname: body.system.hostname ?? null,
      })
      .onConflictDoUpdate({
        target: [runShards.runId, runShards.shardIndex],
        set: { status: 'running', startedAt: new Date(body.startedAt), lastSeq: -1 },
      });
    await tx.insert(runEvents).values({
      runId: run.id,
      projectId: project.id,
      type: 'shard.started',
      payload: { shardIndex, shardTotal, expectedTests: body.expectedTests },
    });
    return { runId: run.id, runNumber: run.number, shardIndex, url: runUrl(project, run.number) };
  });
}

// ---------------------------------------------------------------- events

export async function getRunForProject(project: TokenProject, runId: string): Promise<Run> {
  const [run] = await db.select().from(runs).where(and(eq(runs.id, runId), eq(runs.projectId, project.id)));
  if (!run) throw new IngestError(404, 'run not found');
  return run;
}

/**
 * Applies one batch of a shard's events.
 *
 * The work is set-based: a constant number of statements per batch, however
 * many events it holds, instead of a handful per event. That matters because
 * every statement is a network round trip, and the shard row stays locked
 * until the transaction ends. The events are folded in memory in `seq` order
 * — a batch can hold a test's begin, a failed attempt, the retry's begin and
 * the final attempt — and the resulting rows are written once each.
 */
export async function ingestEvents(project: TokenProject, run: Run, batch: EventBatch) {
  return db.transaction(async (tx) => {
    const [shard] = await tx
      .select()
      .from(runShards)
      .where(and(eq(runShards.runId, run.id), eq(runShards.shardIndex, batch.shardIndex)))
      .for('update');
    if (!shard) throw new IngestError(404, 'shard not registered');
    const fresh = batch.events.filter((e) => e.seq > shard.lastSeq).sort((a, b) => a.seq - b.seq);
    if (fresh.length === 0) return { accepted: 0, lastSeq: shard.lastSeq };

    const begins = fresh.filter((e): e is TestBeginEvent => e.type === 'test.begin');
    const ends = fresh.filter((e): e is AttemptEndEvent => e.type === 'attempt.end');

    const testsByKey = await resolveTests(tx, project, begins, ends);
    const results = await resolveResults(tx, project, run, batch.shardIndex, begins, ends, testsByKey);

    // Attempts first: `onConflictDoNothing` tells us which ones are new, and
    // only those may touch their result (a redelivered attempt is a no-op).
    const attemptIds = new Map<AttemptEndEvent, string>();
    const attemptRows = ends.map((ev) => {
      const id = randomUUID();
      attemptIds.set(ev, id);
      return {
        id,
        testResultId: results.get(testsByKey.get(ev.testKey)!.id)!.row.id,
        retry: ev.retry,
        status: ev.status,
        durationMs: clampDuration(ev.durationMs),
        startedAt: new Date(ev.startedAt),
        workerIndex: ev.workerIndex,
        parallelIndex: ev.parallelIndex,
        errors: ev.errors,
        steps: ev.steps,
        stdout: ev.stdout,
        stderr: ev.stderr,
        annotations: ev.annotations,
      };
    });
    const insertedAttempts = new Set(
      attemptRows.length
        ? (
            await tx
              .insert(testAttempts)
              .values(attemptRows)
              .onConflictDoNothing({ target: [testAttempts.testResultId, testAttempts.retry] })
              .returning({ id: testAttempts.id })
          ).map((a) => a.id)
        : [],
    );

    const storage = getStorage();
    const attachmentRows: (typeof attachments.$inferInsert)[] = [];
    const eventRows: (typeof runEvents.$inferInsert)[] = [];
    const touched = new Set<ResultState>();

    for (const ev of fresh) {
      if (ev.type === 'test.begin') {
        const test = testsByKey.get(ev.testKey)!;
        const state = results.get(test.id)!;
        const payload: TestBeginPayload = {
          testId: test.id,
          resultId: state.row.id,
          title: ev.title,
          titlePath: ev.titlePath,
          file: ev.file,
          project: ev.project,
          line: ev.line,
          tags: ev.tags,
          annotations: ev.annotations,
          retry: ev.retry,
          outcome: state.row.outcome,
          prevOutcome: state.isNew ? null : state.row.outcome,
        };
        state.isNew = false;
        eventRows.push({ runId: run.id, projectId: project.id, type: 'test.begin', payload: { ...payload } });
      } else if (ev.type === 'attempt.end') {
        const attemptId = attemptIds.get(ev)!;
        if (!insertedAttempts.has(attemptId)) continue; // duplicate delivery
        const test = testsByKey.get(ev.testKey)!;
        const state = results.get(test.id)!;
        const prev = { outcome: state.isNew ? null : state.row.outcome, errorSignature: state.row.errorSignature };
        state.isNew = false;
        applyAttempt(state.row, ev);
        touched.add(state);
        for (const a of ev.attachments) {
          attachmentRows.push({
            id: a.id,
            attemptId,
            runId: run.id,
            name: a.name,
            contentType: a.contentType,
            kind: classifyAttachment(a.name, a.contentType),
            storageKey: storageKey({ projectId: project.id, runId: run.id, attemptId, attachmentId: a.id, name: a.name }),
            storageDriver: storage.name,
            sizeBytes: a.size ?? null,
            status: 'pending' as const,
          });
        }
        const payload: AttemptEndPayload = {
          testId: test.id,
          resultId: state.row.id,
          title: test.title,
          file: test.file,
          project: test.pwProject,
          retry: ev.retry,
          status: ev.status,
          isFinal: ev.isFinal,
          durationMs: clampDuration(ev.durationMs),
          outcome: state.row.outcome,
          prevOutcome: prev.outcome,
          resultDurationMs: state.row.durationMs,
          attemptCount: state.row.attemptCount,
          errorMessage: state.row.errorMessage,
          errorSignature: state.row.errorSignature,
          prevErrorSignature: prev.errorSignature,
          annotations: state.row.annotations,
        };
        eventRows.push({ runId: run.id, projectId: project.id, type: 'attempt.end', payload: { ...payload } });
      } else {
        eventRows.push({ runId: run.id, projectId: project.id, type: 'run.log', payload: { level: ev.level, message: ev.message } });
      }
    }

    if (attachmentRows.length) await tx.insert(attachments).values(attachmentRows).onConflictDoNothing();
    if (touched.size) await updateResults(tx, [...touched].map((s) => s.row));
    if (eventRows.length) await tx.insert(runEvents).values(eventRows);
    const lastSeq = Math.max(shard.lastSeq, ...fresh.map((e) => e.seq));
    await tx.update(runShards).set({ lastSeq }).where(and(eq(runShards.runId, run.id), eq(runShards.shardIndex, batch.shardIndex)));
    await tx.update(runs).set({ lastEventAt: new Date() }).where(eq(runs.id, run.id));
    return { accepted: fresh.length, lastSeq };
  });
}

type ResultRow = typeof testResults.$inferSelect;
type TestRef = { id: string; title: string; file: string; pwProject: string };
/** A result as the fold sees it; `isNew` until the first event that reports it. */
type ResultState = { row: ResultRow; isNew: boolean };

/** Upserts the tests the batch begins and finds (or stubs) the ones it only ends. */
async function resolveTests(tx: Tx, project: TokenProject, begins: TestBeginEvent[], ends: AttemptEndEvent[]) {
  const byKey = new Map<string, TestRef>();
  // A batch can begin a test twice (a retry); the last begin describes it best.
  const latest = new Map(begins.map((ev) => [ev.testKey, ev]));
  if (latest.size) {
    const rows = await tx
      .insert(tests)
      .values(
        [...latest.values()].map((ev) => ({
          id: randomUUID(),
          projectId: project.id,
          testKey: ev.testKey,
          pwTestId: ev.pwTestId,
          file: ev.file,
          title: ev.title,
          titlePath: ev.titlePath,
          pwProject: ev.project,
          tags: ev.tags,
        })),
      )
      .onConflictDoUpdate({
        target: [tests.projectId, tests.testKey],
        set: {
          pwTestId: sql`excluded.pw_test_id`,
          title: sql`excluded.title`,
          titlePath: sql`excluded.title_path`,
          tags: sql`excluded.tags`,
          file: sql`excluded.file`,
          lastSeenAt: new Date(),
        },
      })
      .returning({ id: tests.id, testKey: tests.testKey, title: tests.title, file: tests.file, pwProject: tests.pwProject });
    for (const r of rows) byKey.set(r.testKey, r);
  }

  const unknown = [...new Set(ends.map((ev) => ev.testKey))].filter((k) => !byKey.has(k));
  if (unknown.length) {
    const rows = await tx
      .select({ id: tests.id, testKey: tests.testKey, title: tests.title, file: tests.file, pwProject: tests.pwProject })
      .from(tests)
      .where(and(eq(tests.projectId, project.id), inArray(tests.testKey, unknown)));
    for (const r of rows) byKey.set(r.testKey, r);
    // The test.begin was lost: record a placeholder rather than drop the attempt.
    const missing = unknown.filter((k) => !byKey.has(k));
    if (missing.length) {
      const stubs = await tx
        .insert(tests)
        .values(missing.map((k) => ({ id: randomUUID(), projectId: project.id, testKey: k, pwTestId: '', file: 'unknown', title: k.slice(0, 12), titlePath: [], pwProject: '', tags: [] })))
        .onConflictDoUpdate({ target: [tests.projectId, tests.testKey], set: { lastSeenAt: new Date() } })
        .returning({ id: tests.id, testKey: tests.testKey, title: tests.title, file: tests.file, pwProject: tests.pwProject });
      for (const r of stubs) byKey.set(r.testKey, r);
    }
  }
  return byKey;
}

/** Upserts the results the batch begins and finds (or creates) the ones it only ends. Keyed by test id. */
async function resolveResults(
  tx: Tx,
  project: TokenProject,
  run: Run,
  shardIndex: number,
  begins: TestBeginEvent[],
  ends: AttemptEndEvent[],
  testsByKey: Map<string, TestRef>,
) {
  const byTest = new Map<string, ResultState>();
  const firstBegin = new Map<string, TestBeginEvent>();
  const lastBegin = new Map<string, TestBeginEvent>();
  for (const ev of begins) {
    const testId = testsByKey.get(ev.testKey)!.id;
    if (!firstBegin.has(testId)) firstBegin.set(testId, ev);
    lastBegin.set(testId, ev);
  }
  if (firstBegin.size) {
    const rows = await tx
      .insert(testResults)
      .values(
        [...firstBegin].map(([testId, ev]) => ({
          id: randomUUID(),
          runId: run.id,
          testId,
          projectId: project.id,
          shardIndex,
          outcome: 'running' as const,
          expectedStatus: ev.expectedStatus,
          startedAt: new Date(ev.startedAt),
          line: ev.line,
          column: ev.column,
          annotations: ev.annotations,
          tags: lastBegin.get(testId)!.tags,
        })),
      )
      .onConflictDoUpdate({ target: [testResults.runId, testResults.testId], set: { tags: sql`excluded.tags` } })
      // `xmax = 0` holds for a freshly inserted row and not for one the conflict updated.
      .returning({ ...getTableColumns(testResults), inserted: sql<boolean>`(xmax = 0)` });
    for (const { inserted, ...row } of rows) byTest.set(row.testId, { row, isNew: inserted });
  }

  const unknown = [...new Set(ends.map((ev) => testsByKey.get(ev.testKey)!.id))].filter((id) => !byTest.has(id));
  if (unknown.length) {
    const rows = await tx
      .select()
      .from(testResults)
      .where(and(eq(testResults.runId, run.id), inArray(testResults.testId, unknown)));
    for (const row of rows) byTest.set(row.testId, { row, isNew: false });
    const missing = unknown.filter((id) => !byTest.has(id));
    if (missing.length) {
      const startedAt = new Map(ends.map((ev) => [testsByKey.get(ev.testKey)!.id, ev.startedAt]));
      const created = await tx
        .insert(testResults)
        .values(missing.map((testId) => ({ id: randomUUID(), runId: run.id, testId, projectId: project.id, shardIndex, startedAt: new Date(startedAt.get(testId)!) })))
        .returning();
      for (const row of created) byTest.set(row.testId, { row, isNew: true });
    }
  }
  return byTest;
}

/** Folds one attempt into its result, exactly as the per-row update used to. */
function applyAttempt(row: ResultRow, ev: AttemptEndEvent) {
  const firstError = ev.errors[0]?.message;
  const failedAttempt = ev.status === 'failed' || ev.status === 'timedOut' || ev.status === 'interrupted';
  row.outcome = ev.isFinal ? finalOutcome(ev) : 'running';
  row.attemptCount = Math.max(row.attemptCount, ev.retry + 1);
  row.durationMs = Math.min(MAX_DURATION_MS, row.durationMs + clampDuration(ev.durationMs));
  row.finishedAt = ev.isFinal ? new Date(new Date(ev.startedAt).getTime() + ev.durationMs) : null;
  row.annotations = ev.annotations;
  if (failedAttempt && firstError) {
    row.errorSignature = errorSignature(firstError);
    row.errorMessage = firstLine(firstError);
  }
}

/** One `update … from (values …)` for every result the batch changed. */
async function updateResults(tx: Tx, rows: ResultRow[]) {
  const values = sql.join(
    rows.map(
      (r) =>
        sql`(${r.id}::uuid, ${r.outcome}::test_outcome, ${r.attemptCount}::int, ${r.durationMs}::int, ${r.finishedAt ? r.finishedAt.toISOString() : null}::timestamptz, ${JSON.stringify(r.annotations)}::jsonb, ${r.errorSignature}::text, ${r.errorMessage}::text)`,
    ),
    sql`, `,
  );
  await tx.execute(sql`
    update ${testResults} as tr set
      outcome = v.outcome, attempt_count = v.attempt_count, duration_ms = v.duration_ms, finished_at = v.finished_at,
      annotations = v.annotations, error_signature = v.error_signature, error_message = v.error_message
    from (values ${values}) as v(id, outcome, attempt_count, duration_ms, finished_at, annotations, error_signature, error_message)
    where tr.id = v.id`);
}

/** Exported for the unit test: the precedence between Playwright's status and outcome. */
export function finalOutcome(ev: AttemptEndEvent): Outcome {
  if (ev.status === 'skipped' || ev.outcome === 'skipped') return 'skipped';
  if (ev.outcome === 'flaky') return 'flaky';
  if (ev.outcome === 'expected') return 'passed';
  if (ev.status === 'timedOut') return 'timedout';
  if (ev.status === 'interrupted') return 'interrupted';
  return 'failed';
}

// ---------------------------------------------------------------- uploads

export async function uploadInstructions(run: Run, attachmentIds: string[]): Promise<UploadInstruction[]> {
  const rows = await db.select().from(attachments).where(and(eq(attachments.runId, run.id), inArray(attachments.id, attachmentIds)));
  const storage = getStorage();
  return Promise.all(
    rows.map(async (a) => ({
      attachmentId: a.id,
      ...(await storage.createUpload(a.storageKey, { contentType: a.contentType, size: a.sizeBytes ?? undefined, attachmentId: a.id })),
    })),
  );
}

export async function getAttachmentForProject(project: TokenProject, attachmentId: string): Promise<Attachment> {
  const [row] = await db
    .select({ attachment: attachments })
    .from(attachments)
    .innerJoin(runs, eq(runs.id, attachments.runId))
    .where(and(eq(attachments.id, attachmentId), eq(runs.projectId, project.id)));
  if (!row) throw new IngestError(404, 'attachment not found');
  return row.attachment;
}

export async function storeUpload(attachment: Attachment, body: ReadableStream<Uint8Array> | null, contentType: string | null) {
  if (!body) throw new IngestError(400, 'empty body');
  const storage = getStorage();
  const { size } = await storage.put(attachment.storageKey, body, { contentType: contentType ?? attachment.contentType });
  await db.update(attachments).set({ status: 'uploaded', sizeBytes: size, storageDriver: storage.name }).where(eq(attachments.id, attachment.id));
  return size;
}

/**
 * The reporter's word that a presigned upload landed. The store is asked
 * rather than believed: the size comes from the stored object, and a missing
 * one stays pending.
 */
export async function completeUpload(attachment: Attachment, size?: number) {
  const storage = getStorage();
  const stored = await storage.head(attachment.storageKey);
  if (!stored) throw new IngestError(409, 'upload not found in storage');
  await db
    .update(attachments)
    .set({ status: 'uploaded', sizeBytes: stored.size ?? size ?? null })
    .where(eq(attachments.id, attachment.id));
}

// ---------------------------------------------------------------- finish

export async function finishRun(project: TokenProject, run: Run, body: RunFinish) {
  return db.transaction(async (tx) => {
    await tx
      .update(runShards)
      .set({ status: body.status, finishedAt: new Date(body.finishedAt), durationMs: clampDuration(body.durationMs) })
      .where(and(eq(runShards.runId, run.id), eq(runShards.shardIndex, body.shardIndex)));
    const [fresh] = await tx.select().from(runs).where(eq(runs.id, run.id)).for('update');
    const shards = await tx.select().from(runShards).where(eq(runShards.runId, run.id));
    const allDone = shards.length >= fresh.shardTotal && shards.every((s) => s.status !== 'running');
    await tx.insert(runEvents).values({ runId: run.id, projectId: project.id, type: 'shard.finished', payload: { shardIndex: body.shardIndex, status: body.status } });
    if (!allDone) {
      await tx.update(runs).set({ lastEventAt: new Date() }).where(eq(runs.id, run.id));
      return { runStatus: 'running' as const, url: runUrl(project, fresh.number) };
    }
    const status = await finalizeRun(tx, project, fresh, shards.map((s) => s.status));
    return { runStatus: status, url: runUrl(project, fresh.number) };
  });
}

async function finalizeRun(tx: Tx, project: TokenProject, run: Run, shardStatuses: string[]) {
  await settleOpenResults(tx, run.id);
  const [agg] = await tx
    .select({
      failed: sql<number>`count(*) filter (where ${testResults.outcome} in ('failed','timedout'))`.mapWith(Number),
      interrupted: sql<number>`count(*) filter (where ${testResults.outcome} = 'interrupted')`.mapWith(Number),
      maxFinished: sql<string | null>`max(${testResults.finishedAt})`,
    })
    .from(testResults)
    .where(eq(testResults.runId, run.id));
  let status: Run['status'] = 'passed';
  if (agg.failed > 0 || shardStatuses.includes('failed')) status = 'failed';
  else if (shardStatuses.includes('timedout')) status = 'timedout';
  else if (agg.interrupted > 0 || shardStatuses.includes('interrupted')) status = 'interrupted';
  const finishedAt = new Date();
  await tx
    .update(runs)
    .set({ status, finishedAt, durationMs: clampDuration(finishedAt.getTime() - run.startedAt.getTime()), lastEventAt: finishedAt })
    .where(eq(runs.id, run.id));
  await tx.insert(runEvents).values({ runId: run.id, projectId: project.id, type: 'run.finished', payload: { status } });
  return status;
}

/**
 * Results still marked `running` when a run ends: derive the outcome from the last recorded
 * attempt (Playwright sometimes skips retries, e.g. for a missing screenshot baseline); results
 * without any attempt were cut off and become `interrupted`.
 */
async function settleOpenResults(tx: Tx | typeof db, runId: string) {
  await tx.execute(sql`
    update ${testResults} tr
    set outcome = (case la.status
        when 'passed' then (case when tr.attempt_count > 1 then 'flaky' else 'passed' end)
        when 'timedOut' then 'timedout'
        when 'skipped' then 'skipped'
        when 'interrupted' then 'interrupted'
        else 'failed' end)::test_outcome,
      finished_at = coalesce(tr.finished_at, la.started_at + make_interval(secs => la.duration_ms / 1000.0))
    from (select distinct on (test_result_id) test_result_id, status, started_at, duration_ms
          from ${testAttempts} order by test_result_id, retry desc) la
    where la.test_result_id = tr.id and tr.run_id = ${runId} and tr.outcome = 'running'`);
  await tx
    .update(testResults)
    .set({ outcome: 'interrupted' })
    .where(and(eq(testResults.runId, runId), eq(testResults.outcome, 'running')));
}

/** Marks runs that stopped reporting as incomplete. Called lazily from read paths. */
export async function markStaleRuns(projectId: string) {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const stale = await db
    .update(runs)
    .set({ status: 'incomplete', finishedAt: sql`${runs.lastEventAt}` })
    .where(and(eq(runs.projectId, projectId), eq(runs.status, 'running'), lt(runs.lastEventAt, cutoff)))
    .returning({ id: runs.id });
  if (stale.length) {
    for (const s of stale) await settleOpenResults(db, s.id);
    await db.insert(runEvents).values(stale.map((s) => ({ runId: s.id, projectId, type: 'run.finished', payload: { status: 'incomplete' } })));
  }
}

/**
 * Events are read half a second behind their transaction's start. Ids come
 * from a sequence, so two concurrent ingest transactions can commit out of id
 * order; a reader that jumped its cursor past a later id would never see the
 * earlier one. `created_at` is the transaction start, and an ingest
 * transaction is far shorter than the lag.
 */
const VISIBILITY_LAG = sql`now() - interval '500 milliseconds'`;

export async function eventsSince(runId: string, afterId: number, limit = 500) {
  return db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.id, afterId), lte(runEvents.createdAt, VISIBILITY_LAG)))
    .orderBy(runEvents.id)
    .limit(limit);
}

export async function projectEventsSince(projectId: string, afterId: number, limit = 500) {
  return db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.projectId, projectId), gt(runEvents.id, afterId), lte(runEvents.createdAt, VISIBILITY_LAG)))
    .orderBy(runEvents.id)
    .limit(limit);
}
