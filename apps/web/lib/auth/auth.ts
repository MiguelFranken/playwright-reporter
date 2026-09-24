import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins';
import { db } from '@/lib/db/drizzle';
import * as schema from '@/lib/db/schema';
import { authSecret, baseUrl, COOKIE_PREFIX, trustedOrigins } from './config';
import { ac, superadminRole, userRole } from './permissions';

export const auth = betterAuth({
  appName: 'Playwright Reporter',
  baseURL: baseUrl(),
  secret: authSecret(),
  trustedOrigins: trustedOrigins(),
  database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
  advanced: {
    // Postgres generates the uuids (`gen_random_uuid()`); the adapter reports
    // `supportsUUIDs`, so Better Auth leaves the id column alone.
    database: { generateId: 'uuid' },
    cookiePrefix: COOKIE_PREFIX,
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // accounts are created by invitation or by a superadmin
    minPasswordLength: 10,
    requireEmailVerification: false,
    sendResetPassword: async () => {
      // No mailer yet: superadmins hand out temporary passwords instead.
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14, // 14 days
    updateAge: 60 * 60 * 24, // rolling refresh once a day
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    enabled: true, // also in development: catches configuration mistakes early
    storage: 'database',
    window: 60,
    max: 120,
    customRules: { '/sign-in/email': { window: 60, max: 10 } },
  },
  hooks: {
    // `users.image` belongs to the avatar actions, which validate and store the
    // bytes and write the column directly. Through Better Auth's own
    // `update-user` endpoint a client could point it at any URL at all.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/update-user' && ctx.body && 'image' in ctx.body) {
        throw new APIError('BAD_REQUEST', { message: 'Upload a profile image on the account page instead.' });
      }
    }),
  },
  plugins: [
    admin({ ac, roles: { superadmin: superadminRole, user: userRole }, adminRoles: ['superadmin'], defaultRole: 'user' }),
    nextCookies(), // must stay last
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
