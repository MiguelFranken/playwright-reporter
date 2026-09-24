/**
 * Read queries shaped for the MCP tools. They take ids only — the tools get
 * those from `lib/mcp/context.ts`, which resolves them through the access
 * layer — and return plain rows; formatting lives with the tools.
 *
 * Kept apart from the UI's query modules on purpose: the tools filter and page
 * differently (multi-value filters, offsets, time windows with an end), and
 * changing the UI queries to serve both would couple two surfaces that should
 * evolve separately. Where a UI query already answers exactly, the tools call
 * it directly.
 */
import { and, asc, desc, eq, getTableColumns, gt, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { attachments, runs, testAttempts, testResults, tests, type Run } from '@/lib/db/schema';
import { effectiveRunColumns, effectiveStatusSql } from '@/lib/runs/staleness';
import { CHRONIC_FAILURE_RATE, CHRONIC_MIN_RUNS, CHRONIC_STREAK } from '@/lib/metrics/score';
import { andAll, num, reliabilitySql } from './shared';

export type RunStatus = Run['status'];
export type Outcome = (typeof testResults.$inferSelect)['outcome'];

export interface Counts {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  interrupted: number;
  running: number;
}

const countsSql = sql<Counts>`(
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

function parseCounts(v: unknown): Counts {
  const c = (typeof v === 'string' ? JSON.parse(v) : v) as Partial<Counts> | null;
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

const runColumns = { ...getTableColumns(runs), ...effectiveRunColumns };
export type McpRun = Run & { counts: Counts };

// ------------------------------------------------------------------ projects

/** The latest run per (project, repository), for matching a checkout's git remote to a project. */
export async function latestRunPerRepo(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({ projectId: runs.projectId, repoUrl: runs.gitRepoUrl, lastRunAt: sql<string>`max(${runs.startedAt})` })
    .from(runs)
    .where(and(inArray(runs.projectId, projectIds), sql`${runs.gitRepoUrl} is not null`))
    .groupBy(runs.projectId, runs.gitRepoUrl);
  return rows.map((r) => ({ projectId: r.projectId, repoUrl: r.repoUrl, lastRunAt: new Date(r.lastRunAt) }));
}

// ------------------------------------------------------------------ facets

export async function listFacets(projectId: string, since: Date) {
  const [branches, environments, browsers, testTags, runTags, authors] = await Promise.all([
    db
      .select({ name: runs.gitBranch, runs: sql<number>`count(*)::int`, lastRunAt: sql<string>`max(${runs.startedAt})` })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), sql`${runs.gitBranch} is not null`, gt(runs.startedAt, since)))
      .groupBy(runs.gitBranch)
      .orderBy(desc(sql`max(${runs.startedAt})`))
      .limit(50),
    db
      .select({ name: runs.environment, runs: sql<number>`count(*)::int` })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), sql`${runs.environment} is not null`, gt(runs.startedAt, since)))
      .groupBy(runs.environment)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ name: tests.pwProject, tests: sql<number>`count(*)::int` })
      .from(tests)
      .where(and(eq(tests.projectId, projectId), gt(tests.lastSeenAt, since)))
      .groupBy(tests.pwProject)
      .orderBy(desc(sql`count(*)`)),
    db.execute<{ tag: string; tests: number }>(
      sql`select tag, count(*)::int as tests from (select unnest(tags) as tag from ${tests} where project_id = ${projectId} and last_seen_at > ${since.toISOString()}) t
          group by tag order by count(*) desc limit 50`,
    ),
    db.execute<{ tag: string; runs: number }>(
      sql`select tag, count(*)::int as runs from (select unnest(tags) as tag from ${runs} where project_id = ${projectId} and started_at > ${since.toISOString()}) t
          group by tag order by count(*) desc limit 50`,
    ),
    db
      .select({ name: runs.gitAuthorName, runs: sql<number>`count(*)::int` })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), sql`${runs.gitAuthorName} is not null`, gt(runs.startedAt, since)))
      .groupBy(runs.gitAuthorName)
      .orderBy(desc(sql`count(*)`))
      .limit(30),
  ]);
  return {
    branches: branches.map((b) => ({ name: b.name!, runs: num(b.runs), lastRunAt: new Date(b.lastRunAt) })),
    environments: environments.map((e) => ({ name: e.name!, runs: num(e.runs) })),
    browsers: browsers.map((b) => ({ name: b.name, tests: num(b.tests) })),
    testTags: Array.from(testTags).map((t) => ({ name: t.tag, tests: num(t.tests) })),
    runTags: Array.from(runTags).map((t) => ({ name: t.tag, runs: num(t.runs) })),
    authors: authors.map((a) => ({ name: a.name!, runs: num(a.runs) })),
  };
}

/**
 * The branch comparisons measure against: `settings.defaultBranch` when set;
 * otherwise `main` or `master` if they have runs; otherwise the branch with the
 * most runs in 30 days; otherwise `main`.
 */
export async function defaultBranch(projectId: string, settings: Record<string, unknown>): Promise<string> {
  if (typeof settings.defaultBranch === 'string' && settings.defaultBranch.trim()) return settings.defaultBranch.trim();
  const [row] = await db
    .select({ branch: runs.gitBranch })
    .from(runs)
    .where(and(eq(runs.projectId, projectId), sql`${runs.gitBranch} is not null`, gt(runs.startedAt, sql`now() - interval '30 days'`)))
    .groupBy(runs.gitBranch)
    .orderBy(desc(sql`${runs.gitBranch} in ('main', 'master')`), desc(sql`count(*)`), desc(sql`max(${runs.startedAt})`))
    .limit(1);
  return row?.branch ?? 'main';
}

// ------------------------------------------------------------------ runs

export interface RunSearch {
  statuses?: RunStatus[];
  branch?: string;
  environment?: string;
  author?: string;
  commit?: string;
  tag?: string;
  executor?: 'ci' | 'local';
  search?: string;
  since?: Date;
  until?: Date | null;
  sort?: 'newest' | 'oldest' | 'slowest' | 'fastest';
}

function runWhere(projectId: string, f: RunSearch): SQL {
  const search = f.search?.trim();
  return andAll([
    eq(runs.projectId, projectId),
    f.statuses?.length ? sql`${effectiveStatusSql} in (${sql.join(f.statuses.map((s) => sql`${s}`), sql`, `)})` : undefined,
    f.branch ? eq(runs.gitBranch, f.branch) : undefined,
    f.environment ? eq(runs.environment, f.environment) : undefined,
    f.author ? ilike(runs.gitAuthorName, `%${f.author}%`) : undefined,
    f.commit ? or(ilike(runs.gitSha, `${f.commit}%`), ilike(runs.gitShortSha, `${f.commit}%`)) : undefined,
    f.tag ? sql`${runs.tags} @> array[${f.tag}]::text[]` : undefined,
    f.executor ? eq(runs.executor, f.executor) : undefined,
    f.since ? sql`${runs.startedAt} >= ${f.since.toISOString()}` : undefined,
    f.until ? sql`${runs.startedAt} < ${f.until.toISOString()}` : undefined,
    search
      ? /^#?\d+$/.test(search)
        ? eq(runs.number, Number(search.replace('#', '')))
        : ilike(runs.gitMessage, `%${search}%`)
      : undefined,
  ]);
}

export async function searchRuns(projectId: string, f: RunSearch, page: { limit: number; offset: number }) {
  const where = runWhere(projectId, f);
  const order =
    f.sort === 'oldest'
      ? [asc(runs.startedAt)]
      : f.sort === 'slowest'
        ? [sql`${runs.durationMs} desc nulls last`, desc(runs.startedAt)]
        : f.sort === 'fastest'
          ? [sql`${runs.durationMs} asc nulls last`, desc(runs.startedAt)]
          : [desc(runs.startedAt)];
  const [rows, [{ total }]] = await Promise.all([
    db.select({ run: runColumns, counts: countsSql }).from(runs).where(where).orderBy(...order).limit(page.limit).offset(page.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(runs).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r.run, counts: parseCounts(r.counts) }) as McpRun), total: num(total) };
}

async function oneRun(where: SQL, order: SQL[] = []): Promise<McpRun | null> {
  const [row] = await db
    .select({ run: runColumns, counts: countsSql })
    .from(runs)
    .where(where)
    .orderBy(...order)
    .limit(1);
  return row ? ({ ...row.run, counts: parseCounts(row.counts) } as McpRun) : null;
}

export const getRunByNumberWithCounts = (projectId: string, number: number) => oneRun(and(eq(runs.projectId, projectId), eq(runs.number, number))!);
export const getRunById = (projectId: string, id: string) => oneRun(and(eq(runs.projectId, projectId), eq(runs.id, id))!);

/**
 * The newest run matching the scope. `failedOnly` means the run ended failed
 * (or has failing results); `finishedOnly` skips runs still in progress;
 * `before` takes the newest one that started earlier than a given moment.
 */
export async function findLatestRun(
  projectId: string,
  opts: { branch?: string; environment?: string; failedOnly?: boolean; finishedOnly?: boolean; before?: Date; after?: Date } = {},
): Promise<McpRun | null> {
  return oneRun(
    andAll([
      eq(runs.projectId, projectId),
      opts.branch ? eq(runs.gitBranch, opts.branch) : undefined,
      opts.environment ? eq(runs.environment, opts.environment) : undefined,
      opts.failedOnly
        ? sql`(${effectiveStatusSql} in ('failed','timedout') or exists (select 1 from ${testResults} f where f.run_id = ${runs.id} and f.outcome in ('failed','timedout')))`
        : undefined,
      opts.finishedOnly ? sql`${effectiveStatusSql} <> 'running'` : undefined,
      opts.before ? lt(runs.startedAt, opts.before) : undefined,
      opts.after ? gt(runs.startedAt, opts.after) : undefined,
    ]),
    [desc(runs.startedAt)],
  );
}

/** The previous and next run on the same branch, by start time. */
export async function runNeighbours(projectId: string, run: Pick<Run, 'startedAt' | 'gitBranch'>) {
  const branch = run.gitBranch ? eq(runs.gitBranch, run.gitBranch) : sql`${runs.gitBranch} is null`;
  const [prev, next] = await Promise.all([
    db.select({ number: runs.number }).from(runs).where(and(eq(runs.projectId, projectId), branch, lt(runs.startedAt, run.startedAt))).orderBy(desc(runs.startedAt)).limit(1),
    db.select({ number: runs.number }).from(runs).where(and(eq(runs.projectId, projectId), branch, gt(runs.startedAt, run.startedAt))).orderBy(asc(runs.startedAt)).limit(1),
  ]);
  return { previous: prev[0]?.number ?? null, next: next[0]?.number ?? null };
}

// ------------------------------------------------------------------ results

export interface ResultSearch {
  outcomes?: Outcome[];
  file?: string;
  search?: string;
  signature?: string;
  browser?: string;
  retried?: boolean;
  hasArtifacts?: boolean;
  minDurationMs?: number;
  sort?: 'file' | 'duration' | 'outcome';
}

const outcomeOrder = sql`case ${testResults.outcome} when 'failed' then 0 when 'timedout' then 0 when 'interrupted' then 1 when 'flaky' then 2 when 'running' then 3 when 'passed' then 4 else 5 end`;

export interface McpResultRow {
  id: string;
  testId: string;
  outcome: Outcome;
  durationMs: number;
  attemptCount: number;
  errorMessage: string | null;
  errorSignature: string | null;
  title: string;
  titlePath: string[];
  file: string;
  line: number;
  pwProject: string;
  history: string[];
  attachmentKinds: string[];
}

/** All results of a run matching the filters, in the run page's order. Runs are bounded, so this does not page in SQL. */
export async function searchRunResults(runId: string, f: ResultSearch): Promise<McpResultRow[]> {
  const where = andAll([
    eq(testResults.runId, runId),
    f.outcomes?.length ? sql`${testResults.outcome} in (${sql.join(f.outcomes.map((o) => sql`${o}`), sql`, `)})` : undefined,
    f.file ? ilike(tests.file, `%${f.file}%`) : undefined,
    f.search ? sql`(${tests.title} ilike ${'%' + f.search + '%'} or array_to_string(array(select jsonb_array_elements_text(${tests.titlePath})), ' › ') ilike ${'%' + f.search + '%'})` : undefined,
    f.signature ? ilike(testResults.errorSignature, `${f.signature}%`) : undefined,
    f.browser ? eq(tests.pwProject, f.browser) : undefined,
    f.retried === true ? gt(testResults.attemptCount, 1) : f.retried === false ? eq(testResults.attemptCount, 1) : undefined,
    f.minDurationMs ? sql`${testResults.durationMs} >= ${f.minDurationMs}` : undefined,
    f.hasArtifacts === undefined
      ? undefined
      : sql`${f.hasArtifacts ? sql`` : sql`not `}exists (select 1 from ${attachments} a join ${testAttempts} ta on ta.id = a.attempt_id
             where ta.test_result_id = ${testResults.id} and a.status = 'uploaded')`,
  ]);
  const order =
    f.sort === 'duration'
      ? [desc(testResults.durationMs), asc(tests.file)]
      : f.sort === 'file'
        ? [asc(tests.file), asc(testResults.line), asc(tests.pwProject)]
        : [outcomeOrder, asc(tests.file), asc(tests.title), asc(tests.pwProject)];
  const rows = await db
    .select({
      id: testResults.id,
      testId: testResults.testId,
      outcome: testResults.outcome,
      durationMs: testResults.durationMs,
      attemptCount: testResults.attemptCount,
      errorMessage: testResults.errorMessage,
      errorSignature: testResults.errorSignature,
      title: tests.title,
      titlePath: tests.titlePath,
      file: tests.file,
      line: testResults.line,
      pwProject: tests.pwProject,
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
    .orderBy(...order);
  return rows as McpResultRow[];
}

export async function outcomeCounts(runId: string) {
  const rows = await db
    .select({ outcome: testResults.outcome, n: sql<number>`count(*)::int` })
    .from(testResults)
    .where(eq(testResults.runId, runId))
    .groupBy(testResults.outcome);
  return Object.fromEntries(rows.map((r) => [r.outcome, num(r.n)])) as Partial<Record<Outcome, number>>;
}

/** A result and the number of its run, scoped to the project. */
export async function getResultLocation(projectId: string, resultId: string) {
  const [row] = await db
    .select({ resultId: testResults.id, testId: testResults.testId, runId: runs.id, runNumber: runs.number })
    .from(testResults)
    .innerJoin(runs, eq(runs.id, testResults.runId))
    .where(and(eq(testResults.id, resultId), eq(runs.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

/** The result of one test in one run. */
export async function getResultInRun(runId: string, testId: string) {
  const [row] = await db
    .select({ id: testResults.id })
    .from(testResults)
    .where(and(eq(testResults.runId, runId), eq(testResults.testId, testId)))
    .limit(1);
  return row?.id ?? null;
}

// ------------------------------------------------------------------ tests

export async function getTestById(projectId: string, testId: string) {
  const [row] = await db
    .select()
    .from(tests)
    .where(and(eq(tests.projectId, projectId), eq(tests.id, testId)))
    .limit(1);
  return row ?? null;
}

export interface TestCandidate {
  id: string;
  title: string;
  titlePath: string[];
  file: string;
  pwProject: string;
  lastSeenAt: Date;
  /** Outcome in the scoped run, when a run was given. */
  outcomeInRun: Outcome | null;
}

/**
 * Tests whose title (or title path) contains `q`, optionally narrowed by file
 * and browser project, and — when a run is given — to tests in that run with
 * failing ones first. Returns up to 11 so the caller can tell "more than 10".
 */
export async function findTestCandidates(
  projectId: string,
  opts: { q: string; file?: string; browser?: string; runId?: string },
): Promise<TestCandidate[]> {
  const q = `%${opts.q.trim()}%`;
  const inRun = opts.runId
    ? sql`(select tr.outcome from ${testResults} tr where tr.run_id = ${opts.runId} and tr.test_id = ${tests.id} limit 1)`
    : sql`null`;
  const rows = await db
    .select({
      id: tests.id,
      title: tests.title,
      titlePath: tests.titlePath,
      file: tests.file,
      pwProject: tests.pwProject,
      lastSeenAt: tests.lastSeenAt,
      outcomeInRun: sql<Outcome | null>`${inRun}`,
    })
    .from(tests)
    .where(
      andAll([
        eq(tests.projectId, projectId),
        sql`(${tests.title} ilike ${q} or array_to_string(array(select jsonb_array_elements_text(${tests.titlePath})), ' › ') ilike ${q} or ${tests.title} || ' ' || ${tests.file} ilike ${q})`,
        opts.file ? ilike(tests.file, `%${opts.file}%`) : undefined,
        opts.browser ? eq(tests.pwProject, opts.browser) : undefined,
        opts.runId ? sql`exists (select 1 from ${testResults} tr where tr.run_id = ${opts.runId} and tr.test_id = ${tests.id})` : undefined,
      ]),
    )
    .orderBy(
      sql`case when ${inRun} in ('failed','timedout','interrupted') then 0 when ${inRun} = 'flaky' then 1 else 2 end`,
      desc(tests.lastSeenAt),
    )
    .limit(11);
  return rows as TestCandidate[];
}

export interface TestSearch {
  search?: string;
  status?: 'flaky' | 'chronic' | 'failing' | 'stable' | 'passed' | 'skipped';
  tags?: string[];
  browser?: string;
  environment?: string;
  branch?: string;
  since: Date;
  minRuns: number;
  sort: 'flakyRate' | 'failureRate' | 'reliability' | 'avgDuration' | 'p95Duration' | 'durationTrend' | 'runs' | 'lastRun';
  dir?: 'asc' | 'desc';
}

const TEST_SORT: Record<TestSearch['sort'], string> = {
  flakyRate: 'flaky_rate',
  failureRate: 'failure_rate',
  reliability: 'reliability',
  avgDuration: 'avg_duration_ms',
  p95Duration: 'p95_duration_ms',
  durationTrend: 'duration_trend',
  runs: 'runs',
  lastRun: 'last_run_at',
};

/** Default direction per sort: "worst first" — except reliability, where low is bad. */
const TEST_SORT_DIR: Record<TestSearch['sort'], 'asc' | 'desc'> = {
  flakyRate: 'desc',
  failureRate: 'desc',
  reliability: 'asc',
  avgDuration: 'desc',
  p95Duration: 'desc',
  durationTrend: 'desc',
  runs: 'desc',
  lastRun: 'desc',
};

export interface TestStatsRow {
  testId: string;
  title: string;
  titlePath: string[];
  file: string;
  pwProject: string;
  runs: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  failureRate: number;
  flakyRate: number;
  reliability: number | null;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  /** Newest third of passing durations against the oldest third, minus one (0.25 = 25% slower). */
  durationTrend: number | null;
  streak: number;
  lastOutcome: string;
  lastRunAt: Date;
  lastRunNumber: number;
  lastBranch: string | null;
}

/** Per-test aggregates over a window: the explorer's measure, plus branch scope, p95 and duration trend. */
export async function searchTests(projectId: string, f: TestSearch, page: { limit: number; offset: number }) {
  const runFilter = andAll([
    sql`r.project_id = ${projectId}`,
    sql`r.started_at >= ${f.since.toISOString()}`,
    f.environment ? sql`r.environment = ${f.environment}` : undefined,
    f.branch ? sql`r.git_branch = ${f.branch}` : undefined,
  ]);
  const testFilter: SQL[] = [sql`t.project_id = ${projectId}`];
  if (f.browser) testFilter.push(sql`t.pw_project = ${f.browser}`);
  if (f.tags?.length) testFilter.push(sql`t.tags && array[${sql.join(f.tags.map((tag) => sql`${tag}`), sql`, `)}]::text[]`);
  if (f.search) {
    let regex = true;
    try {
      new RegExp(f.search);
    } catch {
      regex = false;
    }
    testFilter.push(regex ? sql`(t.title ~* ${f.search} or t.file ~* ${f.search})` : sql`(t.title ilike ${'%' + f.search + '%'} or t.file ilike ${'%' + f.search + '%'})`);
  }
  const statusFilter: Record<NonNullable<TestSearch['status']>, SQL> = {
    flaky: sql`flaky > 0`,
    chronic: sql`(streak >= ${CHRONIC_STREAK} or (non_skipped >= ${CHRONIC_MIN_RUNS} and failure_rate >= ${CHRONIC_FAILURE_RATE}))`,
    failing: sql`last_outcome in ('failed','timedout','interrupted')`,
    stable: sql`failed = 0 and flaky = 0`,
    passed: sql`last_outcome = 'passed'`,
    skipped: sql`last_outcome = 'skipped'`,
  };
  const outer = andAll([sql`runs >= ${f.minRuns}`, f.status ? statusFilter[f.status] : undefined]);
  const dir = (f.dir ?? TEST_SORT_DIR[f.sort]) === 'asc' ? sql`asc nulls last` : sql`desc nulls last`;

  const body = sql`
    with res as (
      select tr.test_id, tr.outcome, tr.started_at, tr.duration_ms, r.number, r.git_branch,
             row_number() over (partition by tr.test_id order by tr.started_at desc) as rn,
             count(*) over (partition by tr.test_id) as n
      from ${testResults} tr join ${runs} r on r.id = tr.run_id
      where ${runFilter} and tr.outcome <> 'running'
    ),
    agg as (
      select t.id as test_id, t.title, t.title_path, t.file, t.pw_project,
             count(*)::int as runs,
             count(*) filter (where res.outcome = 'passed')::int as passed,
             count(*) filter (where res.outcome in ('failed','timedout'))::int as failed,
             count(*) filter (where res.outcome = 'flaky')::int as flaky,
             count(*) filter (where res.outcome = 'skipped')::int as skipped,
             count(*) filter (where res.outcome <> 'skipped')::int as non_skipped,
             coalesce(count(*) filter (where res.outcome in ('failed','timedout'))::float / nullif(count(*) filter (where res.outcome <> 'skipped'), 0), 0) as failure_rate,
             coalesce(count(*) filter (where res.outcome = 'flaky')::float / nullif(count(*) filter (where res.outcome <> 'skipped'), 0), 0) as flaky_rate,
             ${reliabilitySql(
               sql`count(*) filter (where res.outcome <> 'skipped')`,
               sql`count(*) filter (where res.outcome in ('failed','timedout'))`,
               sql`count(*) filter (where res.outcome = 'flaky')`,
             )} as reliability,
             avg(res.duration_ms) filter (where res.outcome = 'passed') as avg_duration_ms,
             percentile_cont(0.95) within group (order by res.duration_ms) filter (where res.outcome = 'passed') as p95_duration_ms,
             avg(res.duration_ms) filter (where res.outcome = 'passed' and res.rn <= greatest(1, res.n / 3))
               / nullif(avg(res.duration_ms) filter (where res.outcome = 'passed' and res.rn > res.n - greatest(1, res.n / 3)), 0) - 1 as duration_trend,
             coalesce(min(res.rn) filter (where res.outcome not in ('failed','timedout')) - 1, count(*))::int as streak,
             (array_agg(res.outcome order by res.started_at desc))[1] as last_outcome,
             max(res.started_at) as last_run_at,
             (array_agg(res.number order by res.started_at desc))[1] as last_run_number,
             (array_agg(res.git_branch order by res.started_at desc))[1] as last_branch
      from ${tests} t join res on res.test_id = t.id
      where ${andAll(testFilter)}
      group by t.id
    )
    select * from agg where ${outer}`;

  const [rows, [{ total }]] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`${body} order by ${sql.raw(TEST_SORT[f.sort])} ${dir}, title asc limit ${page.limit} offset ${page.offset}`),
    db.execute<{ total: string }>(sql`select count(*) as total from (${body}) c`),
  ]);
  return { rows: Array.from(rows).map(toTestStats), total: num(total) };
}

function toTestStats(r: Record<string, unknown>): TestStatsRow {
  const nullable = (v: unknown) => (v === null || v === undefined ? null : num(v));
  return {
    testId: String(r.test_id),
    title: String(r.title),
    titlePath: (r.title_path as string[]) ?? [],
    file: String(r.file),
    pwProject: String(r.pw_project),
    runs: num(r.runs),
    passed: num(r.passed),
    failed: num(r.failed),
    flaky: num(r.flaky),
    skipped: num(r.skipped),
    failureRate: num(r.failure_rate),
    flakyRate: num(r.flaky_rate),
    reliability: nullable(r.reliability),
    avgDurationMs: nullable(r.avg_duration_ms),
    p95DurationMs: nullable(r.p95_duration_ms),
    durationTrend: nullable(r.duration_trend),
    streak: num(r.streak),
    lastOutcome: String(r.last_outcome),
    lastRunAt: new Date(r.last_run_at as string),
    lastRunNumber: num(r.last_run_number),
    lastBranch: (r.last_branch as string | null) ?? null,
  };
}

/** Per-branch outcome rates of one test. */
export async function branchBreakdown(testId: string, since: Date, limit = 10) {
  const rows = await db.execute<Record<string, unknown>>(
    sql`select r.git_branch as branch, count(*)::int as runs,
               count(*) filter (where tr.outcome in ('failed','timedout'))::int as failed,
               count(*) filter (where tr.outcome = 'flaky')::int as flaky,
               count(*) filter (where tr.outcome <> 'skipped')::int as non_skipped,
               (array_agg(tr.outcome order by tr.started_at desc))[1] as last_outcome
        from ${testResults} tr join ${runs} r on r.id = tr.run_id
        where tr.test_id = ${testId} and r.started_at >= ${since.toISOString()} and tr.outcome <> 'running'
        group by r.git_branch order by max(tr.started_at) desc limit ${limit}`,
  );
  return Array.from(rows).map((r) => {
    const nonSkipped = num(r.non_skipped);
    return {
      branch: (r.branch as string | null) ?? null,
      runs: num(r.runs),
      failureRate: nonSkipped ? num(r.failed) / nonSkipped : 0,
      flakyRate: nonSkipped ? num(r.flaky) / nonSkipped : 0,
      lastOutcome: String(r.last_outcome),
    };
  });
}

/** Error signatures across the project, ranked by how many tests they hit. */
export async function topErrorSignatures(projectId: string, since: Date, opts: { branch?: string; limit?: number } = {}) {
  const rows = await db.execute<Record<string, unknown>>(
    sql`select tr.error_signature as signature, min(tr.error_message) as message,
               count(distinct tr.test_id)::int as tests, count(distinct tr.run_id)::int as runs,
               max(tr.started_at) as last_seen
        from ${testResults} tr join ${runs} r on r.id = tr.run_id
        where tr.project_id = ${projectId} and tr.started_at >= ${since.toISOString()} and tr.error_signature is not null
          and tr.outcome in ('failed','timedout','flaky')${opts.branch ? sql` and r.git_branch = ${opts.branch}` : sql``}
        group by tr.error_signature order by count(distinct tr.test_id) desc, count(distinct tr.run_id) desc limit ${opts.limit ?? 5}`,
  );
  return Array.from(rows).map((r) => ({
    signature: String(r.signature),
    message: String(r.message ?? ''),
    tests: num(r.tests),
    runs: num(r.runs),
    lastSeen: new Date(r.last_seen as string),
  }));
}
