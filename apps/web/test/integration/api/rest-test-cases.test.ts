/** The test case endpoints of the REST API: read-only, scoped to what the token can see. */
import { GET } from '@/app/api/v1/[[...rest]]/route';
import { createCase, createSuite } from '@/lib/test-cases/service';
import { createTenant, describe, expect, test, type Tenant } from '../fixtures';
import { createPat } from '../mcp/client';

function api(path: string, token: string) {
  return GET(new Request(`http://test.local/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } }));
}

const projectPath = (tenant: Tenant) => `/projects/${tenant.team.slug}/${tenant.project.slug}`;

describe('REST test cases', () => {
  test('lists, filters and reads cases and suites', async ({ tenant }) => {
    const ctx = { projectId: tenant.project.id, teamId: tenant.team.id, actorId: tenant.adminUser.id };
    const suite = await createSuite(ctx, { name: 'Checkout' });
    await createCase(ctx, { title: 'Pay by card', suiteId: suite.id, priority: 'high' });
    await createCase(ctx, { title: 'Loose', priority: 'low' });
    const { token } = await createPat(tenant.adminUser);

    const list = await api(`${projectPath(tenant)}/test-cases?priority=high`, token);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ total: 1, cases: [{ key: 'TC-1', title: 'Pay by card', suite: 'Checkout' }] });

    const one = await api(`${projectPath(tenant)}/test-cases/TC-2`, token);
    expect(await one.json()).toMatchObject({ key: 'TC-2', title: 'Loose', suite: null, linkedTests: [] });

    const suites = await api(`${projectPath(tenant)}/test-suites`, token);
    expect(await suites.json()).toMatchObject({ total: 2, unassigned: 1, suites: [{ path: 'Checkout', cases: 1 }] });

    expect((await api(`${projectPath(tenant)}/test-cases/TC-99`, token)).status).toBe(404);
  });

  test('another team’s cases stay invisible', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await createCase({ projectId: other.project.id, teamId: other.team.id, actorId: other.adminUser.id }, { title: 'Theirs' });
    const { token } = await createPat(tenant.adminUser);
    expect((await api(`${projectPath(other)}/test-cases`, token)).status).toBe(404);
  });
});
