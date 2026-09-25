/**
 * The session-free resolvers bearer-token callers (the MCP server) go through.
 * Same isolation guarantees as `access.test.ts`, plus the grant restrictions a
 * token can add on top of membership.
 */
import { eq } from 'drizzle-orm';
import { resolveProject } from '@/lib/auth/access';
import {
  listAccessibleProjects,
  resolveProjectByIdFor,
  resolveProjectFor,
  resolveTeamFor,
  type CurrentUser,
  type Grant,
  type Principal,
} from '@/lib/auth/principal';
import { projects, teamMembers, type User } from '@/lib/db/schema';
import { playRun } from './factories';
import { createMember, createTenant, createUserRow, describe, expect, test } from './fixtures';

const asUser = (u: User): CurrentUser => ({ id: u.id, email: u.email, name: u.name, image: null, isSuperadmin: u.role === 'superadmin' });
const grant = (overrides: Partial<Grant> = {}): Grant => ({
  kind: 'pat',
  id: 'test',
  scopes: ['read'],
  teamIds: null,
  projectId: null,
  allTeams: false,
  ...overrides,
});
const pat = (u: User, overrides: Partial<Grant> = {}): Principal => ({ user: asUser(u), grant: grant(overrides) });

describe('principal resolvers', () => {
  test('a token resolves the same project access as the session of its user', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const viaSession = await resolveProject(tenant.team.slug, tenant.project.slug);
    const viaToken = await resolveProjectFor(pat(tenant.adminUser), tenant.team.slug, tenant.project.slug);
    expect(viaToken?.project.id).toBe(viaSession?.project.id);
    expect(viaToken?.role).toBe(viaSession?.role);
  });

  test('a token restricted to one team cannot see another team the user belongs to', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await db.insert(teamMembers).values({ teamId: other.team.id, userId: tenant.adminUser.id, role: 'member' });
    const restricted = pat(tenant.adminUser, { teamIds: [tenant.team.id] });

    expect(await resolveTeamFor(restricted, tenant.team.slug)).not.toBeNull();
    expect(await resolveTeamFor(restricted, other.team.slug)).toBeNull();
    expect(await resolveProjectByIdFor(restricted, other.project.id)).toBeNull();
    const listed = await listAccessibleProjects(restricted);
    expect(listed.map((p) => p.project.id)).toEqual([tenant.project.id]);
  });

  test('a project-pinned token sees only that project', async ({ db, tenant }) => {
    const [second] = await db
      .insert(projects)
      .values({ id: crypto.randomUUID(), teamId: tenant.team.id, slug: 'second', name: 'Second' })
      .returning();
    const pinned = pat(tenant.adminUser, { projectId: tenant.project.id });
    expect(await resolveProjectFor(pinned, tenant.team.slug, tenant.project.slug)).not.toBeNull();
    expect(await resolveProjectFor(pinned, tenant.team.slug, 'second')).toBeNull();
    expect(await resolveProjectByIdFor(pinned, second.id)).toBeNull();
  });

  test('a project slug resolves only inside its own team, and only for members', async ({ db, tenant }) => {
    // Same project slug in a team the user is not a member of.
    const other = await createTenant(db, { projectSlug: tenant.project.slug });
    const me = pat(tenant.adminUser);
    expect((await resolveProjectFor(me, tenant.team.slug, tenant.project.slug))?.project.id).toBe(tenant.project.id);
    expect(await resolveProjectFor(me, other.team.slug, tenant.project.slug)).toBeNull();
    expect(await resolveProjectFor(me, tenant.team.slug, 'missing')).toBeNull();
    expect(await resolveProjectFor(me, 'missing', tenant.project.slug)).toBeNull();

    await db.insert(teamMembers).values({ teamId: other.team.id, userId: tenant.adminUser.id, role: 'viewer' });
    const access = await resolveProjectFor(me, other.team.slug, tenant.project.slug);
    expect(access?.project.id).toBe(other.project.id);
    expect(access?.team.id).toBe(other.team.id);
    expect(access?.role).toBe('viewer');
  });

  test('removing a membership takes effect on the next resolution', async ({ db, tenant }) => {
    const viewer = await createMember(db, tenant.team.id, 'viewer');
    expect((await resolveProjectByIdFor(pat(viewer), tenant.project.id))?.role).toBe('viewer');
    await db.delete(teamMembers).where(eq(teamMembers.userId, viewer.id));
    expect(await resolveProjectByIdFor(pat(viewer), tenant.project.id)).toBeNull();
  });

  test('a superadmin token needs allTeams to reach teams without a membership', async ({ db, tenant }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    expect(await resolveTeamFor(pat(root), tenant.team.slug)).toBeNull();
    expect((await resolveTeamFor(pat(root, { allTeams: true }), tenant.team.slug))?.role).toBe('superadmin');
    expect(await listAccessibleProjects(pat(root))).toEqual([]);
    expect((await listAccessibleProjects(pat(root, { allTeams: true }))).length).toBe(1);
  });

  test('accessible projects are ordered by their latest run', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await db.insert(teamMembers).values({ teamId: other.team.id, userId: tenant.adminUser.id, role: 'viewer' });
    await playRun(other.tokenProject, { tests: [{ outcome: 'passed' }] });
    const listed = await listAccessibleProjects(pat(tenant.adminUser));
    expect(listed.map((p) => p.project.id)).toEqual([other.project.id, tenant.project.id]);
    expect(listed[0].lastRunAt).toBeInstanceOf(Date);
    expect(listed[0].role).toBe('viewer');
  });
});
