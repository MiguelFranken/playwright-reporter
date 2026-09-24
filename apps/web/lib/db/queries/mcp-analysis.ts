/**
 * The history the MCP debug tools reason over: executions with their commit,
 * same-commit conflicts, signature novelty, and a run-to-run diff. Every query
 * is bounded by a run id or by (test id, started_at), which the existing
 * indexes cover. Ids only; access is decided before these are called.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { attachments, runs, testAttempts, testResults, tests } from '@/lib/db/schema';
import { num } from './shared';

export interface TestExecution {
  resultId: string;
  runId: string;
  runNumber: number;
  startedAt: Date;
  outcome: string;
  attemptCount: number;
  durationMs: number;
  signature: string | null;
  errorMessage: string | null;
  branch: string | null;
  environment: string | null;
  sha: string | null;
  shortSha: string | null;
  author: string | null;
  message: string | null;
}

/** A test's executions, newest first, optionally on one branch and after a moment. */
export async function testExecutions(
  testId: string,
  opts: { since?: Date; after?: Date; branch?: string | null; limit?: number } = {},
): Promise<TestExecution[]> {
  const rows = await db
    .select({
      resultId: testResults.id,
      runId: runs.id,
      runNumber: runs.number,
      startedAt: runs.startedAt,
      outcome: testResults.outcome,
      attemptCount: testResults.attemptCount,
      durationMs: testResults.durationMs,
      signature: testResults.errorSignature,
      errorMessage: testResults.errorMessage,
      branch: runs.gitBranch,
      environment: runs.environment,
      sha: runs.gitSha,
      shortSha: runs.gitShortSha,
      author: runs.gitAuthorName,
      message: runs.gitMessage,
    })
    .from(testResults)
    .innerJoin(runs, eq(runs.id, testResults.runId))
    .where(
      and(
        eq(testResults.testId, testId),
        sql`${testResults.outcome} <> 'running'`,
        opts.since ? sql`${runs.startedAt} >= ${opts.since.toISOString()}` : undefined,
        opts.after ? sql`${runs.startedAt} > ${opts.after.toISOString()}` : undefined,
        opts.branch ? eq(runs.gitBranch, opts.branch) : undefined,
      ),
    )
    .orderBy(desc(runs.startedAt))
    .limit(opts.limit ?? 200);
  return rows;
}

/** Commits on which the test both passed and failed: the strongest flakiness signal. */
export async function sameCommitConflicts(testId: string, since: Date, branch?: string | null) {
  const rows = await db.execute<Record<string, unknown>>(
    sql`select r.git_sha as sha,
               count(*) filter (where tr.outcome = 'passed')::int as passed,
               count(*) filter (where tr.outcome in ('failed','timedout'))::int as failed,
               count(*) filter (where tr.outcome = 'flaky')::int as flaky,
               array_agg(r.number order by r.started_at) as run_numbers
        from ${testResults} tr join ${runs} r on r.id = tr.run_id
        where tr.test_id = ${testId} and r.started_at >= ${since.toISOString()} and r.git_sha is not null
          ${branch ? sql`and r.git_branch = ${branch}` : sql``}
        group by r.git_sha
        having count(*) filter (where tr.outcome in ('passed','flaky')) > 0
           and count(*) filter (where tr.outcome in ('failed','timedout')) > 0
        order by max(r.started_at) desc`,
  );
  return Array.from(rows).map((r) => ({
    sha: String(r.sha),
    passed: num(r.passed),
    failed: num(r.failed),
    flaky: num(r.flaky),
    runNumbers: ((r.run_numbers as unknown[]) ?? []).map(num),
  }));
}

/** Outcomes of the same test in the other browser projects of one run. */
export async function siblingsInRun(runId: string, test: { id: string; file: string; title: string; projectId: string }) {
  return db
    .select({ testId: tests.id, browser: tests.pwProject, outcome: testResults.outcome, resultId: testResults.id })
    .from(testResults)
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .where(
      and(
        eq(testResults.runId, runId),
        eq(tests.projectId, test.projectId),
        eq(tests.file, test.file),
        eq(tests.title, test.title),
        sql`${tests.id} <> ${test.id}`,
      ),
    );
}

/** How many other tests in a run fail with this signature, with a few titles. */
export async function sameErrorInRun(runId: string, signature: string, excludeTestId: string) {
  const rows = await db
    .select({ title: tests.title })
    .from(testResults)
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .where(and(eq(testResults.runId, runId), eq(testResults.errorSignature, signature), sql`${testResults.testId} <> ${excludeTestId}`));
  return { count: rows.length, titles: rows.slice(0, 3).map((r) => r.title) };
}

/** Branches and runs in which a signature showed up recently. */
export async function signatureSpread(projectId: string, signature: string, since: Date) {
  const [row] = await db
    .select({
      branches: sql<number>`count(distinct ${runs.gitBranch})::int`,
      runs: sql<number>`count(distinct ${runs.id})::int`,
      tests: sql<number>`count(distinct ${testResults.testId})::int`,
    })
    .from(testResults)
    .innerJoin(runs, eq(runs.id, testResults.runId))
    .where(and(eq(testResults.projectId, projectId), eq(testResults.errorSignature, signature), sql`${runs.startedAt} >= ${since.toISOString()}`));
  return { branches: num(row?.branches), runs: num(row?.runs), tests: num(row?.tests) };
}

/**
 * For each signature: was it seen before `before` on the run's branch, and on
 * the base branch? That turns a list of failures into "new" versus "already
 * failing on main".
 */
export async function signatureNovelty(
  projectId: string,
  signatures: string[],
  opts: { runBranch: string | null; baseBranch: string; since: Date; before: Date },
) {
  if (signatures.length === 0) return new Map<string, { onBranch: number; onBase: number; firstSeen: Date | null }>();
  const rows = await db.execute<Record<string, unknown>>(
    sql`select tr.error_signature as signature,
               count(distinct r.id) filter (where r.git_branch is not distinct from ${opts.runBranch})::int as on_branch,
               count(distinct r.id) filter (where r.git_branch = ${opts.baseBranch})::int as on_base,
               min(r.started_at) as first_seen
        from ${testResults} tr join ${runs} r on r.id = tr.run_id
        where tr.project_id = ${projectId}
          and tr.error_signature in (${sql.join(signatures.map((s) => sql`${s}`), sql`, `)})
          and r.started_at >= ${opts.since.toISOString()} and r.started_at < ${opts.before.toISOString()}
        group by tr.error_signature`,
  );
  return new Map(
    Array.from(rows).map((r) => [
      String(r.signature),
      { onBranch: num(r.on_branch), onBase: num(r.on_base), firstSeen: r.first_seen ? new Date(r.first_seen as string) : null },
    ]),
  );
}

/** Every test of two runs side by side (full outer join on the test). */
export async function diffRunRows(baseRunId: string, headRunId: string) {
  const rows = await db.execute<Record<string, unknown>>(
    sql`select coalesce(h.test_id, b.test_id) as test_id, t.title, t.title_path, t.file, t.pw_project,
               b.outcome as base_outcome, h.outcome as head_outcome,
               b.error_signature as base_sig, h.error_signature as head_sig,
               b.duration_ms as base_ms, h.duration_ms as head_ms,
               h.id as head_result_id, h.error_message as head_error
        from (select * from ${testResults} where run_id = ${baseRunId}) b
        full outer join (select * from ${testResults} where run_id = ${headRunId}) h on h.test_id = b.test_id
        join ${tests} t on t.id = coalesce(h.test_id, b.test_id)
        order by t.file, t.title, t.pw_project`,
  );
  return Array.from(rows).map((r) => ({
    testId: String(r.test_id),
    title: ((r.title_path as string[] | null)?.length ? (r.title_path as string[]).join(' › ') : String(r.title)),
    file: String(r.file),
    browser: String(r.pw_project),
    baseOutcome: (r.base_outcome as string | null) ?? null,
    headOutcome: (r.head_outcome as string | null) ?? null,
    baseSignature: (r.base_sig as string | null) ?? null,
    headSignature: (r.head_sig as string | null) ?? null,
    baseMs: r.base_ms === null || r.base_ms === undefined ? null : num(r.base_ms),
    headMs: r.head_ms === null || r.head_ms === undefined ? null : num(r.head_ms),
    headResultId: (r.head_result_id as string | null) ?? null,
    headError: (r.head_error as string | null) ?? null,
  }));
}

/** The newest execution of a test that failed or flaked since `since`. */
export async function latestProblemResult(testId: string, since: Date) {
  const [row] = await db
    .select({ resultId: testResults.id, runNumber: runs.number })
    .from(testResults)
    .innerJoin(runs, eq(runs.id, testResults.runId))
    .where(and(eq(testResults.testId, testId), sql`${testResults.outcome} in ('failed','timedout','flaky')`, sql`${runs.startedAt} >= ${since.toISOString()}`))
    .orderBy(desc(runs.startedAt))
    .limit(1);
  return row ?? null;
}

/** An attachment with its attempt, result and run, scoped to a project. */
export async function getAttachmentInProject(projectId: string, attachmentId: string) {
  const [row] = await db
    .select({
      attachment: attachments,
      retry: testAttempts.retry,
      resultId: testResults.id,
      testTitle: tests.title,
      runNumber: runs.number,
    })
    .from(attachments)
    .innerJoin(testAttempts, eq(testAttempts.id, attachments.attemptId))
    .innerJoin(testResults, eq(testResults.id, testAttempts.testResultId))
    .innerJoin(tests, eq(tests.id, testResults.testId))
    .innerJoin(runs, eq(runs.id, attachments.runId))
    .where(and(eq(attachments.id, attachmentId), eq(runs.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

/** The attachments of a result's attempts, newest attempt first. */
export async function attachmentsOfResult(resultId: string) {
  return db
    .select({ attachment: attachments, retry: testAttempts.retry, attemptStatus: testAttempts.status })
    .from(attachments)
    .innerJoin(testAttempts, eq(testAttempts.id, attachments.attemptId))
    .where(eq(testAttempts.testResultId, resultId))
    .orderBy(desc(testAttempts.retry), attachments.createdAt);
}
