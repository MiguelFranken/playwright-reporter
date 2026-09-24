/** Auth-related environment configuration, shared by the app and the seed. */

export function baseUrl() {
  return (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Signs session cookies, the cookie cache and artifact URLs. Required in
 * production; development falls back to a fixed string so `pnpm dev` works on
 * a fresh clone (Better Auth would otherwise throw).
 */
export function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -hex 32`.');
  }
  console.warn('[auth] BETTER_AUTH_SECRET is not set; using an insecure development fallback.');
  return 'dev-only-insecure-secret-do-not-use-in-production';
}

export const COOKIE_PREFIX = 'pwr';

export function invitationTtlHours() {
  const n = Number(process.env.INVITATION_TTL_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 168; // 7 days
}

export function artifactUrlTtlSeconds() {
  const n = Number(process.env.ARTIFACT_URL_TTL_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 3600;
}
