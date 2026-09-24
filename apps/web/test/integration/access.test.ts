/**
 * Cross-team isolation. Ported from `lib/auth/access.test.ts`: same assertions,
 * but on a private database, so there is no prefix bookkeeping and no cleanup.
 *
 * `notFound()` and `redirect()` throw, so the assertions check for a throw and
 * the reason carried in the Next.js error digest.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { AccessError, requireProject, requireProjectOr404, requireTeam, resolveProject, resolveTeam } from '@/lib/auth/access';
import { projects, teamMembers, users } from '@/lib/db/schema';
import { createMember, createTenant, createUserRow, describe, expect, pgError, test as base, type Db, type Tenant } from './fixtures';

interface World {
  a: Tenant;
  b: Tenant;
  superadmin: Awaited<ReturnType<typeof createUserRow>>;
  outsider: Awaited<ReturnType<typeof createUserRow>>;
  viewer: Awaited<ReturnType<typeof createMember>>;
}

/** Team A (admin) and team B (viewer) with a deliberately identical project slug. */
const test = base.extend<{ world: World }>({
  world: async ({ db }, use) => {
    const a = await createTenant(db, { teamSlug: 'team-a', projectSlug: 'web' });
    const b = await createTenant(db, { teamSlug: 'team-b', projectSlug: 'web' });
    // The tenant fixture makes its admin user an admin; team B is reached as a viewer.
    await db.delete(teamMembers).where(eq(teamMembers.userId, b.adminUser.id));
    const viewer = await createMember(db, b.team.id, 'viewer');
    const superadmin = await createUserRow(db, { instanceRole: 'superadmin', name: 'Root' });
    const outsider = await createUserRow(db, { name: 'Nobody' });
    await use({ a, b, superadmin, outsider, viewer });
  },
});

/** Next.js encodes `notFound()` / `redirect()` in the thrown error's digest. */
async function digestOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (typeof digest === 'string') return digest;
    throw error;
  }
  throw new Error('expected the call to throw');
}

describe('resolveTeam', () => {
  test('resolves a team the caller belongs to, with their role', async ({ actor, world }) => {
    actor.signIn(world.a.adminUser);
    const access = await resolveTeam(world.a.team.slug);
    expect(access?.team.id).toBe(world.a.team.id);
    expect(access?.role).toBe('admin');
  });

  test('returns null for a team the caller is not a member of', async ({ actor, world }) => {
    actor.signIn(world.a.adminUser);
    expect(await resolveTeam(world.b.team.slug)).toBeNull();
    actor.signIn(world.outsider);
    expect(await resolveTeam(world.a.team.slug)).toBeNull();
  });

  test('gives a superadmin a virtual role in every team without a membership row', async ({ db, actor, world }) => {
    actor.signIn(world.superadmin);
    for (const slug of [world.a.team.slug, world.b.team.slug]) {
      const access = await resolveTeam(slug);
      expect(access?.role).toBe('superadmin');
      expect(access?.can({ team: ['delete'] })).toBe(true);
    }
    const rows = await db.select().from(teamMembers).where(eq(teamMembers.userId, world.superadmin.id));
    expect(rows).toHaveLength(0);
  });

  test('returns null without a session', async ({ actor, world }) => {
    actor.signIn(null);
    expect(await resolveTeam(world.a.team.slug)).toBeNull();
  });
});

describe('resolveProject', () => {
  test('scopes a project slug to its team', async ({ actor, world }) => {
    expect(world.a.project.slug).toBe(world.b.project.slug);

    actor.signIn(world.a.adminUser);
    const a = await resolveProject(world.a.team.slug, 'web');
    expect(a?.project.id).toBe(world.a.project.id);
    // Same slug, other team: not reachable.
    expect(await resolveProject(world.b.team.slug, 'web')).toBeNull();

    actor.signIn(world.viewer);
    const b = await resolveProject(world.b.team.slug, 'web');
    expect(b?.project.id).toBe(world.b.project.id);
    expect(await resolveProject(world.a.team.slug, 'web')).toBeNull();
  });

  test('returns null for a project slug that does not exist in the team', async ({ actor, world }) => {
    actor.signIn(world.a.adminUser);
    expect(await resolveProject(world.a.team.slug, 'does-not-exist')).toBeNull();
  });
});

describe('requireTeam / requireProject', () => {
  test('404s rather than 403s on a foreign team, so URLs leak nothing', async ({ actor, world }) => {
    actor.signIn(world.a.adminUser);
    expect(await digestOf(() => requireTeam(world.b.team.slug))).toContain('404');
    expect(await digestOf(() => requireProject(world.b.team.slug, 'web'))).toContain('404');
  });

  test('404s when the caller lacks the requested permission', async ({ actor, world }) => {
    actor.signIn(world.viewer);
    // A viewer may read the team but not its ingest tokens.
    await expect(requireTeam(world.b.team.slug)).resolves.toBeTruthy();
    expect(await digestOf(() => requireProject(world.b.team.slug, 'web', { token: ['read'] }))).toContain('404');
  });

  test('redirects to /login without a session', async ({ actor, world }) => {
    actor.signIn(null);
    expect(await digestOf(() => requireTeam(world.a.team.slug))).toContain('/login');
    expect(await digestOf(() => requireProject(world.a.team.slug, 'web'))).toContain('/login');
  });

  test('lets a superadmin through everywhere', async ({ actor, world }) => {
    actor.signIn(world.superadmin);
    await expect(requireProject(world.a.team.slug, 'web', { token: ['create'] })).resolves.toBeTruthy();
    await expect(requireProject(world.b.team.slug, 'web', { project: ['delete'] })).resolves.toBeTruthy();
  });
});

describe('requireProjectOr404 (route handlers)', () => {
  test('throws an AccessError instead of navigating', async ({ actor, world }) => {
    actor.signIn(world.a.adminUser);
    await expect(requireProjectOr404(world.a.team.slug, 'web')).resolves.toBeTruthy();
    await expect(requireProjectOr404(world.b.team.slug, 'web')).rejects.toBeInstanceOf(AccessError);
    actor.signIn(null);
    await expect(requireProjectOr404(world.a.team.slug, 'web')).rejects.toBeInstanceOf(AccessError);
  });

  test('answers 404 for every denial', async ({ actor, world }) => {
    actor.signIn(world.viewer);
    await expect(requireProjectOr404(world.a.team.slug, 'web')).rejects.toSatisfy(
      (error: unknown) => error instanceof AccessError && error.status === 404 && error.toResponse().status === 404,
    );
  });
});

describe('project rows', () => {
  test('a slug may repeat across teams but not inside one', async ({ db, world }) => {
    const rows = await db.select().from(projects).where(eq(projects.slug, 'web'));
    expect(rows).toHaveLength(2);
    await expect(
      db.insert(projects).values({ id: randomUUID(), teamId: world.a.team.id, slug: 'web', name: 'Duplicate' }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'projects_team_slug_idx');
  });
});

describe('fixture hygiene', () => {
  test('each test starts from empty tables', async ({ db }: { db: Db }) => {
    // The `world` fixture is not requested here, so only what this test asks for exists.
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
