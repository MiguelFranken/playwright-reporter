/**
 * `/demo`: the passwordless sign-in to the read-only demo account, and what
 * that account may not do once it is signed in.
 */
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { removeMyAvatar } from '@/app/(app)/account/actions';
import { GET as demoRoute } from '@/app/demo/route';
import { getCurrentUser, resolveProject } from '@/lib/auth/access';
import { auth } from '@/lib/auth/auth';
import { DEMO_READ_ONLY, findDemoAccount } from '@/lib/auth/demo';
import { sessions, teamMembers, users } from '@/lib/db/schema';
import { proxy } from '@/proxy';
import { afterEach, createMember, createTenant, createUserRow, describe, expect, test, vi } from './fixtures';

const DEMO_EMAIL = 'demo@example.test';
const LANDING = '/teams/acme/projects/web-shop/dashboard';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** `null` leaves the landing path unset. */
function enableDemo(landing: string | null = LANDING) {
  vi.stubEnv('DEMO_USER_EMAIL', DEMO_EMAIL);
  vi.stubEnv('DEMO_LANDING_PATH', landing ?? undefined);
}

function visitDemo(headers?: HeadersInit) {
  return demoRoute(new Request('http://test.local/demo', { headers }));
}

/** Where a response redirects to, on this origin. */
function landedOn(response: Response) {
  const location = response.headers.get('location');
  if (!location) return null;
  const url = new URL(location);
  return url.origin === new URL(process.env.BASE_URL!).origin ? url.pathname : location;
}

/** The `name=value` pairs a browser would send back. */
function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function sessionsOf(db: typeof import('@/lib/db/drizzle').db, userId: string) {
  return db.select().from(sessions).where(eq(sessions.userId, userId));
}

describe('GET /demo', () => {
  test('is a 404 while no demo account is configured', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });

    const response = await visitDemo();

    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await db.select().from(sessions)).toEqual([]);
  });

  test('signs a visitor in as the demo viewer and lands on the demo project', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    enableDemo(`/teams/${tenant.team.slug}/projects/${tenant.project.slug}/dashboard`);
    const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL, name: 'Demo viewer' });

    const response = await visitDemo();

    expect(response.status).toBe(302);
    expect(landedOn(response)).toBe(`/teams/${tenant.team.slug}/projects/${tenant.project.slug}/dashboard`);
    // A browser-session cookie: nothing about the demo outlives the browser…
    const sessionCookie = response.headers.getSetCookie().find((c) => c.includes('session_token'));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).not.toMatch(/Max-Age|Expires/i);
    // …and a row that expires after a day rather than the usual two weeks.
    const [row] = await sessionsOf(db, demo.id);
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);

    // The cookie is a real session the access layer accepts, with viewer rights.
    actor.useRealSession({ cookie: cookieHeader(response) });
    expect(await getCurrentUser()).toMatchObject({ id: demo.id, email: DEMO_EMAIL, isSuperadmin: false });
    const access = await resolveProject(tenant.team.slug, tenant.project.slug);
    expect(access?.role).toBe('viewer');
    expect(access?.can({ project: ['delete'] })).toBe(false);
  });

  test('matches the configured email regardless of case', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    vi.stubEnv('DEMO_USER_EMAIL', '  Demo@Example.TEST ');
    await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });

    expect((await visitDemo()).status).toBe(302);
  });

  test('lands on / without a landing path, and never off the site', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });

    enableDemo(null);
    expect(landedOn(await visitDemo())).toBe('/');

    enableDemo('//evil.example/phish');
    expect(landedOn(await visitDemo())).toBe('/');
  });

  test('every visit gets a session of its own', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    enableDemo();
    const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });

    await visitDemo();
    await visitDemo();

    expect(await sessionsOf(db, demo.id)).toHaveLength(2);
  });

  test('leaves somebody who is signed in already signed in as themselves', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    enableDemo();
    const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });
    await auth.api.createUser({ body: { email: 'root@example.test', password: 'a-long-enough-password', name: 'Root', role: 'superadmin' } });
    const signIn = await auth.api.signInEmail({
      body: { email: 'root@example.test', password: 'a-long-enough-password' },
      asResponse: true,
    });

    const response = await visitDemo({ cookie: cookieHeader(signIn) });

    expect(response.status).toBe(302);
    expect(landedOn(response)).toBe(LANDING);
    expect(response.headers.getSetCookie().some((c) => c.includes('session_token='))).toBe(false);
    expect(await sessionsOf(db, demo.id)).toEqual([]);
  });

  describe('refuses an account that could change something', () => {
    test.for([
      ['a superadmin', { instanceRole: 'superadmin' }],
      ['an unknown instance role', { instanceRole: 'admin' }],
    ] as const)('%s', async ([, overrides], { db, tenant, actor }) => {
      actor.useRealSession();
      enableDemo();
      const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL, ...overrides });

      expect((await visitDemo()).status).toBe(404);
      expect(await sessionsOf(db, demo.id)).toEqual([]);
    });

    test.for(['member', 'admin'] as const)('a %s of any team, even when a viewer of another', async (role, { db, tenant, actor }) => {
      actor.useRealSession();
      enableDemo();
      const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });
      const other = await createTenant(db);
      await db.insert(teamMembers).values({ teamId: other.team.id, userId: demo.id, role });

      expect((await visitDemo()).status).toBe(404);
      expect(await sessionsOf(db, demo.id)).toEqual([]);
    });

    test('a banned account', async ({ db, tenant, actor }) => {
      actor.useRealSession();
      enableDemo();
      const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });
      await db.update(users).set({ banned: true }).where(eq(users.id, demo.id));

      expect((await visitDemo()).status).toBe(404);
    });

    test('an account in no team, or no account at all', async ({ db, actor }) => {
      actor.useRealSession();
      enableDemo();
      expect(await findDemoAccount()).toEqual({ ok: false, reason: 'account not found' });
      expect((await visitDemo()).status).toBe(404);

      await createUserRow(db, { email: DEMO_EMAIL });
      expect(await findDemoAccount()).toEqual({ ok: false, reason: 'account is in no team' });
      expect((await visitDemo()).status).toBe(404);
    });
  });

  test('is reachable without a session: the proxy does not send it to /login', () => {
    const response = proxy(new NextRequest('http://localhost:3000/demo'));
    expect(response.headers.get('location')).toBeNull();
    // A page next to it still is.
    expect(proxy(new NextRequest('http://localhost:3000/demo/x')).headers.get('location')).toContain('/login');
  });
});

describe('the signed-in demo account', () => {
  async function demoCookie(db: typeof import('@/lib/db/drizzle').db, teamId: string) {
    enableDemo();
    const demo = await createMember(db, teamId, 'viewer', { email: DEMO_EMAIL, name: 'Demo viewer' });
    return { demo, cookie: cookieHeader(await visitDemo()) };
  }

  test('cannot rename itself or change its password', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    const { demo, cookie } = await demoCookie(db, tenant.team.id);

    await expect(auth.api.updateUser({ body: { name: 'Vandal' }, headers: { cookie } })).rejects.toThrow(DEMO_READ_ONLY);
    await expect(
      auth.api.changePassword({ body: { currentPassword: 'whatever-it-is', newPassword: 'a-new-long-password' }, headers: { cookie } }),
    ).rejects.toThrow(DEMO_READ_ONLY);
    await expect(auth.api.revokeSessions({ headers: { cookie } })).rejects.toThrow(DEMO_READ_ONLY);

    const [row] = await db.select().from(users).where(eq(users.id, demo.id));
    expect(row.name).toBe('Demo viewer');
    expect(await sessionsOf(db, demo.id)).toHaveLength(1);
  });

  test("cannot list its sessions, which are the other visitors' browsers", async ({ db, tenant, actor }) => {
    actor.useRealSession();
    const { cookie } = await demoCookie(db, tenant.team.id);

    await expect(auth.api.listSessions({ headers: { cookie } })).rejects.toThrow(DEMO_READ_ONLY);
  });

  test('can still read its own session and sign out', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    const { demo, cookie } = await demoCookie(db, tenant.team.id);

    expect((await auth.api.getSession({ headers: { cookie } }))?.user.id).toBe(demo.id);
    await auth.api.signOut({ headers: { cookie } });
    expect(await sessionsOf(db, demo.id)).toEqual([]);
  });

  test('cannot change its profile image', async ({ db, tenant, actor }) => {
    enableDemo();
    const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });
    actor.signIn(demo);

    expect(await removeMyAvatar()).toEqual({ ok: false, message: DEMO_READ_ONLY });
  });

  test('other accounts are not affected by the restrictions', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    enableDemo();
    await auth.api.createUser({ body: { email: 'someone@example.test', password: 'a-long-enough-password', name: 'Someone' } });
    const signIn = await auth.api.signInEmail({
      body: { email: 'someone@example.test', password: 'a-long-enough-password' },
      asResponse: true,
    });
    const cookie = cookieHeader(signIn);
    void tenant;

    await expect(auth.api.listSessions({ headers: { cookie } })).resolves.toHaveLength(1);
    await expect(auth.api.updateUser({ body: { name: 'Renamed' }, headers: { cookie } })).resolves.toBeTruthy();
    const [row] = await db.select().from(users).where(eq(users.email, 'someone@example.test'));
    expect(row.name).toBe('Renamed');
  });
});
