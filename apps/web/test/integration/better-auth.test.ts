/**
 * 8.10 — the one suite that does not stub `getSession`. It creates an account
 * through Better Auth, signs in for a real cookie, puts that cookie in front of
 * the access layer and checks what comes back.
 */
import { eq } from 'drizzle-orm';
import { getCurrentUser, getSession, resolveTeam } from '@/lib/auth/access';
import { auth } from '@/lib/auth/auth';
import { accounts, rateLimits, sessions, teamMembers, users } from '@/lib/db/schema';
import { describe, expect, test } from './fixtures';

const PASSWORD = 'a-long-enough-password';

/** Signs in and returns the cookie header a browser would send back. */
async function signInCookie(email: string, password = PASSWORD) {
  const { headers } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  const setCookie = headers.get('set-cookie');
  if (!setCookie) throw new Error('sign-in returned no cookie');
  return setCookie
    .split(/,(?=[^;]+?=)/)
    .map((part) => part.split(';')[0].trim())
    .join('; ');
}

async function createAccount(email: string, name = 'Real User', role: 'user' | 'superadmin' = 'user') {
  await auth.api.createUser({ body: { email, password: PASSWORD, name, role } });
  const [user] = await (await import('@/lib/db/drizzle')).db.select().from(users).where(eq(users.email, email));
  return user;
}

describe('createUser', () => {
  test('creates the user row and a hashed credential account', async ({ db, actor }) => {
    actor.useRealSession();
    const user = await createAccount('real@example.test');

    expect(user).toMatchObject({ email: 'real@example.test', name: 'Real User', role: 'user', banned: false });

    const [account] = await db.select().from(accounts).where(eq(accounts.userId, user.id));
    expect(account.providerId).toBe('credential');
    // The password is hashed, never stored as given.
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(PASSWORD);
  });

  test('bypasses disableSignUp, which is what makes invitations work', async ({ actor }) => {
    actor.useRealSession();
    // The app sets emailAndPassword.disableSignUp, so the public route is closed…
    await expect(
      auth.api.signUpEmail({ body: { email: 'public@example.test', password: PASSWORD, name: 'Public' } }),
    ).rejects.toThrow();
    // …while the headerless admin endpoint the invite flow uses is not.
    await expect(createAccount('invited@example.test')).resolves.toMatchObject({ email: 'invited@example.test' });
  });

  test('refuses a second account with the same email', async ({ db, actor }) => {
    actor.useRealSession();
    await createAccount('dup@example.test');
    await expect(createAccount('dup@example.test')).rejects.toThrow();
    expect(await db.select().from(users).where(eq(users.email, 'dup@example.test'))).toHaveLength(1);
  });
});

describe('signInEmail', () => {
  test('issues a session cookie the access layer accepts', async ({ db, tenant, actor }) => {
    actor.useRealSession();
    const user = await createAccount('signin@example.test');
    await db.insert(teamMembers).values({ teamId: tenant.team.id, userId: user.id, role: 'member' });

    const cookie = await signInCookie('signin@example.test');
    actor.useRealSession({ cookie });

    const session = await getSession();
    expect(session?.user.email).toBe('signin@example.test');

    const current = await getCurrentUser();
    expect(current).toMatchObject({ id: user.id, email: 'signin@example.test', isSuperadmin: false });

    // …and the whole access layer works off it.
    const access = await resolveTeam(tenant.team.slug);
    expect(access).toMatchObject({ role: 'member' });

    const [row] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('marks a superadmin as one', async ({ actor }) => {
    actor.useRealSession();
    await createAccount('root@example.test', 'Root', 'superadmin');
    actor.useRealSession({ cookie: await signInCookie('root@example.test') });

    expect(await getCurrentUser()).toMatchObject({ isSuperadmin: true });
  });

  test('rejects the wrong password', async ({ actor }) => {
    actor.useRealSession();
    await createAccount('wrong@example.test');
    await expect(auth.api.signInEmail({ body: { email: 'wrong@example.test', password: 'not-the-password' } })).rejects.toThrow();
  });

  test('rejects an email that has no account', async ({ actor }) => {
    actor.useRealSession();
    await expect(auth.api.signInEmail({ body: { email: 'ghost@example.test', password: PASSWORD } })).rejects.toThrow();
  });

  test('a banned user cannot sign in', async ({ db, actor }) => {
    actor.useRealSession();
    await createAccount('banned@example.test');
    await db.update(users).set({ banned: true, banReason: 'Spam' }).where(eq(users.email, 'banned@example.test'));

    await expect(auth.api.signInEmail({ body: { email: 'banned@example.test', password: PASSWORD } })).rejects.toThrow();
  });

  test('there is no session without a cookie', async ({ actor }) => {
    actor.useRealSession();
    await createAccount('nobody@example.test');
    await signInCookie('nobody@example.test');

    // A fresh request with no cookie of its own sees nothing.
    actor.useRealSession();
    expect(await getSession()).toBeNull();
    expect(await getCurrentUser()).toBeNull();
  });

  test('a tampered cookie is not a session', async ({ actor }) => {
    actor.useRealSession();
    await createAccount('tamper@example.test');
    const cookie = await signInCookie('tamper@example.test');

    // Swap the first character of the value for a different one; always
    // writing `X` was a no-op whenever the token already started with it.
    const tampered = cookie.replace(/=(.)/, (_, first: string) => `=${first === 'X' ? 'Y' : 'X'}`);
    expect(tampered).not.toBe(cookie);

    actor.useRealSession({ cookie: tampered });
    expect(await getSession()).toBeNull();
  });
});

describe('rate limiting', () => {
  test('is backed by the rate_limits table', async ({ db, actor }) => {
    actor.useRealSession();
    await createAccount('limited@example.test');

    // Going through the HTTP handler is what engages the limiter.
    await auth.handler(
      new Request('http://test.local/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ email: 'limited@example.test', password: PASSWORD }),
      }),
    );

    const rows = await db.select().from(rateLimits);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].count).toBeGreaterThan(0);
  });
});
