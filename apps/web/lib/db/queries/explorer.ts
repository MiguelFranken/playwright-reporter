import { eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { runs, testResults, tests } from '@/lib/db/schema';
import { CHRONIC_FAILURE_RATE, CHRONIC_MIN_RUNS, CHRONIC_STREAK } from '@/lib/metrics/score';
import { andAll, num, reliabilitySql, sinceDate } from './shared';
import { testHistory, type HistoryRow } from './runs';

/** Declared by the views that render them; see `@miguelfranken/ui/views/explorer`. */
import type { ExplorerRow } from '@miguelfranken/ui/views/explorer/explorer-table';
import type { EnvironmentStat, TestOverviewStats, UniqueError } from '@miguelfranken/ui/views/explorer/test-overview';
// The sort vocabulary is plain data and lives outside the client component, or
// it would reach this server module as a client reference rather than an array.
import { EXPLORER_SORTS, type ExplorerSort } from '@miguelfranken/ui/lib/explorer-sort';

export { EXPLORER_SORTS };
export type { ExplorerRow, ExplorerSort, UniqueError };


export interface ExplorerFilters {
  q?: string;
  days: number;
  tags?: string[];
  platform?: string;
  environment?: string;
  status?: string; // flaky | chronic | stable | passed | failed | skipped
  sort?: ExplorerSort;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}


const sortSql: Record<ExplorerSort, string> = {
  lastRun: 'last_run_at',
  title: 'title',
  reliability: 'reliability',
  flakyRate: 'flaky_rate',
  failureRate: 'failure_rate',
  runs: 'runs',
  avgDuration: 'avg_duration_ms',
};

function isValidRegex(q: string) {
  try {
    new RegExp(q);
    return true;
  } catch {
    return false;
  }
}

export async function exploreTests(projectId: string, f: ExplorerFilters) {
  const pageSize = f.pageSize ?? 50;
  const page = f.page ?? 1;
  const since = sinceDate(f.days);
  const runWhere = andAll([
    sql`r.project_id = ${projectId}`,
    sql`r.started_at >= ${since}`,
    f.environment ? sql`r.environment = ${f.environment}` : undefined,
  ]);
  const testWhere: SQL[] = [sql`t.project_id = ${projectId}`];
  if (f.platform) testWhere.push(sql`t.pw_project = ${f.platform}`);
  // One bound parameter per tag: the postgres-js driver sends a JS array as a
  // bare string, which Postgres then rejects as a malformed array literal.
  if (f.tags?.length) {
    testWhere.push(sql`t.tags && array[${sql.join(f.tags.map((tag) => sql`${tag}`), sql`, `)}]::text[]`);
  }
  if (f.q) {
    testWhere.push(
      isValidRegex(f.q)
        ? sql`(t.title ~* ${f.q} or t.file ~* ${f.q})`
        : sql`(t.title ilike ${'%' + f.q + '%'} or t.file ilike ${'%' + f.q + '%'})`,
    );
  }
  const statusHaving: Record<string, SQL> = {
    flaky: sql`flaky > 0`,
    chronic: sql`(streak >= ${CHRONIC_STREAK} or (runs >= ${CHRONIC_MIN_RUNS} and failure_rate >= ${CHRONIC_FAILURE_RATE}))`,
    stable: sql`failed = 0 and flaky = 0`,
    passed: sql`last_outcome = 'passed'`,
    failed: sql`last_outcome in ('failed','timedout','interrupted')`,
    skipped: sql`last_outcome = 'skipped'`,
  };
  const outerWhere = f.status && statusHaving[f.status] ? statusHaving[f.status] : sql`true`;
  const sortCol = sortSql[f.sort ?? 'lastRun'];
  const dir = f.dir === 'asc' ? sql`asc` : sql`desc`;
  const nulls = f.dir === 'asc' ? sql`nulls first` : sql`nulls last`;

  const body = sql`
    with res as (
      select tr.test_id, tr.outcome, tr.started_at, tr.duration_ms, r.number, r.git_branch,
             row_number() over (partition by tr.test_id order by tr.started_at desc) as rn
      from ${testResults} tr join ${runs} r on r.id = tr.run_id
      where ${runWhere} and tr.outcome <> 'running'
    ),
    agg as (
      select t.id as test_id, t.title, t.title_path, t.file, t.pw_project, t.tags,
             count(*)::int as runs,
             count(*) filter (where res.outcome = 'passed')::int as passed,
             count(*) filter (where res.outcome in ('failed','timedout'))::int as failed,
             count(*) filter (where res.outcome = 'flaky')::int as flaky,
             count(*) filter (where res.outcome = 'skipped')::int as skipped,
             count(*) filter (where res.outcome not in ('skipped'))::int as non_skipped,
             case when count(*) filter (where res.outcome <> 'skipped') = 0 then 0
                  else count(*) filter (where res.outcome in ('failed','timedout'))::float / count(*) filter (where res.outcome <> 'skipped') end as failure_rate,
             case when count(*) filter (where res.outcome <> 'skipped') = 0 then 0
                  else count(*) filter (where res.outcome = 'flaky')::float / count(*) filter (where res.outcome <> 'skipped') end as flaky_rate,
             ${reliabilitySql(
               sql`count(*) filter (where res.outcome <> 'skipped')`,
               sql`count(*) filter (where res.outcome in ('failed','timedout'))`,
               sql`count(*) filter (where res.outcome = 'flaky')`,
             )} as reliability,
             coalesce(min(res.rn) filter (where res.outcome not in ('failed','timedout')) - 1, count(*))::int as streak,
             (array_agg(res.outcome order by res.started_at desc))[1] as last_outcome,
             max(res.started_at) as last_run_at,
             (array_agg(res.number order by res.started_at desc))[1] as last_run_number,
             (array_agg(res.git_branch order by res.started_at desc))[1] as last_branch,
             avg(res.duration_ms) filter (where res.outcome = 'passed') as avg_duration_ms
      from ${tests} t join res on res.test_id = t.id
      where ${andAll(testWhere)}
      group by t.id
    )
    select * from agg where ${outerWhere}`;

  const [rows, [{ total }]] = await Promise.all([
    db.execute<Record<string, unknown>>(
      sql`${body} order by ${sql.raw(sortCol)} ${dir} ${nulls}, title asc limit ${pageSize} offset ${(page - 1) * pageSize}`,
    ),
    db.execute<{ total: string }>(sql`select count(*) as total from (${body}) c`),
  ]);
  return {
    rows: Array.from(rows).map(
      (r): ExplorerRow => ({
        testId: String(r.test_id),
        title: String(r.title),
        titlePath: (r.title_path as string[]) ?? [],
        file: String(r.file),
        pwProject: String(r.pw_project),
        tags: (r.tags as string[]) ?? [],
        lastOutcome: String(r.last_outcome),
        lastRunAt: new Date(r.last_run_at as string),
        lastRunNumber: num(r.last_run_number),
        lastBranch: (r.last_branch as string | null) ?? null,
        runs: num(r.runs),
        passed: num(r.passed),
        failed: num(r.failed),
        flaky: num(r.flaky),
        skipped: num(r.skipped),
        flakyRate: num(r.flaky_rate),
        failureRate: num(r.failure_rate),
        reliability: r.reliability === null ? null : num(r.reliability),
        avgDurationMs: r.avg_duration_ms === null ? null : num(r.avg_duration_ms),
        streak: num(r.streak),
      }),
    ),
    total: num(total),
    page,
    pageSize,
  };
}


export interface TestOverview {
  test: typeof tests.$inferSelect;
  history: HistoryRow[];
  errors: UniqueError[];
  stats: TestOverviewStats;
  environments: EnvironmentStat[];
  siblings: { testId: string; pwProject: string }[];
}

export async function getTestOverview(projectId: string, testId: string, days: number): Promise<TestOverview | null> {
  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test || test.projectId !== projectId) return null;
  const since = sinceDate(days);
  const [history, errorRows, statRows, envRows, failingBranchRows, siblings] = await Promise.all([
    testHistory(testId, { limit: 50 }),
    db.execute<Record<string, unknown>>(
      sql`select tr.error_signature as signature, min(tr.error_message) as message, count(*)::int as count,
                 min(tr.started_at) as first_seen, max(tr.started_at) as last_seen,
                 (array_agg(r.number order by tr.started_at desc))[1] as last_run_number,
                 (array_agg(tr.id order by tr.started_at desc))[1] as last_result_id
          from ${testResults} tr join ${runs} r on r.id = tr.run_id
          where tr.test_id = ${testId} and tr.error_signature is not null and r.started_at >= ${since}
          group by tr.error_signature order by max(tr.started_at) desc`,
    ),
    db.execute<Record<string, unknown>>(
      // `rn` numbers the results newest-first, which is what turns "how many in
      // a row ended the same way" into arithmetic: the streak is the position
      // of the first result that broke it, minus one.
      sql`with res as (
            select tr.outcome, tr.duration_ms, tr.started_at, r.git_branch,
                   row_number() over (order by tr.started_at desc) as rn
            from ${testResults} tr join ${runs} r on r.id = tr.run_id
            where tr.test_id = ${testId} and r.started_at >= ${since} and tr.outcome <> 'running'
          )
          select count(*)::int as runs,
                 count(*) filter (where outcome = 'passed')::int as passed,
                 count(*) filter (where outcome in ('failed','timedout'))::int as failed,
                 count(*) filter (where outcome = 'flaky')::int as flaky,
                 count(*) filter (where outcome = 'skipped')::int as skipped,
                 ${reliabilitySql(
                   sql`count(*) filter (where outcome <> 'skipped')`,
                   sql`count(*) filter (where outcome in ('failed','timedout'))`,
                   sql`count(*) filter (where outcome = 'flaky')`,
                 )} as reliability,
                 avg(duration_ms) filter (where outcome = 'passed') as avg_duration_ms,
                 percentile_cont(0.95) within group (order by duration_ms) filter (where outcome = 'passed') as p95_duration_ms,
                 (array_agg(outcome order by started_at desc))[1] as last_outcome,
                 coalesce(min(rn) filter (where outcome not in ('failed','timedout')) - 1, count(*))::int as fail_streak,
                 coalesce(min(rn) filter (where outcome <> 'passed') - 1, count(*))::int as pass_streak,
                 count(distinct git_branch)::int as branches,
                 -- The newest third against the oldest third: enough to show a
                 -- drift without a single slow run swinging the verdict.
                 avg(duration_ms) filter (where outcome = 'passed' and rn <= greatest(1, (select count(*) from res) / 3)) as recent_duration_ms,
                 avg(duration_ms) filter (where outcome = 'passed' and rn > (select count(*) from res) - greatest(1, (select count(*) from res) / 3)) as earlier_duration_ms
          from res`,
    ),
    db.execute<Record<string, unknown>>(
      sql`select r.environment as environment,
                 count(*)::int as executions,
                 count(*) filter (where tr.outcome in ('failed','timedout'))::int as failed,
                 count(*) filter (where tr.outcome = 'flaky')::int as flaky,
                 avg(tr.duration_ms) filter (where tr.outcome <> 'skipped') as avg_duration_ms
          from ${testResults} tr join ${runs} r on r.id = tr.run_id
          where tr.test_id = ${testId} and r.started_at >= ${since} and tr.outcome <> 'running'
          group by r.environment
          order by count(*) desc, r.environment asc nulls last`,
    ),
    db.execute<Record<string, unknown>>(
      sql`select r.git_branch as branch, count(*)::int as failures
          from ${testResults} tr join ${runs} r on r.id = tr.run_id
          where tr.test_id = ${testId} and r.started_at >= ${since}
            and tr.outcome in ('failed','timedout') and r.git_branch is not null
          group by r.git_branch order by count(*) desc limit 1`,
    ),
    db
      .select({ testId: tests.id, pwProject: tests.pwProject })
      .from(tests)
      .where(sql`${tests.projectId} = ${projectId} and ${tests.file} = ${test.file} and ${tests.title} = ${test.title} and ${tests.id} <> ${testId}`),
  ]);
  const s = Array.from(statRows)[0] ?? {};
  return {
    test,
    history,
    errors: Array.from(errorRows).map((r) => ({
      signature: String(r.signature),
      message: String(r.message ?? ''),
      count: num(r.count),
      firstSeen: new Date(r.first_seen as string),
      lastSeen: new Date(r.last_seen as string),
      lastRunNumber: num(r.last_run_number),
      lastResultId: String(r.last_result_id),
    })),
    stats: toOverviewStats(s, (Array.from(failingBranchRows)[0]?.branch as string | undefined) ?? null),
    environments: Array.from(envRows).map((r): EnvironmentStat => {
      const executions = num(r.executions);
      const failed = num(r.failed);
      const flaky = num(r.flaky);
      return {
        environment: (r.environment as string | null) ?? null,
        executions,
        failed,
        failureRate: executions === 0 ? 0 : failed / executions,
        flaky,
        flakyRate: executions === 0 ? 0 : flaky / executions,
        avgDurationMs: r.avg_duration_ms ? num(r.avg_duration_ms) : null,
      };
    }),
    siblings,
  };
}

/**
 * Turns the one-row stats query into the shape the drawer renders. The streak
 * is reported in whichever direction the latest result points, because "failed
 * 5 in a row" and "passed 5 in a row" are the same measurement read from
 * opposite ends — and only one of them is ever interesting at a time.
 */
function toOverviewStats(s: Record<string, unknown>, topFailingBranch: string | null = null): TestOverviewStats {
  const runs = num(s.runs);
  const skipped = num(s.skipped);
  const failed = num(s.failed);
  const flaky = num(s.flaky);
  const nonSkipped = Math.max(0, runs - skipped);
  const last = (s.last_outcome as string | undefined) ?? null;
  const failing = last === 'failed' || last === 'timedout';
  const streak = failing ? num(s.fail_streak) : last === 'passed' ? num(s.pass_streak) : 0;
  const recent = s.recent_duration_ms ? num(s.recent_duration_ms) : null;
  const earlier = s.earlier_duration_ms ? num(s.earlier_duration_ms) : null;
  const failureRate = nonSkipped === 0 ? 0 : failed / nonSkipped;

  return {
    runs,
    passed: num(s.passed),
    failed,
    flaky,
    skipped,
    reliability: s.reliability === null || s.reliability === undefined ? null : num(s.reliability),
    avgDurationMs: s.avg_duration_ms ? num(s.avg_duration_ms) : null,
    p95DurationMs: s.p95_duration_ms ? num(s.p95_duration_ms) : null,
    failureRate,
    flakyRate: nonSkipped === 0 ? 0 : flaky / nonSkipped,
    streak,
    streakKind: streak === 0 ? 'none' : failing ? 'fail' : 'pass',
    branches: num(s.branches),
    topFailingBranch,
    durationTrend: recent && earlier ? recent / earlier : null,
    chronic:
      num(s.fail_streak) >= CHRONIC_STREAK ||
      (nonSkipped >= CHRONIC_MIN_RUNS && failureRate >= CHRONIC_FAILURE_RATE),
  };
}
