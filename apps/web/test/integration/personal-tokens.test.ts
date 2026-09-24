/**
 * Personal access tokens: minting and revoking through the account Server
 * Actions, the lookup the MCP server authenticates with, and the guard that
 * keeps the two token kinds apart.
 */
import { eq } from 'drizzle-orm';
import { POST as postRun } from '@/app/api/ingest/runs/route';
import { createPersonalToken, revokePersonalToken } from '@/app/(app)/account/token-actions';
import { findActivePersonalToken, listPersonalTokens } from '@/lib/db/queries/personal-tokens';
import { auditLogs, personalAccessTokens, users } from '@/lib/db/schema';
import { hashToken } from '@/lib/tokens';
import { runStart } from './factories';
import { createMember, createTenant, createUserRow, describe, expect, test } from './fixtures';

async function mint(input: Partial<Parameters<typeof createPersonalToken>[0]> = {}) {
  const res = await createPersonalToken({ name: 'Claude Code', expiresInDays: 30, restriction: { kind: 'all' }, ...input });
  if (!res.ok) throw new Error(res.message);
  return res.token;
}

describe('createPersonalToken', () => {
  test('mints a token that is stored as a hash and resolves to its owner', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await mint();
    expect(token).toMatch(/^pwr_pat_[A-Za-z0-9_-]{43}$/);

    const [row] = await db.select().from(personalAccessTokens);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenPrefix).toBe(token.slice(0, 14));
    expect(row.scopes).toEqual(['read']);
    expect(row.teamIds).toBeNull();
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const found = await findActivePersonalToken(hashToken(token));
    expect(found?.user.id).toBe(tenant.adminUser.id);

    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'pat.create'));
    expect(log.target).toMatchObject({ name: 'Claude Code', prefix: row.tokenPrefix });
    expect(JSON.stringify(log.target)).not.toContain(token);
  });

  test('restricts a token to a team or a project the user can see', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await mint({ restriction: { kind: 'team', teamId: tenant.team.id } });
    await mint({ restriction: { kind: 'project', projectId: tenant.project.id } });
    const rows = await listPersonalTokens(tenant.adminUser.id);
    expect(rows.find((r) => r.projectId)?.projectSlug).toBe(tenant.project.slug);
    expect(rows.find((r) => r.projectId)?.teamIds).toEqual([tenant.team.id]);
    expect(rows.find((r) => !r.projectId)?.teamIds).toEqual([tenant.team.id]);
    void db;
  });

  test('refuses restrictions to teams or projects outside the user’s reach', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    actor.signIn(tenant.adminUser);
    expect(await createPersonalToken({ name: 'x', expiresInDays: 30, restriction: { kind: 'team', teamId: other.team.id } })).toEqual({
      ok: false,
      message: 'Team not found.',
    });
    expect(await createPersonalToken({ name: 'x', expiresInDays: 30, restriction: { kind: 'project', projectId: other.project.id } })).toEqual({
      ok: false,
      message: 'Project not found.',
    });
  });

  test('enforces the lifetime cap, a name, and the superadmin-only all-teams opt-in', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect((await createPersonalToken({ name: 'x', expiresInDays: 9999, restriction: { kind: 'all' } })).ok).toBe(false);
    expect((await createPersonalToken({ name: '  ', expiresInDays: 30, restriction: { kind: 'all' } })).ok).toBe(false);
    expect((await createPersonalToken({ name: 'x', expiresInDays: 30, restriction: { kind: 'all' }, allTeams: true })).ok).toBe(false);
  });

  test('lets a superadmin opt in to all teams', async ({ db, actor }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);
    await mint({ allTeams: true });
    const [row] = await db.select().from(personalAccessTokens);
    expect(row.allTeams).toBe(true);
  });

  test('requires a session', async ({ actor }) => {
    actor.signIn(null);
    expect((await createPersonalToken({ name: 'x', expiresInDays: 30, restriction: { kind: 'all' } })).ok).toBe(false);
  });
});

describe('revokePersonalToken', () => {
  test('revokes one of your own tokens, after which it no longer resolves', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await mint();
    const [row] = await db.select().from(personalAccessTokens);
    expect(await revokePersonalToken(row.id)).toEqual({ ok: true });
    expect(await findActivePersonalToken(hashToken(token))).toBeNull();
    expect((await revokePersonalToken(row.id)).ok).toBe(false);
  });

  test('cannot revoke somebody else’s token, unless a superadmin', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await mint();
    const [row] = await db.select().from(personalAccessTokens);

    const colleague = await createMember(db, tenant.team.id, 'admin');
    actor.signIn(colleague);
    expect(await revokePersonalToken(row.id)).toEqual({ ok: false, message: 'Token not found.' });

    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);
    expect(await revokePersonalToken(row.id)).toEqual({ ok: true });
  });
});

describe('findActivePersonalToken', () => {
  test('ignores expired tokens and tokens of banned users', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await mint();
    const hash = hashToken(token);

    await db.update(personalAccessTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await findActivePersonalToken(hash)).toBeNull();

    await db.update(personalAccessTokens).set({ expiresAt: new Date(Date.now() + 86_400_000) });
    await db.update(users).set({ banned: true }).where(eq(users.id, tenant.adminUser.id));
    expect(await findActivePersonalToken(hash)).toBeNull();

    // A ban that has run out no longer blocks the token.
    await db.update(users).set({ banExpires: new Date(Date.now() - 1000) }).where(eq(users.id, tenant.adminUser.id));
    expect(await findActivePersonalToken(hash)).not.toBeNull();
  });
});

describe('token kinds stay apart', () => {
  test('the reporter endpoint rejects a personal access token with a helpful message', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await mint();
    const response = await postRun(
      new Request('http://test.local/api/ingest/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(runStart()),
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error).toContain('personal access token');
  });
});
