/**
 * The public demo: `/demo` signs a visitor in as one read-only account, so a
 * link in the README opens a real instance without a password.
 *
 * `DEMO_USER_EMAIL` names the account; without it `/demo` does not exist. The
 * account must be a plain user who is a `viewer` in every team it belongs to,
 * and that is checked on every sign-in, not only when the variable is set: a
 * demo account that was promoted later stops working instead of handing out
 * its new rights.
 */
import { eq } from 'drizzle-orm';
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import type { BetterAuthPlugin } from 'better-auth';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users } from '@/lib/db/schema';
import { safeNext } from './next-param';

export const DEMO_READ_ONLY = 'The demo account is read-only.';

export function demoUserEmail(): string | null {
  return process.env.DEMO_USER_EMAIL?.trim().toLowerCase() || null;
}

/** Where `/demo` lands; `/` routes a single-project viewer to its dashboard. */
export function demoLandingPath(): string {
  return safeNext(process.env.DEMO_LANDING_PATH);
}

export function isDemoUser(user: { email: string } | null | undefined): boolean {
  const email = demoUserEmail();
  return !!email && !!user && user.email.toLowerCase() === email;
}

export type DemoAccount = { id: string; email: string };

/**
 * The demo account, or why there is none. Only a viewer may be the demo
 * account: anything more would let every visitor of a public link change data.
 */
export async function findDemoAccount(): Promise<{ ok: true; user: DemoAccount } | { ok: false; reason: string }> {
  const email = demoUserEmail();
  if (!email) return { ok: false, reason: 'not configured' };
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) return { ok: false, reason: 'account not found' };
  if (user.role !== 'user') return { ok: false, reason: `instance role is ${user.role}` };
  if (user.banned) return { ok: false, reason: 'account is banned' };
  const memberships = await db.select({ role: teamMembers.role }).from(teamMembers).where(eq(teamMembers.userId, user.id));
  if (memberships.length === 0) return { ok: false, reason: 'account is in no team' };
  const elevated = memberships.find((m) => m.role !== 'viewer');
  if (elevated) return { ok: false, reason: `account is ${elevated.role} of a team` };
  return { ok: true, user: { id: user.id, email: user.email } };
}

/**
 * Better Auth endpoints the demo account may not call. It is shared by every
 * visitor, so none of them may rename it, change its password or email, or
 * delete it, and none may list its sessions: those are the other visitors'
 * IP addresses and browsers.
 */
const DEMO_BLOCKED = new Set([
  '/list-sessions',
  '/update-user',
  '/change-password',
  '/set-password',
  '/change-email',
  '/delete-user',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/revoke-session',
  '/unlink-account',
  '/link-social',
]);

export function demoPlugin() {
  return {
    id: 'demo',
    endpoints: {
      demoSignIn: createAuthEndpoint('/demo/sign-in', { method: 'GET' }, async (ctx) => {
        const landing = new URL(demoLandingPath(), ctx.context.baseURL).toString();
        // Somebody who is signed in already keeps their own session: a link in
        // a README must not sign a superadmin out.
        if (await getSessionFromCtx(ctx)) throw ctx.redirect(landing);

        const demo = await findDemoAccount();
        if (!demo.ok) {
          if (demo.reason !== 'not configured') console.warn(`[demo] sign-in refused: ${demo.reason}`);
          throw new APIError('NOT_FOUND', { message: 'There is no demo on this instance.' });
        }
        const user = await ctx.context.internalAdapter.findUserById(demo.user.id);
        if (!user) throw new APIError('NOT_FOUND', { message: 'There is no demo on this instance.' });
        // `dontRememberMe`: a session cookie, and a row that expires after a day.
        const session = await ctx.context.internalAdapter.createSession(user.id, true);
        if (!session) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not start a demo session.' });
        await setSessionCookie(ctx, { session, user }, true);
        throw ctx.redirect(landing);
      }),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => DEMO_BLOCKED.has(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (session && isDemoUser(session.user)) throw new APIError('FORBIDDEN', { message: DEMO_READ_ONLY });
          }),
        },
      ],
    },
    rateLimit: [{ pathMatcher: (path) => path === '/demo/sign-in', window: 60, max: 20 }],
  } satisfies BetterAuthPlugin;
}
