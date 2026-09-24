/**
 * The project's base branch (`settings.defaultBranch`), driven through the
 * Server Action the settings form calls. MCP tools compare against it, so the
 * action must merge into the jsonb without dropping neighbouring keys, and an
 * empty value must remove the key so the fallback takes over again.
 */
import { eq } from 'drizzle-orm';
import { updateDefaultBranch } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';
import { defaultBranch } from '@/lib/db/queries/mcp';
import { auditLogs, projects } from '@/lib/db/schema';
import { createMember, describe, expect, test, type Db } from './fixtures';

function form(team: string, project: string, value: string) {
  const data = new FormData();
  data.set('team', team);
  data.set('project', project);
  data.set('defaultBranch', value);
  return data;
}

async function settingsOf(db: Db, projectId: string) {
  const [row] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, projectId));
  return row.settings;
}

describe('updateDefaultBranch', () => {
  test('sets the branch, trims it, and keeps other settings keys', async ({ db, tenant, actor }) => {
    await db.update(projects).set({ settings: { staleTimeoutMs: 600_000 } }).where(eq(projects.id, tenant.project.id));
    actor.signIn(tenant.adminUser);

    const result = await updateDefaultBranch(null, form(tenant.team.slug, tenant.project.slug, '  develop  '));
    expect(result).toMatchObject({ ok: true });

    const settings = await settingsOf(db, tenant.project.id);
    expect(settings).toEqual({ staleTimeoutMs: 600_000, defaultBranch: 'develop' });
    expect(await defaultBranch(tenant.project.id, settings)).toBe('develop');

    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'project.update'));
    expect(entry).toMatchObject({ actorId: tenant.adminUser.id, teamId: tenant.team.id, projectId: tenant.project.id });
    expect(entry.target).toMatchObject({ defaultBranch: 'develop' });
  });

  test('an empty value removes the key and hands back to the fallback', async ({ db, tenant, actor }) => {
    await db
      .update(projects)
      .set({ settings: { staleTimeoutMs: 600_000, defaultBranch: 'develop' } })
      .where(eq(projects.id, tenant.project.id));
    actor.signIn(tenant.adminUser);

    const result = await updateDefaultBranch(null, form(tenant.team.slug, tenant.project.slug, '   '));
    expect(result).toMatchObject({ ok: true, message: 'Base branch cleared.' });

    const settings = await settingsOf(db, tenant.project.id);
    expect(settings).toEqual({ staleTimeoutMs: 600_000 });
    expect(await defaultBranch(tenant.project.id, settings)).toBe('main');
  });

  test('rejects a name over 200 characters without writing', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);

    const result = await updateDefaultBranch(null, form(tenant.team.slug, tenant.project.slug, 'x'.repeat(201)));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('200') });
    expect(await settingsOf(db, tenant.project.id)).toEqual({});
  });

  test('a viewer is denied and nothing changes', async ({ db, tenant, actor }) => {
    const viewer = await createMember(db, tenant.team.id, 'viewer');
    actor.signIn(viewer);

    const result = await updateDefaultBranch(null, form(tenant.team.slug, tenant.project.slug, 'develop'));
    expect(result).toMatchObject({ ok: false });
    expect(await settingsOf(db, tenant.project.id)).toEqual({});
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'project.update'))).toHaveLength(0);
  });
});
