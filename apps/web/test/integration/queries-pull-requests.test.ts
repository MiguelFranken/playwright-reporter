/**
 * The pull requests pages: the list, a request's header, and the dashboard
 * aggregates and run list narrowed to one request. As on the branch pages, the
 * point of the scoped assertions is that a request sees its own runs only.
 */
import { dashboardStats, passFailTrend } from '@/lib/db/queries/dashboard';
import { getPullRequestOverview, pullRequestList } from '@/lib/db/queries/pull-requests';
import { listPullRequests, listRuns } from '@/lib/db/queries/runs';
import { playRun } from './factories';
import { describe, expect, test, type Tenant } from './fixtures';

const DAY = 24 * 60 * 60 * 1000;
const MR = 'https://gitlab.example/mop/app/-/merge_requests/1524';

/**
 * !1524 on `fix/cache`: run #1, 40 days old (outside 30 days); #2 (failed, from
 * an older reporter with no title or link) and #3 (passed, titled). #318 on
 * `feature/cart`: run #4 (failed). `main` with no request: #5.
 */
async function seed(tenant: Tenant) {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);
  await playRun(tenant.tokenProject, { ciRunId: 'old', branch: 'fix/cache', pr: { number: 1524 }, startedAt: at(40), tests: [{ outcome: 'passed', title: 'a' }] });
  await playRun(tenant.tokenProject, { ciRunId: 'p1', branch: 'fix/cache', pr: { number: 1524 }, startedAt: at(4), tests: [{ outcome: 'failed', title: 'a', error: 'boom' }] });
  await playRun(tenant.tokenProject, {
    ciRunId: 'p2',
    branch: 'fix/cache',
    environment: 'feature-fix-cache',
    pr: { number: 1524, url: MR, title: 'Stop caching prefilled forms' },
    startedAt: at(3),
    tests: [{ outcome: 'passed', title: 'a' }],
  });
  await playRun(tenant.tokenProject, {
    ciRunId: 'g1',
    branch: 'feature/cart',
    pr: { number: 318, url: 'https://github.com/acme/shop/pull/318', title: 'Guest cart' },
    startedAt: at(2),
    tests: [
      { outcome: 'failed', title: 'a', error: 'boom' },
      { outcome: 'passed', title: 'cart only' },
    ],
  });
  await playRun(tenant.tokenProject, { ciRunId: 'm1', branch: 'main', startedAt: at(1), tests: [{ outcome: 'passed', title: 'a' }] });
}

describe('pullRequestList', () => {
  test('lists each request in the range, most recently active first, with its latest title and link', async ({ tenant }) => {
    await seed(tenant);
    const { rows, total } = await pullRequestList(tenant.project.id, 30);

    expect(total).toBe(2);
    expect(rows.map((r) => r.number)).toEqual([318, 1524]);
    expect(rows[0]).toMatchObject({ title: 'Guest cart', branch: 'feature/cart', runs: 1, lastRunNumber: 4, lastStatus: 'failed', passRate: 0 });
    // The 40-day-old run is outside the range; the untitled run still counts.
    expect(rows[1]).toMatchObject({
      title: 'Stop caching prefilled forms',
      url: MR,
      branch: 'fix/cache',
      environment: 'feature-fix-cache',
      runs: 2,
      lastRunNumber: 3,
      lastStatus: 'passed',
      recentStatuses: ['passed', 'failed'],
      passRate: 0.5,
    });
  });

  test('finds a request by number, with or without its sigil, by branch or by title', async ({ tenant }) => {
    await seed(tenant);
    const numbers = async (q: string) => (await pullRequestList(tenant.project.id, 30, { q })).rows.map((r) => r.number);
    expect(await numbers('!1524')).toEqual([1524]);
    expect(await numbers('318')).toEqual([318]);
    expect(await numbers('CART')).toEqual([318]);
    expect(await numbers('prefilled')).toEqual([1524]);
    expect(await numbers('nope')).toEqual([]);
  });

  test('pages through the requests, counting all of them on every page', async ({ tenant }) => {
    await seed(tenant);
    const first = await pullRequestList(tenant.project.id, 30, { pageSize: 1 });
    const second = await pullRequestList(tenant.project.id, 30, { pageSize: 1, page: 2 });
    expect(first).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(first.rows.map((r) => r.number)).toEqual([318]);
    expect(second.rows.map((r) => r.number)).toEqual([1524]);
    expect(second.total).toBe(2);
  });
});

describe('getPullRequestOverview', () => {
  test('describes the request over all time, with the latest title a run reported', async ({ tenant }) => {
    await seed(tenant);
    const pr = await getPullRequestOverview(tenant.project.id, 1524);
    expect(pr).toMatchObject({ number: 1524, title: 'Stop caching prefilled forms', url: MR, branch: 'fix/cache', runs: 3, lastRunNumber: 3 });
    expect(pr!.firstRunAt.getTime()).toBeLessThan(Date.now() - 39 * DAY);
  });

  test('is null for a request no run reported', async ({ tenant }) => {
    await seed(tenant);
    expect(await getPullRequestOverview(tenant.project.id, 9)).toBeNull();
  });
});

describe('runs scoped to a pull request', () => {
  test('dashboard aggregates see only the request’s runs', async ({ tenant }) => {
    await seed(tenant);
    expect(await dashboardStats(tenant.project.id, 30, { prNumber: 318 })).toMatchObject({ trackedTests: 2, finishedRuns: 1, passedRuns: 0 });
    expect(await dashboardStats(tenant.project.id, 30, { prNumber: 1524 })).toMatchObject({ trackedTests: 1, finishedRuns: 2, passedRuns: 1 });
    expect((await passFailTrend(tenant.project.id, 30, { prNumber: 1524 })).map((p) => p.runNumber)).toEqual([1, 2, 3]);
  });

  test('listRuns filters by the request, and listPullRequests offers each one once', async ({ tenant }) => {
    await seed(tenant);
    expect((await listRuns(tenant.project.id, { prNumber: 1524 })).rows.map((r) => r.number)).toEqual([3, 2, 1]);
    expect(await listPullRequests(tenant.project.id)).toEqual([
      { number: 318, title: 'Guest cart', url: 'https://github.com/acme/shop/pull/318' },
      { number: 1524, title: 'Stop caching prefilled forms', url: MR },
    ]);
  });
});
