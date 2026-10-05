/**
 * Who may read an artifact: a valid signed link, or a session whose role in the
 * artifact's team grants `artifact:read` (a superadmin everywhere). Everybody
 * else gets a 404 — never a 403 — and the check costs one query at most.
 */
import { readableArtifact } from '@/lib/artifacts/access';
import { artifactSignature } from '@/lib/auth/artifact-url';
import { getAttachmentForProject } from '@/lib/ingest/service';
import { attachmentRef, playRun } from './factories';
import { afterEach, createMember, createTenant, createUserRow, describe, expect, test, vi, type Tenant } from './fixtures';

async function artifact(tenant: Tenant) {
  const ref = attachmentRef({ name: 'trace', contentType: 'application/zip' });
  await playRun(tenant.tokenProject, { tests: [{ outcome: 'failed', attachments: [ref] }] });
  return getAttachmentForProject(tenant.tokenProject, ref.id);
}

const read = (id: string, query = '') => readableArtifact(new Request(`http://test.local/api/artifacts/${id}${query ? `?${query}` : ''}`), id);
const status = async (id: string, query?: string) => {
  const result = await read(id, query);
  return result instanceof Response ? result.status : 200;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readableArtifact', () => {
  test('a team member of any role reads it', async ({ db, tenant, actor }) => {
    const row = await artifact(tenant);
    for (const role of ['admin', 'member', 'viewer'] as const) {
      actor.signIn(role === 'admin' ? tenant.adminUser : await createMember(db, tenant.team.id, role));
      const result = await read(row.id);
      expect(result).not.toBeInstanceOf(Response);
      expect(result).toMatchObject({ attachment: { id: row.id } });
    }
  });

  test('a superadmin without a membership reads it', async ({ db, tenant, actor }) => {
    const row = await artifact(tenant);
    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    expect(await status(row.id)).toBe(200);
  });

  test("another team's member gets a 404, like a missing id", async ({ db, tenant, actor }) => {
    const row = await artifact(tenant);
    const other = await createTenant(db);
    actor.signIn(other.adminUser);
    expect(await status(row.id)).toBe(404);
    expect(await status(crypto.randomUUID())).toBe(404);
    expect(await status('not-a-uuid')).toBe(404);
  });

  test('a signed link works without a session; a bad or expired one does not', async ({ tenant, actor }) => {
    const row = await artifact(tenant);
    actor.signIn(null);
    expect(await status(row.id, artifactSignature(row.id))).toBe(200);
    expect(await status(row.id)).toBe(404);
    expect(await status(row.id, artifactSignature(row.id, -60))).toBe(404);
    expect(await status(row.id, `exp=${Math.floor(Date.now() / 1000) + 60}&sig=forged`)).toBe(404);
    // A signature for one id does not open another.
    const other = await artifact(tenant);
    expect(await status(other.id, artifactSignature(row.id))).toBe(404);
    // A signed link for an id that does not exist is still a 404.
    const missing = crypto.randomUUID();
    expect(await status(missing, artifactSignature(missing))).toBe(404);
  });

  test('one query for a session, none without one', async ({ db, tenant, actor }) => {
    const row = await artifact(tenant);
    const select = vi.spyOn(db, 'select');

    actor.signIn(tenant.adminUser);
    expect(await status(row.id)).toBe(200);
    expect(select).toHaveBeenCalledTimes(1);

    select.mockClear();
    actor.signIn(null);
    expect(await status(row.id)).toBe(404);
    expect(select).not.toHaveBeenCalled();
  });
});
