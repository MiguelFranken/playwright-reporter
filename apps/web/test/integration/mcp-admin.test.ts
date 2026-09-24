/**
 * The MCP switch in Administration → MCP and the "Test connection" action on
 * Account → AI assistants: who may flip the switch, that flipping it is
 * audited, and that the connection summary honours both the switch and the
 * environment kill switch.
 */
import { eq } from 'drizzle-orm';
import { testMcpConnection } from '@/app/(app)/account/ai/actions';
import { setMcpEnabled } from '@/app/(app)/admin/mcp/actions';
import { baseUrl } from '@/lib/auth/config';
import { getMcpSetting } from '@/lib/mcp/instance';
import { auditLogs } from '@/lib/db/schema';
import { afterEach, createMember, createTenant, createUserRow, describe, expect, test, vi } from './fixtures';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('setMcpEnabled', () => {
  test('lets a superadmin switch the server off and on, and audits each change', async ({ db, actor }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);

    expect(await setMcpEnabled(false)).toEqual({ ok: true, enabled: false, effective: false });
    expect((await getMcpSetting()).enabled).toBe(false);

    expect(await setMcpEnabled(true)).toEqual({ ok: true, enabled: true, effective: true });
    const setting = await getMcpSetting();
    expect(setting.enabled).toBe(true);
    expect(setting.updatedAt).toBeInstanceOf(Date);

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'mcp.settings.update'));
    expect(logs.map((l) => l.target)).toEqual(expect.arrayContaining([{ enabled: false }, { enabled: true }]));
    expect(logs.every((l) => l.actorId === root.id)).toBe(true);
  });

  test('reports that the environment still wins when MCP_ENABLED=false', async ({ db, actor }) => {
    vi.stubEnv('MCP_ENABLED', 'false');
    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    expect(await setMcpEnabled(true)).toEqual({ ok: true, enabled: true, effective: false });
  });

  test('refuses team admins, plain users and anonymous callers, and changes nothing', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await setMcpEnabled(false)).toEqual({ ok: false, message: 'Superadmins only.' });

    actor.signIn(await createUserRow(db));
    expect(await setMcpEnabled(false)).toEqual({ ok: false, message: 'Superadmins only.' });

    actor.signIn(null);
    expect(await setMcpEnabled(false)).toEqual({ ok: false, message: 'Sign in first.' });

    expect((await getMcpSetting()).enabled).toBe(true);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'mcp.settings.update'))).toHaveLength(0);
  });

  test('rejects a value that is not a boolean', async ({ db, actor }) => {
    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    expect(await setMcpEnabled('false' as unknown as boolean)).toEqual({ ok: false, message: 'Invalid value.' });
  });
});

describe('testMcpConnection', () => {
  test('summarises what an assistant signed in as the user would see', async ({ db, tenant, actor }) => {
    await createTenant(db); // another team's project, which must not appear
    const member = await createMember(db, tenant.team.id, 'viewer');
    actor.signIn(member);

    expect(await testMcpConnection()).toEqual({
      ok: true,
      enabled: true,
      disabledBy: null,
      projects: [`${tenant.team.slug}/${tenant.project.slug}`],
      url: `${baseUrl()}/api/mcp`,
    });
  });

  test('says who switched the server off: an administrator, or the environment', async ({ db, tenant, actor }) => {
    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    await setMcpEnabled(false);

    actor.signIn(tenant.adminUser);
    expect(await testMcpConnection()).toMatchObject({ ok: true, enabled: false, disabledBy: 'admin' });

    vi.stubEnv('MCP_ENABLED', 'false');
    expect(await testMcpConnection()).toMatchObject({ ok: true, enabled: false, disabledBy: 'environment' });
  });

  test('lists every project for a superadmin and none for a user without a team', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    const res = await testMcpConnection();
    expect(res.ok && [...res.projects].sort()).toEqual(
      [`${tenant.team.slug}/${tenant.project.slug}`, `${other.team.slug}/${other.project.slug}`].sort(),
    );

    actor.signIn(await createUserRow(db));
    expect(await testMcpConnection()).toMatchObject({ ok: true, projects: [] });
  });

  test('refuses an anonymous caller', async ({ actor }) => {
    actor.signIn(null);
    expect(await testMcpConnection()).toEqual({ ok: false, message: 'Sign in first.' });
  });
});
