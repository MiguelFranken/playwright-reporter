/**
 * The public REST API end to end, through the route handler with real
 * Requests: authentication, isolation, the endpoints over runs played through
 * the ingest service, parameter coercion, problem details and the rate limit.
 */
import { eq } from 'drizzle-orm';
import { GET } from '@/app/api/v1/[[...rest]]/route';
import { GET as openApiJson } from '@/app/api/v1/openapi.json/route';
import { rateLimits, teamMembers } from '@/lib/db/schema';
import { playRun } from '../factories';
import { afterEach, createMember, createTenant, describe, expect, test, vi, type Tenant } from '../fixtures';
import { createPat } from '../mcp/client';

afterEach(() => {
  vi.unstubAllEnvs();
});

function api(path: string, token?: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://test.local/api/v1${path}`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } }));
}

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const projectPath = (tenant: Tenant) => `/projects/${tenant.team.slug}/${tenant.project.slug}`;

async function seed(tenant: Tenant) {
  await playRun(tenant.tokenProject, {
    shortSha: 'aaa1111',
    tests: [
      { title: 'checkout works', file: 'tests/checkout.spec.ts', outcome: 'passed' },
      { title: 'login works', file: 'tests/login.spec.ts', outcome: 'passed' },
    ],
  });
  await playRun(tenant.tokenProject, {
    shortSha: 'bbb2222',
    tests: [
      { title: 'checkout works', file: 'tests/checkout.spec.ts', outcome: 'failed', error: 'expect(received).toBe(expected)\nExpected: 3\nReceived: 2' },
      { title: 'login works', file: 'tests/login.spec.ts', outcome: 'flaky', error: 'Timeout 5000ms exceeded' },
    ],
  });
}

describe('authentication', () => {
  test('answers 401 problem details without a token, with a challenge', async () => {
    const response = await api('/me');
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="api"');
    expect(await json(response)).toMatchObject({ status: 401, code: 'UNAUTHORIZED', title: 'Unauthorized' });
  });

  test('refuses ingest tokens, OAuth access tokens and unknown tokens', async ({ tenant }) => {
    for (const token of [tenant.token, 'pwr_oat_whatever', 'pwr_pat_not-a-real-one']) {
      const response = await api('/me', token);
      expect(response.status).toBe(401);
      expect((await json(response)).code).toBe('UNAUTHORIZED');
    }
  });

  test('refuses expired tokens', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser, { expiresAt: new Date(Date.now() - 1000) });
    expect((await api('/me', token)).status).toBe(401);
  });

  test('/me describes the token and what it can read', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser, { name: 'ci script' });
    const response = await api('/me', token);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await json<{ credential: { kind: string; name: string }; teams: { slug: string; projects: { ref: string }[] }[] }>(response);
    expect(body.credential).toMatchObject({ kind: 'pat', name: 'ci script' });
    expect(body.teams[0].projects[0].ref).toBe(`${tenant.team.slug}/${tenant.project.slug}`);
    expect(body).not.toHaveProperty('toolsets');
  });
});

describe('isolation', () => {
  test('another team’s project is a 404, the same as a missing one', async ({ db, tenant }) => {
    const other = await createTenant(db);
    const viewer = await createMember(db, other.team.id, 'viewer');
    await seed(tenant);
    const { token } = await createPat(viewer);
    const hidden = await api(`${projectPath(tenant)}/runs`, token);
    const missing = await api('/projects/nope/nope/runs', token);
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((await json(hidden)).code).toBe('NOT_FOUND');
  });

  test('/projects lists only what a team-restricted token may read', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await db.insert(teamMembers).values({ teamId: other.team.id, userId: tenant.adminUser.id, role: 'admin' });
    const { token } = await createPat(tenant.adminUser, { teamIds: [tenant.team.id] });
    const body = await json<{ projects: { ref: string }[] }>(await api('/projects', token));
    expect(body.projects.map((p) => p.ref)).toEqual([`${tenant.team.slug}/${tenant.project.slug}`]);
    expect((await api(`/projects/${other.team.slug}/${other.project.slug}/runs`, token)).status).toBe(404);
  });
});

describe('endpoints', () => {
  test('runs: list with coerced filters, one run by number and by "latest-failed"', async ({ tenant }) => {
    await seed(tenant);
    const { token } = await createPat(tenant.adminUser);

    const list = await json<{ total: number; runs: { number: number; status: string }[]; nextCursor: string | null }>(
      await api(`${projectPath(tenant)}/runs?limit=1&status=failed`, token),
    );
    expect(list.total).toBe(1);
    expect(list.runs).toHaveLength(1);
    expect(list.runs[0].status).toBe('failed');

    const byNumber = await json<{ run: { number: number } }>(await api(`${projectPath(tenant)}/runs/1`, token));
    expect(byNumber.run.number).toBe(1);
    const failed = await json<{ run: { number: number; status: string } }>(await api(`${projectPath(tenant)}/runs/latest-failed`, token));
    expect(failed.run).toMatchObject({ number: 2, status: 'failed' });
  });

  test('a run’s results, one result, its failure context and the run’s failure groups', async ({ tenant }) => {
    await seed(tenant);
    const { token } = await createPat(tenant.adminUser);
    const base = projectPath(tenant);

    const results = await json<{ results: { resultId: string; outcome: string; title: string }[] }>(
      await api(`${base}/runs/2/results?outcome=failed`, token),
    );
    expect(results.results.map((r) => r.title)).toEqual(['tests/checkout.spec.ts › checkout works']);
    const resultId = results.results[0].resultId;

    const result = await json<{ outcome: string; attempts: unknown[] }>(await api(`${base}/results/${resultId}`, token));
    expect(result.outcome).toBe('failed');
    expect(result.attempts.length).toBeGreaterThan(0);

    const context = await api(`${base}/results/${resultId}/failure-context`, token);
    expect(context.status).toBe(200);

    const groups = await json<{ totals: { failed: number } }>(await api(`${base}/runs/2/failure-groups`, token));
    expect(groups.totals.failed).toBe(1);
  });

  test('compare, tests, a test’s history and its flakiness verdict', async ({ tenant }) => {
    await seed(tenant);
    const { token } = await createPat(tenant.adminUser);
    const base = projectPath(tenant);

    const diff = await json<{ newFailures: { title: string }[] }>(await api(`${base}/runs/2/compare?base=1`, token));
    expect(diff.newFailures.map((t) => t.title)).toEqual(['tests/checkout.spec.ts › checkout works']);

    const tests = await json<{ tests: { testId: string; title: string }[] }>(await api(`${base}/tests?search=login&minRuns=1`, token));
    const login = tests.tests.find((t) => t.title.endsWith('login works'));
    expect(login).toBeDefined();

    const history = await json<{ test: { id: string } }>(await api(`${base}/tests/${login!.testId}`, token));
    expect(history.test.id).toBe(login!.testId);
    const flakiness = await api(`${base}/tests/${login!.testId}/flakiness`, token);
    expect(flakiness.status).toBe(200);
  });

  test('invalid parameters are a 400 with the validation issues', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser);
    const response = await api(`${projectPath(tenant)}/runs?limit=abc`, token);
    expect(response.status).toBe(400);
    const body = await json<{ code: string; details: unknown[] }>(response);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.details.length).toBeGreaterThan(0);
  });

  test('a tool error keeps its code: an unknown run is NOT_FOUND', async ({ tenant }) => {
    await seed(tenant);
    const { token } = await createPat(tenant.adminUser);
    const response = await api(`${projectPath(tenant)}/runs/999`, token);
    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  test('an unknown endpoint is a problem-details 404', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser);
    const response = await api('/nope', token);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
  });
});

describe('rate limit', () => {
  test('counts per token, reports the budget and answers 429 with Retry-After', async ({ db, tenant }) => {
    vi.stubEnv('MCP_RATE_LIMIT_PER_MINUTE', '2');
    const { token, id } = await createPat(tenant.adminUser);
    const first = await api('/me', token);
    expect(first.headers.get('ratelimit-limit')).toBe('2');
    expect(first.headers.get('ratelimit-remaining')).toBe('1');
    await api('/me', token);
    const third = await api('/me', token);
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toMatch(/^\d+$/);
    expect((await json(third)).code).toBe('RATE_LIMITED');
    expect(await db.select().from(rateLimits).where(eq(rateLimits.key, `mcp:pat:${id}`))).toHaveLength(1);
  });
});

describe('/api/v1/openapi.json', () => {
  test('describes this instance, without a token', async () => {
    const response = await openApiJson();
    expect(response.status).toBe(200);
    const doc = await json<{ openapi: string; servers: { url: string }[]; paths: Record<string, unknown> }>(response);
    expect(doc.openapi).toBe('3.1.1');
    expect(doc.servers[0].url).toMatch(/\/api\/v1$/);
    expect(doc.paths).toHaveProperty('/projects/{team}/{project}/runs');
  });
});
