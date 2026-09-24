/**
 * 8.6 — the raw-SQL aggregations behind the dashboard and the test explorer.
 *
 * The reliability assertion is the point of this file: the score is computed
 * twice, once by `reliabilitySql` in Postgres and once by `reliabilityScore` in
 * TypeScript over the same rows. That parity is the whole reason the two
 * implementations exist side by side.
 */
import { eq } from 'drizzle-orm';
import { branchSummary, chronicFailures, dashboardStats, mostFlakyTests, passFailTrend } from '@/lib/db/queries/dashboard';
import { exploreTests, getTestOverview } from '@/lib/db/queries/explorer';
import { CHRONIC_FAILURE_RATE, CHRONIC_MIN_RUNS, CHRONIC_STREAK, reliabilityScore } from '@/lib/metrics/score';
import { runs, testResults, tests } from '@/lib/db/schema';
import { playRun, type ScenarioOutcome } from './factories';
import { createTenant, describe, expect, test, type Db, type Tenant } from './fixtures';

const DAY = 24 * 60 * 60 * 1000;
const HOME = 'tests/home.spec.ts';
const CART = 'tests/cart.spec.ts';

/**
 * Recomputes the dashboard reliability in TypeScript from the persisted rows,
 * exactly the way `dashboardStats` asks Postgres to: a score per test, then the
 * mean of the tests that have one.
 */
async function reliabilityInTypeScript(db: Db, projectId: string, days: number): Promise<number | null> {
  const since = new Date(Date.now() - days * DAY);
  const rows = await db
    .select({ testId: testResults.testId, outcome: testResults.outcome, startedAt: runs.startedAt })
    .from(testResults)
    .innerJoin(runs, eq(runs.id, testResults.runId))
    .where(eq(testResults.projectId, projectId));

  const perTest = new Map<string, { nonSkipped: number; failed: number; flaky: number }>();
  for (const row of rows) {
    if (row.startedAt < since) continue;
    const entry = perTest.get(row.testId) ?? { nonSkipped: 0, failed: 0, flaky: 0 };
    if (row.outcome !== 'skipped' && row.outcome !== 'running') entry.nonSkipped++;
    if (row.outcome === 'failed' || row.outcome === 'timedout') entry.failed++;
    if (row.outcome === 'flaky') entry.flaky++;
    perTest.set(row.testId, entry);
  }
  const scores = [...perTest.values()]
    .filter((e) => e.nonSkipped > 0)
    .map((e) => reliabilityScore(e.failed / e.nonSkipped, e.flaky / e.nonSkipped));
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

/**
 * Four recent runs plus one outside the 30-day window. Counts are chosen so
 * every per-test score is a whole number: `round()` on a double is
 * platform-defined at exact halves, and this test is about the formula, not
 * about rounding modes.
 */
async function seedProject(tenant: Tenant) {
  const plan: ScenarioOutcome[][] = [
    // [always green, sometimes flaky, usually broken]
    ['passed', 'flaky', 'failed'],
    ['passed', 'flaky', 'failed'],
    ['passed', 'passed', 'failed'],
    ['passed', 'passed', 'passed'],
  ];
  for (const [i, [green, middle, broken]] of plan.entries()) {
    await playRun(tenant.tokenProject, {
      ciRunId: `run-${i}`,
      startedAt: new Date(Date.now() - (plan.length - i) * DAY),
      branch: i === 3 ? 'feature/x' : 'main',
      tests: [
        { outcome: green, file: HOME, title: 'always green' },
        { outcome: middle, file: HOME, title: 'sometimes flaky' },
        { outcome: broken, file: CART, title: 'usually broken', error: 'Error: cart is empty' },
      ],
    });
  }
  // Older than 30 days: inside a 90-day window, outside a 30-day one.
  await playRun(tenant.tokenProject, {
    ciRunId: 'ancient',
    startedAt: new Date(Date.now() - 40 * DAY),
    tests: [{ outcome: 'failed', file: HOME, title: 'always green' }],
  });
}

describe('dashboardStats', () => {
  test('counts tests and runs inside the requested window', async ({ tenant }) => {
    await seedProject(tenant);

    const thirty = await dashboardStats(tenant.project.id, 30);
    expect(thirty).toMatchObject({ trackedTests: 3, newTests: 3, finishedRuns: 4, passedRuns: 1 });
    expect(thirty.runPassRate).toBeCloseTo(1 / 4);

    const ninety = await dashboardStats(tenant.project.id, 90);
    expect(ninety.finishedRuns).toBe(5);

    // The 7-day window sees the four recent runs but not the 40-day-old one.
    const week = await dashboardStats(tenant.project.id, 7);
    expect(week.finishedRuns).toBe(4);
  });

  test('reliability computed in SQL equals reliabilityScore computed in TypeScript', async ({ db, tenant }) => {
    await seedProject(tenant);

    for (const days of [7, 30, 90] as const) {
      const stats = await dashboardStats(tenant.project.id, days);
      expect({ days, reliability: stats.reliability }).toEqual({
        days,
        reliability: await reliabilityInTypeScript(db, tenant.project.id, days),
      });
    }

    // …and the value is the one the formula predicts by hand:
    // always green 100, sometimes flaky 100-25=75, usually broken 100-75=25.
    const thirty = await dashboardStats(tenant.project.id, 30);
    expect(thirty.reliability).toBe(Math.round((100 + 75 + 25) / 3));
  });

  test('reports the average duration of the runs that finished', async ({ db, tenant }) => {
    await seedProject(tenant);
    const stats = await dashboardStats(tenant.project.id, 30);

    const since = new Date(Date.now() - 30 * DAY);
    const rows = await db.select({ durationMs: runs.durationMs, status: runs.status, startedAt: runs.startedAt }).from(runs);
    const relevant = rows
      .filter((r) => r.startedAt >= since && (r.status === 'passed' || r.status === 'failed'))
      .map((r) => r.durationMs!);
    expect(relevant).toHaveLength(4);
    expect(stats.avgRunDurationMs).toBeCloseTo(relevant.reduce((a, b) => a + b, 0) / relevant.length, 5);
  });

  test('is all zeroes and nulls for a project with no runs', async ({ db }) => {
    const empty = await createTenant(db);
    expect(await dashboardStats(empty.project.id, 30)).toEqual({
      trackedTests: 0,
      newTests: 0,
      finishedRuns: 0,
      passedRuns: 0,
      runPassRate: null,
      reliability: null,
      avgRunDurationMs: null,
    });
  });
});

describe('branchSummary', () => {
  test('summarizes each branch, most recently active first', async ({ tenant }) => {
    await seedProject(tenant);
    const rows = await branchSummary(tenant.project.id, 30);

    expect(rows.map((r) => r.branch)).toEqual(['feature/x', 'main']);
    expect(rows[0]).toMatchObject({ runs: 1, lastRunNumber: 4, lastStatus: 'passed', passRate: 1 });
    expect(rows[1]).toMatchObject({ runs: 3, lastStatus: 'failed' });
    expect(rows[1].passRate).toBeCloseTo(0);
  });

  test('leaves pass_rate null while every run on the branch is still going', async ({ tenant }) => {
    await playRun(tenant.tokenProject, { branch: 'wip', tests: [{ outcome: 'running' }], finish: false });
    const [row] = await branchSummary(tenant.project.id, 30);
    expect(row).toMatchObject({ branch: 'wip', runs: 1, lastStatus: 'running' });
    expect(row.passRate).toBeNull();
  });
});

describe('passFailTrend', () => {
  test('returns finished runs oldest first with their outcome counts', async ({ tenant }) => {
    await seedProject(tenant);
    await playRun(tenant.tokenProject, { ciRunId: 'open', tests: [{ outcome: 'running' }], finish: false });

    const points = await passFailTrend(tenant.project.id);
    // Oldest first, and the still-running run is not a data point.
    expect(points.map((p) => p.runNumber)).toEqual([5, 1, 2, 3, 4]);
    expect(points.every((p) => p.status !== 'running')).toBe(true);
    expect(points.at(-1)).toMatchObject({ runNumber: 4, passed: 3, failed: 0, flaky: 0 });
    expect(points[1]).toMatchObject({ runNumber: 1, passed: 1, failed: 1, flaky: 1 });
  });

  test('honours the limit while keeping the oldest-first order', async ({ tenant }) => {
    await seedProject(tenant);
    const points = await passFailTrend(tenant.project.id, 2);
    expect(points.map((p) => p.runNumber)).toEqual([3, 4]);
  });
});

describe('mostFlakyTests', () => {
  test('ranks by flaky rate and ignores tests that never flaked', async ({ tenant }) => {
    await seedProject(tenant);
    const rows = await mostFlakyTests(tenant.project.id, 30);

    expect(rows.map((r) => r.title)).toEqual(['sometimes flaky']);
    expect(rows[0]).toMatchObject({ runs: 4, flaky: 2, failed: 0, file: HOME, lastOutcome: 'passed', lastRunNumber: 4 });
    expect(rows[0].flakyRate).toBeCloseTo(0.5);
    expect(rows[0].failureRate).toBeCloseTo(0);
  });
});

describe('chronicFailures', () => {
  test('catches a test that failed the last CHRONIC_STREAK runs in a row', async ({ tenant }) => {
    for (let i = 0; i < CHRONIC_STREAK; i++) {
      await playRun(tenant.tokenProject, {
        ciRunId: `run-${i}`,
        startedAt: new Date(Date.now() - (CHRONIC_STREAK - i) * DAY),
        tests: [{ outcome: 'failed', title: 'broken', error: 'nope' }],
      });
    }

    const [row] = await chronicFailures(tenant.project.id, 30);
    expect(row).toMatchObject({ title: 'broken', streak: CHRONIC_STREAK, runs: CHRONIC_STREAK, failed: CHRONIC_STREAK });
    expect(row.failureRate).toBeCloseTo(1);
  });

  test('a recent pass breaks the streak', async ({ tenant }) => {
    for (let i = 0; i < CHRONIC_STREAK; i++) {
      await playRun(tenant.tokenProject, {
        ciRunId: `run-${i}`,
        startedAt: new Date(Date.now() - (CHRONIC_STREAK + 1 - i) * DAY),
        tests: [{ outcome: 'failed', title: 'broken', error: 'nope' }],
      });
    }
    await playRun(tenant.tokenProject, { ciRunId: 'green', tests: [{ outcome: 'passed', title: 'broken' }] });

    const rows = await chronicFailures(tenant.project.id, 30);
    // The streak is gone, but the failure rate rule still catches it.
    expect(rows[0]).toMatchObject({ title: 'broken', streak: 0, runs: CHRONIC_STREAK + 1 });
    expect(rows[0].failureRate).toBeGreaterThanOrEqual(CHRONIC_FAILURE_RATE);
  });

  test('ignores a test that fails often but has too few runs', async ({ tenant }) => {
    const belowMinimum = CHRONIC_MIN_RUNS - 2;
    for (let i = 0; i < belowMinimum; i++) {
      await playRun(tenant.tokenProject, {
        ciRunId: `run-${i}`,
        startedAt: new Date(Date.now() - (belowMinimum - i) * DAY),
        tests: [{ outcome: 'failed', title: 'flappy', error: 'nope' }],
      });
    }
    await playRun(tenant.tokenProject, { ciRunId: 'green', tests: [{ outcome: 'passed', title: 'flappy' }] });

    expect(await chronicFailures(tenant.project.id, 30)).toEqual([]);
  });
});

describe('exploreTests', () => {
  async function seedExplorer(tenant: Tenant) {
    const outcomes: Record<string, ScenarioOutcome[]> = {
      stable: ['passed', 'passed', 'passed'],
      flaky: ['passed', 'flaky', 'passed'],
      broken: ['failed', 'failed', 'failed'],
      ignored: ['skipped', 'skipped', 'skipped'],
    };
    for (let i = 0; i < 3; i++) {
      await playRun(tenant.tokenProject, {
        ciRunId: `run-${i}`,
        startedAt: new Date(Date.now() - (3 - i) * DAY),
        environment: i === 2 ? 'prod' : 'staging',
        tests: [
          { outcome: outcomes.stable[i], file: HOME, title: 'stable one', tags: ['@smoke'], durationMs: 100 },
          { outcome: outcomes.flaky[i], file: HOME, title: 'flaky one', tags: ['@smoke', '@slow'], durationMs: 200 },
          { outcome: outcomes.broken[i], file: CART, title: 'broken one', tags: ['@slow'], durationMs: 300, error: 'Error: cart is empty' },
          { outcome: outcomes.ignored[i], file: CART, title: 'ignored one', durationMs: 0 },
          { outcome: outcomes.stable[i], file: HOME, title: 'stable one', project: 'firefox', durationMs: 150 },
        ],
      });
    }
  }

  test('returns one row per test with its aggregates', async ({ tenant }) => {
    await seedExplorer(tenant);
    const { rows, total } = await exploreTests(tenant.project.id, { days: 30 });

    expect(total).toBe(5);
    expect(rows).toHaveLength(5);
    const flaky = rows.find((r) => r.title === 'flaky one')!;
    expect(flaky).toMatchObject({ runs: 3, passed: 2, flaky: 1, failed: 0, file: HOME, pwProject: 'chromium' });
    expect(flaky.flakyRate).toBeCloseTo(1 / 3);
    expect(flaky.reliability).toBe(reliabilityScore(0, 1 / 3));

    const broken = rows.find((r) => r.title === 'broken one')!;
    expect(broken).toMatchObject({ runs: 3, failed: 3, streak: 3, lastOutcome: 'failed', reliability: 0 });
    expect(broken.avgDurationMs).toBeNull(); // never passed
  });

  test.for([
    { status: 'flaky', expected: ['flaky one'] },
    { status: 'stable', expected: ['ignored one', 'stable one', 'stable one'] },
    { status: 'failed', expected: ['broken one'] },
    { status: 'skipped', expected: ['ignored one'] },
    { status: 'passed', expected: ['flaky one', 'stable one', 'stable one'] },
  ])('the $status bucket selects $expected', async ({ status, expected }, { tenant }) => {
    await seedExplorer(tenant);
    const { rows, total } = await exploreTests(tenant.project.id, { days: 30, status });
    expect(rows.map((r) => r.title).sort()).toEqual([...expected].sort());
    expect(total).toBe(expected.length);
  });

  test('the chronic bucket needs the streak or the run count, not just a bad rate', async ({ tenant }) => {
    await seedExplorer(tenant);
    // Three runs: a failure rate of 1, but below both CHRONIC_STREAK and CHRONIC_MIN_RUNS.
    expect((await exploreTests(tenant.project.id, { days: 30, status: 'chronic' })).rows).toEqual([]);

    // Two more failing runs push it over both thresholds.
    for (const i of [3, 4]) {
      await playRun(tenant.tokenProject, {
        ciRunId: `run-${i}`,
        startedAt: new Date(Date.now() - (5 - i) * 60_000),
        tests: [{ outcome: 'failed', file: CART, title: 'broken one', error: 'Error: cart is empty' }],
      });
    }
    const { rows } = await exploreTests(tenant.project.id, { days: 30, status: 'chronic' });
    expect(rows.map((r) => r.title)).toEqual(['broken one']);
    expect(rows[0]).toMatchObject({ runs: CHRONIC_MIN_RUNS, streak: CHRONIC_STREAK });
  });

  test('filters by tag overlap, platform and environment', async ({ tenant }) => {
    await seedExplorer(tenant);

    // A tag filter used to reach Postgres as a bare string and raise
    // "malformed array literal"; each tag is bound on its own now.
    const smoke = await exploreTests(tenant.project.id, { days: 30, tags: ['@smoke'] });
    expect(smoke.rows.map((r) => r.title).sort()).toEqual(['flaky one', 'stable one']);

    const either = await exploreTests(tenant.project.id, { days: 30, tags: ['@smoke', '@slow'] });
    expect(either.rows.map((r) => r.title).sort()).toEqual(['broken one', 'flaky one', 'stable one']);

    expect((await exploreTests(tenant.project.id, { days: 30, tags: ['@nobody-uses-this'] })).rows).toEqual([]);

    const firefox = await exploreTests(tenant.project.id, { days: 30, platform: 'firefox' });
    expect(firefox.rows.map((r) => [r.title, r.pwProject])).toEqual([['stable one', 'firefox']]);

    // Only the newest run used `prod`.
    const prod = await exploreTests(tenant.project.id, { days: 30, environment: 'prod' });
    expect(prod.rows.every((r) => r.runs === 1)).toBe(true);
  });

  test('treats a valid q as a regex and falls back to ilike for an invalid one', async ({ tenant }) => {
    await seedExplorer(tenant);

    const regex = await exploreTests(tenant.project.id, { days: 30, q: '^(flaky|broken) one$' });
    expect(regex.rows.map((r) => r.title).sort()).toEqual(['broken one', 'flaky one']);

    // Case-insensitive, as `~*` implies.
    expect((await exploreTests(tenant.project.id, { days: 30, q: 'STABLE' })).rows).toHaveLength(2);

    // `[` is not a valid regex: the query must not explode, it matches literally.
    const invalid = await exploreTests(tenant.project.id, { days: 30, q: 'broken [' });
    expect(invalid.rows).toEqual([]);
    const literal = await exploreTests(tenant.project.id, { days: 30, q: 'cart.spec[' });
    expect(literal.rows).toEqual([]);
  });

  test('sorts by the requested column and places nulls according to the direction', async ({ tenant }) => {
    await seedExplorer(tenant);

    const byTitle = await exploreTests(tenant.project.id, { days: 30, sort: 'title', dir: 'asc' });
    expect(byTitle.rows.map((r) => r.title)).toEqual(['broken one', 'flaky one', 'ignored one', 'stable one', 'stable one']);

    // `ignored one` was only ever skipped, so it has no reliability at all and
    // `nulls first` puts it ahead of the worst scoring test.
    const worstFirst = await exploreTests(tenant.project.id, { days: 30, sort: 'reliability', dir: 'asc' });
    expect(worstFirst.rows.map((r) => r.title).slice(0, 2)).toEqual(['ignored one', 'broken one']);
    expect(worstFirst.rows[0].reliability).toBeNull();

    const bestFirst = await exploreTests(tenant.project.id, { days: 30, sort: 'reliability', dir: 'desc' });
    expect(bestFirst.rows.at(-1)!.title).toBe('ignored one');

    // `ignored one` only ever skipped, so it has no average duration.
    const durationAsc = await exploreTests(tenant.project.id, { days: 30, sort: 'avgDuration', dir: 'asc' });
    expect(durationAsc.rows[0].avgDurationMs).toBeNull();
    const durationDesc = await exploreTests(tenant.project.id, { days: 30, sort: 'avgDuration', dir: 'desc' });
    expect(durationDesc.rows.at(-1)!.avgDurationMs).toBeNull();
  });

  test('total counts every matching row, not just the page', async ({ tenant }) => {
    await seedExplorer(tenant);
    const page = await exploreTests(tenant.project.id, { days: 30, pageSize: 2, page: 1, sort: 'title', dir: 'asc' });
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(5);

    const second = await exploreTests(tenant.project.id, { days: 30, pageSize: 2, page: 2, sort: 'title', dir: 'asc' });
    expect(second.rows.map((r) => r.title)).toEqual(['ignored one', 'stable one']);
    expect(second.total).toBe(5);
  });

  test('sees nothing outside the time window', async ({ tenant }) => {
    await playRun(tenant.tokenProject, { startedAt: new Date(Date.now() - 40 * DAY), tests: [{ outcome: 'passed' }] });
    expect((await exploreTests(tenant.project.id, { days: 30 })).total).toBe(0);
    expect((await exploreTests(tenant.project.id, { days: 90 })).total).toBe(1);
  });
});

describe('getTestOverview', () => {
  test('gathers history, unique errors, durations and sibling projects', async ({ db, tenant }) => {
    for (let i = 0; i < 4; i++) {
      await playRun(tenant.tokenProject, {
        ciRunId: `run-${i}`,
        startedAt: new Date(Date.now() - (4 - i) * DAY),
        tests: [
          {
            outcome: i < 2 ? 'failed' : 'passed',
            file: HOME,
            title: 'the test',
            durationMs: 100 * (i + 1),
            error: i === 0 ? 'Timeout 5000ms exceeded' : 'Timeout 9000ms exceeded',
          },
          { outcome: 'passed', file: HOME, title: 'the test', project: 'firefox' },
        ],
      });
    }
    const [target] = await db
      .select()
      .from(tests)
      .where(eq(tests.pwProject, 'chromium'))
      .limit(1);

    const overview = await getTestOverview(tenant.project.id, target.id, 30);
    expect(overview).not.toBeNull();
    expect(overview!.test.id).toBe(target.id);
    expect(overview!.history.map((h) => h.outcome)).toEqual(['passed', 'passed', 'failed', 'failed']);
    expect(overview!.stats).toMatchObject({ runs: 4, passed: 2, failed: 2, flaky: 0, skipped: 0 });
    expect(overview!.stats.reliability).toBe(reliabilityScore(2 / 4, 0));
    expect(overview!.stats.avgDurationMs).toBeCloseTo((300 + 400) / 2);
    expect(overview!.stats.p95DurationMs).toBeGreaterThanOrEqual(300);
    expect(overview!.stats.p95DurationMs).toBeLessThanOrEqual(400);

    // Both timeouts normalize to one signature; the sibling is the firefox row.
    expect(overview!.errors).toHaveLength(1);
    expect(overview!.errors[0]).toMatchObject({ count: 2, lastRunNumber: 2 });
    expect(overview!.siblings.map((s) => s.pwProject)).toEqual(['firefox']);
  });

  test('returns null for a test that belongs to another project', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    const [target] = await db.select().from(tests);

    expect(await getTestOverview(other.project.id, target.id, 30)).toBeNull();
    expect(await getTestOverview(tenant.project.id, '00000000-0000-4000-8000-000000000000', 30)).toBeNull();
  });
});
