import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { attachments, runEvents, runShards, runs, testAttempts, testResults, tests, type Attachment, type Run, type RunShard, type TestAttempt } from '@/lib/db/schema';
import { markStaleRuns } from '@/lib/ingest/service';
import { andAll, num, sinceDate } from './shared';

/**
 * The row shapes live in `@miguelfranken/ui`, next to the components that render them,
 * and are re-exported here so the existing call sites keep working. The point
 * of the direction is that every SQL projection below is now checked against
 * what the UI actually reads, rather than the UI being shaped by the schema.
 */
import type { RunCounts } from '@miguelfranken/ui/patterns/counts-bar';
import type { ErrorGroup } from '@miguelfranken/ui/views/run/run-errors';
import type { RunResultRow } from '@miguelfranken/ui/views/run/run-result';
import type { SpecSummary } from '@miguelfranken/ui/views/run/run-specs';
import type { HistoryRow } from '@miguelfranken/ui/views/explorer/test-overview';

export type { ErrorGroup, HistoryRow, RunCounts, RunResultRow, SpecSummary };

export type RunWithCounts = Run & { counts: RunCounts };

/** Drizzle's postgres-js driver returns non-column JSON as text; normalize. */
function parseCounts(v: unknown): RunCounts {
  const c = (typeof v === 'string' ? JSON.parse(v) : v) as Partial<RunCounts> | null;
  return {
    total: c?.total ?? 0,
    passed: c?.passed ?? 0,
    failed: c?.failed ?? 0,
    flaky: c?.flaky ?? 0,
    skipped: c?.skipped ?? 0,
    interrupted: c?.interrupted ?? 0,
    running: c?.running ?? 0,
  };
}

const countsSql = sql<RunCounts>`(
  select json_build_object(
    'total', count(*)::int,
    'passed', count(*) filter (where tr.outcome = 'passed')::int,
    'failed', count(*) filter (where tr.outcome in ('failed','timedout'))::int,
    'flaky', count(*) filter (where tr.outcome = 'flaky')::int,
    'skipped', count(*) filter (where tr.outcome = 'skipped')::int,
    'interrupted', count(*) filter (where tr.outcome = 'interrupted')::int,
    'running', count(*) filter (where tr.outcome = 'running')::int
  ) from ${testResults} tr where tr.run_id = ${sql.raw('"runs"."id"')}
)`;

/**
 * The newest event id a view's data already reflects. The live views apply
 * every later event on top, so for the ones that keep running totals (counts,
 * spec tallies, error groups) it has to come from the *same statement* as the
 * totals: a separate query could land on either side of a commit and have an
 * event counted twice or not at all. A statement sees one snapshot.
 */
const runCursorSql = (runId: SQL | string) =>
  sql<number>`(select coalesce(max(${runEvents.id}), 0)::bigint from ${runEvents} where ${runEvents.runId} = ${runId})`.mapWith(Number);

/**
 * An empty result has no row to carry the cursor, so these are read *before*
 * the view's query. An earlier cursor is exact for an empty snapshot: had any
 * event after it touched the view's data, the snapshot would not be empty.
 */
async function runCursorBefore(runId: string) {
  const [row] = await db.select({ cursor: runCursorSql(runId) }).from(sql`(select 1) as one`);
  return row?.cursor ?? 0;
}

/**
 * A project page's stream starts here. Rows carry their own run's cursor
 * (a project-wide maximum is not ordered across runs ingesting at once), so
 * replaying from this earlier point counts nothing twice.
 */
async function projectCursorBefore(projectId: string) {
  // Read as far behind as the stream reads (see `eventsSince`): across runs,
  // ids commit out of order, and starting past one would skip it.
  const [row] = await db
    .select({
      cursor: sql<number>`(select coalesce(max(${runEvents.id}), 0)::bigint from ${runEvents}
        where ${runEvents.projectId} = ${projectId} and ${runEvents.createdAt} <= now() - interval '500 milliseconds')`.mapWith(Number),
    })
    .from(sql`(select 1) as one`);
  return row?.cursor ?? 0;
}

export interface RunFilters {
  status?: string;
  branch?: string;
  environment?: string;
  q?: string;
  days?: number;
  page?: number;
  pageSize?: number;
}

export async function listRuns(projectId: string, filters: RunFilters = {}) {
  await markStaleRuns(projectId);
  const pageSize = filters.pageSize ?? 25;
  const page = filters.page ?? 1;
  const where = andAll([
    eq(runs.projectId, projectId),
    filters.status && filters.status !== 'all' ? sql`${runs.status} = ${filters.status}` : undefined,
    filters.branch ? eq(runs.gitBranch, filters.branch) : undefined,
    filters.environment ? eq(runs.environment, filters.environment) : undefined,
    filters.days ? sql`${runs.startedAt} >= ${sinceDate(filters.days)}` : undefined,
    filters.q
      ? sql`(${runs.gitMessage} ilike ${'%' + filters.q + '%'} or ${runs.gitBranch} ilike ${'%' + filters.q + '%'} or ${runs.number}::text = ${filters.q.replace(/^#/, '')} or ${runs.gitShortSha} ilike ${filters.q + '%'})`
      : undefined,
  ]);
  const cursor = await projectCursorBefore(projectId);
  const rows = await db
    .select({ run: runs, counts: countsSql, cursor: runCursorSql(sql.raw('"runs"."id"')) })
    .from(runs)
    .where(where)
    .orderBy(desc(runs.startedAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(runs).where(where);
  return {
    cursor,
    rows: rows.slice(0, pageSize).map((r) => ({ ...r.run, counts: parseCounts(r.counts), cursor: r.cursor }) as RunWithCounts & { cursor: number }),
    hasMore: rows.length > pageSize,
    total: num(total),
    page,
    pageSize,
  };
}

export async function listActiveRuns(projectId: string) {
  return (await listActiveRunsWithCursor(projectId)).runs;
}

export async function listActiveRunsWithCursor(projectId: string) {
  await markStaleRuns(projectId);
  const cursor = await projectCursorBefore(projectId);
  const rows = await db
    .select({ run: runs, counts: countsSql, cursor: runCursorSql(sql.raw('"runs"."id"')) })
    .from(runs)
    .where(and(eq(runs.projectId, projectId), eq(runs.status, 'running')))
    .orderBy(desc(runs.startedAt))
    .limit(10);
  const withShards = await Promise.all(
    rows.map(async (r) => ({
      ...r.run,
      counts: parseCounts(r.counts),
      cursor: r.cursor,
      shards: await db.select().from(runShards).where(eq(runShards.runId, r.run.id)).orderBy(asc(runShards.shardIndex)),
    })),
  );
  return {
    runs: withShards as (RunWithCounts & { shards: RunShard[]; cursor: number })[],
    cursor,
  };
}

export async function getRunByNumber(projectId: string, number: number) {
  await markStaleRuns(projectId);
  const [row] = await db
    .select({ run: runs, counts: countsSql, cursor: runCursorSql(sql.raw('"runs"."id"')) })
    .from(runs)
    .where(and(eq(runs.projectId, projectId), eq(runs.number, number)));
  if (!row) return null;
  const shards = await db.select().from(runShards).where(eq(runShards.runId, row.run.id)).orderBy(asc(runShards.shardIndex));
  return { ...row.run, counts: parseCounts(row.counts), shards, cursor: row.cursor } as RunWithCounts & { shards: RunShard[]; cursor: number };
}


export interface RunResultFilters {
  /** Exactly these results — how the live views fetch rows they only know from an event. */
  ids?: string[];
  outcome?: string;
  q?: string;
  file?: string;
  signature?: string;
}

export async function listRunResults(runId: string, filters: RunResultFilters = {}): Promise<RunResultRow[]> {
  const where = andAll([
    eq(testResults.runId, runId),
    filters.ids ? inArray(testResults.id, filters.ids) : undefined,
    filters.outcome && filters.outcome !== 'all'
      ? filters.outcome === 'failed'
        ? sql`${testResults.outcome} in ('failed','timedout','interrupted')`
        : sql`${testResults.outcome} = ${filters.outcome}`
      : undefined,
    filters.q ? sql`(${tests.title} ilike ${'%' + filters.q + '%'} or ${tests.file} ilike ${'%' + filters.q + '%'})` : undefined,
    filters.file ? eq(tests.file, filters.file) : undefined,
    filters.signature ? eq(testResults.errorSignature, filters.signature) : undefined,
  ]);
  const rows = await db
    .select({
      id: testResults.id,
      testId: testResults.testId,
      outcome: testResults.outcome,
      durationMs: testResults.durationMs,
      attemptCount: testResults.attemptCount,
      errorMessage: testResults.errorMessage,
      errorSignature: testResults.errorSignature,
      annotations: testResults.annotations,
      tags: testResults.tags,
      title: tests.title,
      titlePath: tests.titlePath,
      file: tests.file,
      pwProject: tests.pwProject,
      line: testResults.line,
      history: sql<string[]>`(
        select coalesce(array_agg(h.outcome::text order by h.started_at desc), '{}')
        from (select outcome, started_at from ${testResults} h
              where h.test_id = ${sql.raw('"test_results"."test_id"')} and h.started_at < ${sql.raw('"test_results"."started_at"')} and h.outcome <> 'running'
              order by h.started_at desc limit 10) h)`,
      attachmentKinds: sql<string[]>`(
        select coalesce(array_agg(distinct a.kind::text), '{}') from ${attachments} a
        join ${testAttempts} ta on ta.id = a.attempt_id where ta.test_result_id = ${sql.raw('"test_results"."id"')} and a.status = 'uploaded')`,
    })
    .from(testResults)
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .where(where)
    .orderBy(
      sql`case ${testResults.outcome} when 'failed' then 0 when 'timedout' then 0 when 'interrupted' then 1 when 'flaky' then 2 when 'running' then 3 when 'passed' then 4 else 5 end`,
      asc(tests.file),
      asc(tests.title),
      asc(tests.pwProject),
    );
  return rows as RunResultRow[];
}


export async function listRunSpecs(runId: string): Promise<SpecSummary[]> {
  return (await listRunSpecsWithCursor(runId)).specs;
}

export async function listRunSpecsWithCursor(runId: string): Promise<{ specs: SpecSummary[]; cursor: number }> {
  const before = await runCursorBefore(runId);
  const rows = await db
    .select({
      cursor: runCursorSql(runId),
      file: tests.file,
      total: sql<number>`count(*)::int`,
      passed: sql<number>`count(*) filter (where ${testResults.outcome} = 'passed')::int`,
      failed: sql<number>`count(*) filter (where ${testResults.outcome} in ('failed','timedout','interrupted'))::int`,
      flaky: sql<number>`count(*) filter (where ${testResults.outcome} = 'flaky')::int`,
      skipped: sql<number>`count(*) filter (where ${testResults.outcome} = 'skipped')::int`,
      running: sql<number>`count(*) filter (where ${testResults.outcome} = 'running')::int`,
      durationMs: sql<number>`coalesce(sum(${testResults.durationMs}), 0)::int`,
    })
    .from(testResults)
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .where(eq(testResults.runId, runId))
    .groupBy(tests.file)
    .orderBy(asc(tests.file));
  return {
    specs: rows.map(({ cursor: _cursor, ...spec }) => spec),
    cursor: rows[0]?.cursor ?? before,
  };
}


export async function listRunErrorGroups(runId: string): Promise<ErrorGroup[]> {
  return (await listRunErrorGroupsWithCursor(runId)).groups;
}

export async function listRunErrorGroupsWithCursor(runId: string): Promise<{ groups: ErrorGroup[]; cursor: number }> {
  const before = await runCursorBefore(runId);
  const rows = await db
    .select({
      cursor: runCursorSql(runId),
      signature: testResults.errorSignature,
      message: sql<string>`min(${testResults.errorMessage})`,
      count: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${testResults.outcome} in ('failed','timedout','interrupted'))::int`,
      flaky: sql<number>`count(*) filter (where ${testResults.outcome} = 'flaky')::int`,
      files: sql<string[]>`array_agg(distinct ${tests.file})`,
      sampleResultId: sql<string>`(array_agg(${testResults.id} order by ${tests.file}))[1]`,
    })
    .from(testResults)
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .where(and(eq(testResults.runId, runId), sql`${testResults.errorSignature} is not null`))
    .groupBy(testResults.errorSignature)
    .orderBy(desc(sql`count(*)`));
  return {
    groups: rows.filter((r) => r.signature).map(({ cursor: _cursor, ...group }) => group) as ErrorGroup[],
    cursor: rows[0]?.cursor ?? before,
  };
}

export type AttemptWithAttachments = TestAttempt & { attachments: Attachment[] };

export async function getResultDetail(projectId: string, runNumber: number, resultId: string) {
  const [row] = await db
    .select({ result: testResults, test: tests, run: runs })
    .from(testResults)
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .innerJoin(runs, eq(runs.id, testResults.runId))
    .where(and(eq(testResults.id, resultId), eq(runs.projectId, projectId), eq(runs.number, runNumber)));
  if (!row) return null;
  const attempts = await db.select().from(testAttempts).where(eq(testAttempts.testResultId, resultId)).orderBy(asc(testAttempts.retry));
  const atts = attempts.length
    ? await db
        .select()
        .from(attachments)
        .where(sql`${attachments.attemptId} in ${sql`(${sql.join(attempts.map((a) => sql`${a.id}`), sql`, `)})`}`)
        .orderBy(asc(attachments.createdAt))
    : [];
  const attemptsWithAttachments: AttemptWithAttachments[] = attempts.map((a) => ({
    ...a,
    attachments: atts.filter((x) => x.attemptId === a.id),
  }));
  // Prev/next within the run using the same ordering as the summary table.
  const ordered = await db
    .select({ id: testResults.id })
    .from(testResults)
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .where(eq(testResults.runId, row.run.id))
    .orderBy(
      sql`case ${testResults.outcome} when 'failed' then 0 when 'timedout' then 0 when 'interrupted' then 1 when 'flaky' then 2 when 'running' then 3 when 'passed' then 4 else 5 end`,
      asc(tests.file),
      asc(tests.title),
      asc(tests.pwProject),
    );
  const idx = ordered.findIndex((o) => o.id === resultId);
  return {
    result: row.result,
    test: row.test,
    run: row.run,
    attempts: attemptsWithAttachments,
    position: { index: idx, total: ordered.length, prevId: ordered[idx - 1]?.id ?? null, nextId: ordered[idx + 1]?.id ?? null },
  };
}


export async function testHistory(testId: string, opts: { branch?: string | null; limit?: number } = {}): Promise<HistoryRow[]> {
  const parts: SQL[] = [eq(testResults.testId, testId), sql`${testResults.outcome} <> 'running'`];
  if (opts.branch) parts.push(eq(runs.gitBranch, opts.branch));
  const rows = await db
    .select({
      resultId: testResults.id,
      runId: runs.id,
      runNumber: runs.number,
      startedAt: testResults.startedAt,
      outcome: testResults.outcome,
      durationMs: testResults.durationMs,
      attemptCount: testResults.attemptCount,
      branch: runs.gitBranch,
      environment: runs.environment,
      executor: runs.executor,
      errorMessage: testResults.errorMessage,
      gitShortSha: runs.gitShortSha,
    })
    .from(testResults)
    .innerJoin(runs, eq(runs.id, testResults.runId))
    .where(andAll(parts))
    .orderBy(desc(testResults.startedAt))
    .limit(opts.limit ?? 50);
  return rows;
}

export async function listBranches(projectId: string) {
  const rows = await db
    .selectDistinct({ branch: runs.gitBranch })
    .from(runs)
    .where(and(eq(runs.projectId, projectId), sql`${runs.gitBranch} is not null`))
    .orderBy(asc(runs.gitBranch));
  return rows.map((r) => r.branch!).filter(Boolean);
}

export async function listEnvironments(projectId: string) {
  const rows = await db
    .selectDistinct({ env: runs.environment })
    .from(runs)
    .where(and(eq(runs.projectId, projectId), sql`${runs.environment} is not null`))
    .orderBy(asc(runs.environment));
  return rows.map((r) => r.env!).filter(Boolean);
}

export async function listPlatforms(projectId: string) {
  const rows = await db.selectDistinct({ p: tests.pwProject }).from(tests).where(eq(tests.projectId, projectId)).orderBy(asc(tests.pwProject));
  return rows.map((r) => r.p).filter(Boolean);
}

export async function listTestTags(projectId: string) {
  const rows = await db.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from ${tests} where project_id = ${projectId} order by 1`);
  return Array.from(rows).map((r) => r.tag);
}
