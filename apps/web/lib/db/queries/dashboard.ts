import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { runs, testResults, tests } from '@/lib/db/schema';
import { CHRONIC_FAILURE_RATE, CHRONIC_MIN_RUNS, CHRONIC_STREAK } from '@/lib/metrics/score';
import { num, reliabilitySql, sinceDate } from './shared';

/** Declared by the views that render them; see `@repo/ui/views/dashboard`. */
import type { BranchSummaryRow } from '@repo/ui/views/dashboard/branch-summary-table';
import type { TestHealthRow } from '@repo/ui/views/dashboard/test-health-lists';

export type { BranchSummaryRow, TestHealthRow };

export interface DashboardStats {
  trackedTests: number;
  newTests: number;
  finishedRuns: number;
  passedRuns: number;
  runPassRate: number | null;
  reliability: number | null;
  avgRunDurationMs: number | null;
}

export async function dashboardStats(projectId: string, days: number): Promise<DashboardStats> {
  const since = sinceDate(days);
  const [[tracked], [newT], [runAgg], [rel]] = await Promise.all([
    db.execute<{ n: string }>(
      sql`select count(distinct tr.test_id) as n from ${testResults} tr join ${runs} r on r.id = tr.run_id where r.project_id = ${projectId} and r.started_at >= ${since}`,
    ),
    db.execute<{ n: string }>(sql`select count(*) as n from ${tests} where project_id = ${projectId} and first_seen_at >= ${since}`),
    db.execute<{ finished: string; passed: string; avg_ms: string | null }>(
      sql`select count(*) filter (where status <> 'running') as finished,
                 count(*) filter (where status = 'passed') as passed,
                 avg(duration_ms) filter (where status in ('passed','failed')) as avg_ms
          from ${runs} where project_id = ${projectId} and started_at >= ${since}`,
    ),
    db.execute<{ score: string | null }>(
      sql`select avg(score) as score from (
            select ${reliabilitySql(
              sql`count(*) filter (where tr.outcome not in ('skipped','running'))`,
              sql`count(*) filter (where tr.outcome in ('failed','timedout'))`,
              sql`count(*) filter (where tr.outcome = 'flaky')`,
            )} as score
            from ${testResults} tr join ${runs} r on r.id = tr.run_id
            where r.project_id = ${projectId} and r.started_at >= ${since}
            group by tr.test_id) s where score is not null`,
    ),
  ]);
  const finished = num(runAgg?.finished);
  const passed = num(runAgg?.passed);
  return {
    trackedTests: num(tracked?.n),
    newTests: num(newT?.n),
    finishedRuns: finished,
    passedRuns: passed,
    runPassRate: finished ? passed / finished : null,
    reliability: rel?.score === null || rel?.score === undefined ? null : Math.round(num(rel.score)),
    avgRunDurationMs: runAgg?.avg_ms ? num(runAgg.avg_ms) : null,
  };
}


export async function branchSummary(projectId: string, days: number): Promise<BranchSummaryRow[]> {
  const rows = await db.execute<Record<string, unknown>>(
    sql`select coalesce(git_branch, '(unknown)') as branch,
               (array_agg(environment order by started_at desc))[1] as environment,
               count(*)::int as runs,
               max(started_at) as last_run_at,
               (array_agg(number order by started_at desc))[1] as last_run_number,
               (array_agg(status order by started_at desc))[1] as last_status,
               case when count(*) filter (where status <> 'running') = 0 then null
                    else count(*) filter (where status = 'passed')::float / count(*) filter (where status <> 'running') end as pass_rate
        from ${runs} where project_id = ${projectId} and started_at >= ${sinceDate(days)}
        group by git_branch order by max(started_at) desc limit 20`,
  );
  return Array.from(rows).map((r) => ({
    branch: String(r.branch),
    environment: (r.environment as string | null) ?? null,
    runs: num(r.runs),
    lastRunAt: new Date(r.last_run_at as string),
    lastRunNumber: num(r.last_run_number),
    lastStatus: String(r.last_status),
    passRate: r.pass_rate === null ? null : num(r.pass_rate),
  }));
}


function mapHealth(r: Record<string, unknown>): TestHealthRow {
  return {
    testId: String(r.test_id),
    title: String(r.title),
    file: String(r.file),
    pwProject: String(r.pw_project),
    runs: num(r.runs),
    failed: num(r.failed),
    flaky: num(r.flaky),
    flakyRate: num(r.flaky_rate),
    failureRate: num(r.failure_rate),
    streak: num(r.streak),
    lastOutcome: String(r.last_outcome),
    lastRunNumber: num(r.last_run_number),
    avgDurationMs: num(r.avg_duration_ms),
  };
}

const healthCte = (projectId: string, since: string) => sql`
  with res as (
    select tr.test_id, tr.outcome, tr.started_at, tr.duration_ms, r.number,
           row_number() over (partition by tr.test_id order by tr.started_at desc) as rn
    from ${testResults} tr join ${runs} r on r.id = tr.run_id
    where r.project_id = ${projectId} and r.started_at >= ${since} and tr.outcome not in ('running','skipped')
  ),
  agg as (
    select test_id,
           count(*)::int as runs,
           count(*) filter (where outcome in ('failed','timedout'))::int as failed,
           count(*) filter (where outcome = 'flaky')::int as flaky,
           count(*) filter (where outcome in ('failed','timedout'))::float / count(*) as failure_rate,
           count(*) filter (where outcome = 'flaky')::float / count(*) as flaky_rate,
           coalesce(min(rn) filter (where outcome not in ('failed','timedout')) - 1, count(*))::int as streak,
           (array_agg(outcome order by started_at desc))[1] as last_outcome,
           (array_agg(number order by started_at desc))[1] as last_run_number,
           avg(duration_ms) filter (where outcome = 'passed') as avg_duration_ms
    from res group by test_id
  )
  select a.*, t.title, t.file, t.pw_project from agg a join ${tests} t on t.id = a.test_id`;

export async function mostFlakyTests(projectId: string, days: number, limit = 10): Promise<TestHealthRow[]> {
  const rows = await db.execute<Record<string, unknown>>(
    sql`${healthCte(projectId, sinceDate(days))} where a.flaky > 0 order by a.flaky_rate desc, a.flaky desc limit ${limit}`,
  );
  return Array.from(rows).map(mapHealth);
}

export async function chronicFailures(projectId: string, days: number, limit = 10): Promise<TestHealthRow[]> {
  const rows = await db.execute<Record<string, unknown>>(
    sql`${healthCte(projectId, sinceDate(days))}
        where a.streak >= ${CHRONIC_STREAK} or (a.runs >= ${CHRONIC_MIN_RUNS} and a.failure_rate >= ${CHRONIC_FAILURE_RATE})
        order by a.streak desc, a.failure_rate desc limit ${limit}`,
  );
  return Array.from(rows).map(mapHealth);
}

export interface TrendPoint {
  runNumber: number;
  startedAt: Date;
  status: string;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

export async function passFailTrend(projectId: string, limit = 30): Promise<TrendPoint[]> {
  const rows = await db.execute<Record<string, unknown>>(
    sql`select r.number, r.started_at, r.status,
               count(*) filter (where tr.outcome = 'passed')::int as passed,
               count(*) filter (where tr.outcome in ('failed','timedout','interrupted'))::int as failed,
               count(*) filter (where tr.outcome = 'flaky')::int as flaky,
               count(*) filter (where tr.outcome = 'skipped')::int as skipped
        from ${runs} r left join ${testResults} tr on tr.run_id = r.id
        where r.project_id = ${projectId} and r.status <> 'running'
        group by r.id order by r.started_at desc limit ${limit}`,
  );
  return Array.from(rows)
    .map((r) => ({
      runNumber: num(r.number),
      startedAt: new Date(r.started_at as string),
      status: String(r.status),
      passed: num(r.passed),
      failed: num(r.failed),
      flaky: num(r.flaky),
      skipped: num(r.skipped),
    }))
    .reverse();
}
