import { eq } from 'drizzle-orm';
import { testCases } from '@/lib/db/schema';
import {
  bulkEditCases,
  createCase,
  createSuite,
  deleteCases,
  deleteSuite,
  updateCase,
} from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import { createMember, createTenant, describe, expect, test } from './fixtures';

describe('test case actions', () => {
  test('members write, viewers only read', async ({ db, tenant, actor }) => {
    const ref = { team: tenant.team.slug, project: tenant.project.slug };
    const member = await createMember(db, tenant.team.id, 'member');
    const viewer = await createMember(db, tenant.team.id, 'viewer');

    actor.signIn(member);
    const created = await createCase(ref, { title: 'Log in' });
    expect(created).toMatchObject({ ok: true, number: 1, message: 'TC-1 created.' });

    actor.signIn(viewer);
    await expect(createCase(ref, { title: 'Nope' })).resolves.toEqual({ ok: false, message: 'You do not have permission to do that.' });
    const [row] = await db.select().from(testCases).where(eq(testCases.projectId, tenant.project.id));
    await expect(updateCase(ref, row.id, { title: 'Changed' })).resolves.toMatchObject({ ok: false });
    await expect(deleteCases(ref, [row.id])).resolves.toMatchObject({ ok: false });

    actor.signIn(member);
    await expect(updateCase(ref, row.id, { title: 'Log in with a password' }, 1)).resolves.toMatchObject({ ok: true });
    await expect(updateCase(ref, row.id, { title: 'Stale' }, 1)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('changed by someone else') });
  });

  test('never reach into another project, and shrug off malformed ids', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    actor.signIn(other.adminUser);
    const theirs = await createCase({ team: other.team.slug, project: other.project.slug }, { title: 'Theirs' });
    expect(theirs.ok).toBe(true);
    const [row] = await db.select().from(testCases).where(eq(testCases.projectId, other.project.id));

    actor.signIn(tenant.adminUser);
    const ref = { team: tenant.team.slug, project: tenant.project.slug };
    // Not a member of the other team: its project does not exist for this user.
    await expect(createCase({ team: other.team.slug, project: other.project.slug }, { title: 'x' })).resolves.toMatchObject({ ok: false, message: 'Project not found.' });
    // Their case id, sent to this project, matches nothing here.
    await expect(updateCase(ref, row.id, { title: 'Hijacked' })).resolves.toMatchObject({ ok: false, message: 'That test case does not exist.' });
    await expect(deleteCases(ref, [row.id, 'not-a-uuid'])).resolves.toMatchObject({ ok: true, deleted: 0 });
    await expect(bulkEditCases(ref, [row.id], { priority: 'high' })).resolves.toMatchObject({ ok: true, updated: 0 });
    await expect(deleteSuite(ref, 'not-a-uuid')).resolves.toMatchObject({ ok: false });
    const [still] = await db.select().from(testCases).where(eq(testCases.id, row.id));
    expect(still.title).toBe('Theirs');
  });

  test('validation errors come back as messages', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const ref = { team: tenant.team.slug, project: tenant.project.slug };
    await expect(createCase(ref, { title: '   ' })).resolves.toEqual({ ok: false, message: 'A test case needs a title.' });
    await expect(createSuite(ref, { name: '', description: '', parentId: null })).resolves.toEqual({ ok: false, message: 'A suite needs a name.' });
  });
});
