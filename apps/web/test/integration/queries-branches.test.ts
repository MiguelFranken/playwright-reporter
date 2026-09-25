/**
 * The branches pages: the branch list, a branch's header, and the dashboard
 * aggregates narrowed to one branch. The point of the scoped assertions is that
 * a branch sees its own runs only — the project-wide figures must not leak in.
 */
import { branchList, getBranchOverview } from '@/lib/db/queries/branches';
import { chronicFailures, dashboardStats, mostFlakyTests, passFailTrend } from '@/lib/db/queries/dashboard';
import { CHRONIC_STREAK } from '@/lib/metrics/score';
import { playRun } from './factories';
import { describe, expect, test, type Tenant } from './fixtures';

const DAY = 24 * 60 * 60 * 1000;

/**
 * `main`: runs #1 (failed), #2 (flaky, so passed) and #3 (passed).
 * `feature/cart`: run #4 (failed), which also introduces a test main never ran.
 * Plus #5 on `main`, 40 days old: outside a 30-day range.
 */
async function seed(tenant: Tenant) {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);
  await playRun(tenant.tokenProject, { ciRunId: 'm1', branch: 'main', startedAt: at(4), tests: [{ outcome: 'failed', title: 'a', error: 'boom' }] });
  await playRun(tenant.tokenProject, { ciRunId: 'm2', branch: 'main', startedAt: at(3), tests: [{ outcome: 'flaky', title: 'a' }] });
  await playRun(tenant.tokenProject, { ciRunId: 'm3', branch: 'main', startedAt: at(2), tests: [{ outcome: 'passed', title: 'a' }] });
  await playRun(tenant.tokenProject, {
    ciRunId: 'f1',
    branch: 'feature/cart',
    environment: 'preview',
    message: 'feat: cart\n\nlong body',
    startedAt: at(1),
    tests: [
      { outcome: 'failed', title: 'a', error: 'boom' },
      { outcome: 'passed', title: 'cart only' },
    ],
  });
  await playRun(tenant.tokenProject, { ciRunId: 'old', branch: 'main', startedAt: at(40), tests: [{ outcome: 'passed', title: 'a' }] });
}

describe('branchList', () => {
  test('lists each branch in the range, most recently active first', async ({ tenant }) => {
    await seed(tenant);
    const { rows, total } = await branchList(tenant.project.id, 30);

    expect(total).toBe(2);
    expect(rows.map((r) => r.branch)).toEqual(['feature/cart', 'main']);
    expect(rows[0]).toMatchObject({ runs: 1, environment: 'preview', lastRunNumber: 4, lastStatus: 'failed', passRate: 0, recentStatuses: ['failed'] });
    // The 40-day-old run is outside the range, so neither counted nor drawn.
    expect(rows[1]).toMatchObject({ runs: 3, lastRunNumber: 3, lastStatus: 'passed', recentStatuses: ['passed', 'passed', 'failed'] });
    expect(rows[1].passRate).toBeCloseTo(2 / 3);
    expect(rows[1].avgDurationMs).toBeGreaterThan(0);
  });

  test('filters by a case-insensitive substring of the branch name', async ({ tenant }) => {
    await seed(tenant);
    expect((await branchList(tenant.project.id, 30, { q: 'CART' })).rows.map((r) => r.branch)).toEqual(['feature/cart']);
    expect(await branchList(tenant.project.id, 30, { q: 'nope' })).toMatchObject({ rows: [], total: 0 });
  });

  test('pages through the branches, counting all of them on every page', async ({ tenant }) => {
    await seed(tenant);
    const first = await branchList(tenant.project.id, 30, { pageSize: 1 });
    const second = await branchList(tenant.project.id, 30, { pageSize: 1, page: 2 });
    expect(first).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(first.rows.map((r) => r.branch)).toEqual(['feature/cart']);
    expect(second).toMatchObject({ total: 2, page: 2 });
    expect(second.rows.map((r) => r.branch)).toEqual(['main']);
  });
});

describe('getBranchOverview', () => {
  test('describes the branch over all time, not just a range', async ({ tenant }) => {
    await seed(tenant);
    const main = await getBranchOverview(tenant.project.id, 'main');
    expect(main).toMatchObject({ branch: 'main', runs: 4, lastRunNumber: 3, lastStatus: 'passed' });
    expect(main!.firstRunAt.getTime()).toBeLessThan(Date.now() - 39 * DAY);

    const feature = await getBranchOverview(tenant.project.id, 'feature/cart');
    expect(feature).toMatchObject({ runs: 1, environment: 'preview', lastMessage: 'feat: cart\n\nlong body' });
  });

  test('is null for a branch that never ran', async ({ tenant }) => {
    await seed(tenant);
    expect(await getBranchOverview(tenant.project.id, 'feature/elsewhere')).toBeNull();
  });
});

describe('dashboard aggregates scoped to a branch', () => {
  test('dashboardStats counts only the branch’s runs and tests', async ({ tenant }) => {
    await seed(tenant);

    const main = await dashboardStats(tenant.project.id, 30, { branch: 'main' });
    expect(main).toMatchObject({ trackedTests: 1, finishedRuns: 3, passedRuns: 2 });
    // `a` first ran on main 40 days ago: not new to main within 30 days.
    expect(main.newTests).toBe(0);

    const feature = await dashboardStats(tenant.project.id, 30, { branch: 'feature/cart' });
    // Both tests are new *to this branch*, though `a` is old to the project.
    expect(feature).toMatchObject({ trackedTests: 2, newTests: 2, finishedRuns: 1, passedRuns: 0, runPassRate: 0 });

    const project = await dashboardStats(tenant.project.id, 30);
    expect(project).toMatchObject({ trackedTests: 2, finishedRuns: 4 });
  });

  test('passFailTrend returns only the branch’s runs', async ({ tenant }) => {
    await seed(tenant);
    expect((await passFailTrend(tenant.project.id, 30, { branch: 'main' })).map((p) => p.runNumber)).toEqual([5, 1, 2, 3]);
    expect((await passFailTrend(tenant.project.id, 30, { branch: 'feature/cart' })).map((p) => p.runNumber)).toEqual([4]);
  });

  test('mostFlakyTests only sees flakes on the branch', async ({ tenant }) => {
    await seed(tenant);
    expect((await mostFlakyTests(tenant.project.id, 30, 10, { branch: 'main' })).map((r) => r.title)).toEqual(['a']);
    expect(await mostFlakyTests(tenant.project.id, 30, 10, { branch: 'feature/cart' })).toEqual([]);
  });

  test('chronicFailures counts the streak on the branch alone', async ({ tenant }) => {
    // Broken on the feature branch every time, green on main in between.
    for (let i = 0; i < CHRONIC_STREAK; i++) {
      const startedAt = new Date(Date.now() - (CHRONIC_STREAK - i) * DAY);
      await playRun(tenant.tokenProject, { ciRunId: `f${i}`, branch: 'feature/x', startedAt, tests: [{ outcome: 'failed', title: 'broken', error: 'nope' }] });
      await playRun(tenant.tokenProject, { ciRunId: `m${i}`, branch: 'main', startedAt: new Date(startedAt.getTime() + 1000), tests: [{ outcome: 'passed', title: 'broken' }] });
    }

    const [row] = await chronicFailures(tenant.project.id, 30, 10, { branch: 'feature/x' });
    expect(row).toMatchObject({ title: 'broken', streak: CHRONIC_STREAK, runs: CHRONIC_STREAK });
    expect(await chronicFailures(tenant.project.id, 30, 10, { branch: 'main' })).toEqual([]);
  });
});
