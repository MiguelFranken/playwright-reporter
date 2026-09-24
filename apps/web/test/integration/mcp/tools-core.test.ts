/**
 * The `core` toolset end to end: project resolution and isolation, then each
 * tool against runs played through the real ingest service.
 */
import { eq } from 'drizzle-orm';
import { runs, teamMembers } from '@/lib/db/schema';
import { playRun } from '../factories';
import { createMember, createTenant, createUserRow, describe, expect, test, type Tenant } from '../fixtures';
import { ERAS, call, createPat, mcpClient, text } from './client';

const HOUR = 3_600_000;

/** Three runs on main, one on a feature branch: a flaky test, a regression, a slow test. */
async function seedHistory(tenant: Tenant) {
  const t0 = Date.now() - 10 * HOUR;
  const at = (h: number) => new Date(t0 + h * HOUR);
  await playRun(tenant.tokenProject, {
    startedAt: at(0),
    shortSha: 'aaa1111',
    message: 'First',
    tests: [
      { title: 'checkout works', file: 'tests/checkout.spec.ts', outcome: 'passed', durationMs: 1000 },
      { title: 'login works', file: 'tests/login.spec.ts', outcome: 'flaky', error: 'Timeout 5000ms exceeded waiting for locator' },
      { title: 'search is slow', file: 'tests/search.spec.ts', outcome: 'passed', durationMs: 9000 },
    ],
  });
  await playRun(tenant.tokenProject, {
    startedAt: at(1),
    shortSha: 'bbb2222',
    message: 'Second',
    tests: [
      { title: 'checkout works', file: 'tests/checkout.spec.ts', outcome: 'passed', durationMs: 1100 },
      { title: 'login works', file: 'tests/login.spec.ts', outcome: 'passed' },
      { title: 'search is slow', file: 'tests/search.spec.ts', outcome: 'passed', durationMs: 9500 },
    ],
  });
  await playRun(tenant.tokenProject, {
    startedAt: at(2),
    shortSha: 'ccc3333',
    message: 'Break checkout',
    tests: [
      { title: 'checkout works', file: 'tests/checkout.spec.ts', outcome: 'failed', error: 'expect(received).toBe(expected)\nExpected: 3\nReceived: 2' },
      { title: 'login works', file: 'tests/login.spec.ts', outcome: 'flaky', error: 'Timeout 5000ms exceeded waiting for locator' },
      { title: 'search is slow', file: 'tests/search.spec.ts', outcome: 'passed', durationMs: 12000 },
    ],
  });
  await playRun(tenant.tokenProject, {
    startedAt: at(3),
    branch: 'feature/cart',
    shortSha: 'ddd4444',
    environment: 'preview',
    tests: [{ title: 'checkout works', file: 'tests/checkout.spec.ts', outcome: 'passed' }],
  });
}

describe('project resolution and isolation', () => {
  test('uses the only project without being told', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser);
    const client = await mcpClient({ token });
    const result = await call(client, 'list_runs');
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.project).toBe(`${tenant.team.slug}/${tenant.project.slug}`);
  });

  test('asks which project when several are readable, and takes a connection default', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await db.insert(teamMembers).values({ teamId: other.team.id, userId: tenant.adminUser.id, role: 'viewer' });
    const { token } = await createPat(tenant.adminUser);

    const client = await mcpClient({ token });
    const result = await call(client, 'list_runs');
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('PROJECT_REQUIRED');
    expect(text(result)).toContain(`${other.team.slug}/${other.project.slug}`);

    const pinned = await mcpClient({ token, query: `?project=${other.team.slug}/${other.project.slug}` });
    expect((await call(pinned, 'list_runs')).structuredContent?.project).toBe(`${other.team.slug}/${other.project.slug}`);
  });

  test('picks the project whose runs came from the caller’s repository', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await db.insert(teamMembers).values({ teamId: other.team.id, userId: tenant.adminUser.id, role: 'viewer' });
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    await db.update(runs).set({ gitRepoUrl: 'https://github.com/acme/app' }).where(eq(runs.projectId, tenant.project.id));
    const { token } = await createPat(tenant.adminUser);
    const client = await mcpClient({ token, headers: { 'x-pw-reporter-repo': 'git@github.com:Acme/app.git' } });
    const whoami = await call(client, 'whoami');
    expect(whoami.structuredContent?.defaultProject).toEqual({ ref: `${tenant.team.slug}/${tenant.project.slug}`, resolvedBy: 'repository' });
  });

  test('a viewer of another team gets NOT_FOUND, never the data', async ({ db, tenant }) => {
    const other = await createTenant(db);
    const viewer = await createMember(db, other.team.id, 'viewer');
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    const { token } = await createPat(viewer);
    const client = await mcpClient({ token });
    const result = await call(client, 'list_runs', { project: `${tenant.team.slug}/${tenant.project.slug}` });
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  test('a team-restricted token cannot reach another team of the same user', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await db.insert(teamMembers).values({ teamId: other.team.id, userId: tenant.adminUser.id, role: 'admin' });
    const { token } = await createPat(tenant.adminUser, { teamIds: [tenant.team.id] });
    const client = await mcpClient({ token });
    const result = await call(client, 'list_runs', { project: `${other.team.slug}/${other.project.slug}` });
    expect(result.structuredContent?.error).toMatchObject({ code: 'NOT_FOUND' });
    const whoami = await call(client, 'whoami');
    expect((whoami.structuredContent?.teams as unknown[]).length).toBe(1);
  });

  test('a superadmin token without allTeams sees only its memberships', async ({ db, tenant }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    const limited = await mcpClient({ token: (await createPat(root)).token });
    expect((await call(limited, 'list_runs', { project: `${tenant.team.slug}/${tenant.project.slug}` })).isError).toBe(true);
    const everything = await mcpClient({ token: (await createPat(root, { allTeams: true })).token });
    expect((await call(everything, 'list_runs', { project: `${tenant.team.slug}/${tenant.project.slug}` })).isError).toBeFalsy();
  });

  test('losing a membership takes effect on the next call', async ({ db, tenant }) => {
    const viewer = await createMember(db, tenant.team.id, 'viewer');
    const client = await mcpClient({ token: (await createPat(viewer)).token });
    expect((await call(client, 'list_runs')).isError).toBeFalsy();
    await db.delete(teamMembers).where(eq(teamMembers.userId, viewer.id));
    expect((await call(client, 'list_runs')).isError).toBe(true);
  });
});

describe.each(ERAS)('core tools (%s)', (era) => {
  test('whoami describes the connection', async ({ tenant }) => {
    const client = await mcpClient({ token: (await createPat(tenant.adminUser, { name: 'Laptop' })).token, era });
    const result = await call(client, 'whoami');
    expect(result.structuredContent).toMatchObject({
      user: { email: tenant.adminUser.email, superadmin: false },
      credential: { kind: 'pat', name: 'Laptop', scopes: ['read'] },
      defaultProject: { resolvedBy: 'only-project' },
    });
    expect(text(result)).toContain(`${tenant.team.slug}/${tenant.project.slug}`);
  });

  test('list_runs filters, pages and links', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });

    const all = await call(client, 'list_runs', { limit: 2 });
    expect(all.structuredContent?.total).toBe(4);
    const runs = all.structuredContent?.runs as { number: number; url: string }[];
    expect(runs.map((r) => r.number)).toEqual([4, 3]);
    expect(runs[0].url).toBe(`http://test.local/teams/${tenant.team.slug}/projects/${tenant.project.slug}/runs/4`);
    expect(text(all)).toContain('Showing runs 1–2 of 4');

    const next = await call(client, 'list_runs', { limit: 2, cursor: all.structuredContent?.nextCursor as string });
    expect((next.structuredContent?.runs as { number: number }[]).map((r) => r.number)).toEqual([2, 1]);
    expect(next.structuredContent?.nextCursor).toBeNull();

    const mismatched = await call(client, 'list_runs', { limit: 2, branch: 'main', cursor: all.structuredContent?.nextCursor as string });
    expect(mismatched.structuredContent?.error).toMatchObject({ code: 'INVALID_ARGUMENT' });

    const failed = await call(client, 'list_runs', { status: 'failed', branch: 'main' });
    expect((failed.structuredContent?.runs as { number: number }[]).map((r) => r.number)).toEqual([3]);

    const byCommit = await call(client, 'list_runs', { commit: 'bbb2' });
    expect((byCommit.structuredContent?.runs as { number: number }[]).map((r) => r.number)).toEqual([2]);
  });

  test('get_run resolves "latest-failed" and groups failures', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const result = await call(client, 'get_run', { run: 'latest-failed', include: ['failures', 'specs'] });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { run: { number: number; counts: { failed: number; flaky: number } }; failureGroups: { category: string }[]; specs: unknown[] };
    expect(data.run.number).toBe(3);
    expect(data.run.counts).toMatchObject({ failed: 1, flaky: 1 });
    expect(data.failureGroups.map((g) => g.category).sort()).toEqual(['assertion', 'timeout']);
    expect(data.specs.length).toBeGreaterThan(0);

    const missing = await call(client, 'get_run', { run: '#99' });
    expect(missing.structuredContent?.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(text(missing)).toContain('latest run');
  });

  test('list_run_results lists problems first and filters by category', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const problems = await call(client, 'list_run_results', { run: 3 });
    const rows = problems.structuredContent?.results as { title: string; outcome: string; history: string; category: string | null }[];
    expect(rows.map((r) => r.outcome)).toEqual(['failed', 'flaky']);
    expect(rows[0].history).toBe('✓✓');
    expect(rows[0].category).toBe('assertion');

    const timeouts = await call(client, 'list_run_results', { run: 3, category: 'timeout' });
    expect((timeouts.structuredContent?.results as unknown[]).length).toBe(1);

    const everything = await call(client, 'list_run_results', { run: 3, outcome: ['passed', 'failed', 'flaky'], sort: 'duration' });
    expect((everything.structuredContent?.results as { title: string }[])[0].title).toContain('search is slow');
  });

  test('get_result shows attempts, errors and history, resolved by title', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const result = await call(client, 'get_result', { run: 3, test: 'login works' });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { outcome: string; attempts: { status: string; errors: { category: string }[] }[]; history: { strip: string } };
    expect(data.outcome).toBe('flaky');
    expect(data.attempts.map((a) => a.status)).toEqual(['failed', 'passed']);
    expect(data.attempts[0].errors[0].category).toBe('timeout');
    expect(data.history.strip).toBe('✓~');
    expect(text(result)).toContain('untrusted test output');
  });

  test('find_tests ranks by flakiness and duration trend', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const flaky = await call(client, 'find_tests', { status: 'flaky' });
    const tests = flaky.structuredContent?.tests as { title: string; flakyRate: number }[];
    expect(tests).toHaveLength(1);
    expect(tests[0].title).toContain('login works');
    expect(tests[0].flakyRate).toBeCloseTo(2 / 3);

    const byName = await call(client, 'find_tests', { search: 'checkout' });
    expect((byName.structuredContent?.tests as unknown[]).length).toBe(1);
  });

  test('get_test_history breaks a test down by branch', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const result = await call(client, 'get_test_history', { test: 'checkout works' });
    const data = result.structuredContent as { stats: { runs: number; failureRate: number }; byBranch: { branch: string }[]; recent: { outcome: string }[] };
    expect(data.stats.runs).toBe(4);
    expect(data.byBranch.map((b) => b.branch).sort()).toEqual(['feature/cart', 'main']);
    expect(data.recent.map((r) => r.outcome)).toEqual(['passed', 'failed', 'passed', 'passed']);
  });

  test('project_health ranks what to fix first', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const result = await call(client, 'project_health');
    const data = result.structuredContent as { fixFirst: { title: string; reason: string }[]; topErrors: unknown[] };
    expect(data.fixFirst.map((f) => f.title)).toEqual(expect.arrayContaining([expect.stringContaining('checkout works'), expect.stringContaining('login works')]));
    expect(data.topErrors.length).toBeGreaterThan(0);
  });

  test('list_filters returns the values the filters accept', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const result = await call(client, 'list_filters');
    const data = result.structuredContent as { branches: { name: string }[]; environments: { name: string }[]; defaultBranch: string };
    expect(data.branches.map((b) => b.name)).toEqual(['feature/cart', 'main']);
    expect(data.environments.map((e) => e.name).sort()).toEqual(['preview', 'staging']);
    expect(data.defaultBranch).toBe('main');
  });

  test('announces trimming instead of cutting silently', async ({ tenant }) => {
    await seedHistory(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const result = await call(client, 'get_test_history', { test: 'checkout works', maxChars: 1000 });
    expect(text(result)).toContain('Output trimmed at 1,000 characters');
    expect(result.structuredContent?.truncated).toBe(true);
    const json = await call(client, 'list_runs', { format: 'json' });
    expect(JSON.parse(text(json)).total).toBe(4);
  });
});
