/** Auth-related environment configuration, shared by the app and the seed. */

/**
 * Public origin of the app. An explicit `BASE_URL` wins; on Vercel it falls
 * back to the project's production domain, or to the deployment's own URL on
 * previews, so each deployment works without per-environment configuration.
 */
export function baseUrl() {
  return (process.env.BASE_URL ?? vercelUrl() ?? 'http://localhost:3000').replace(/\/+$/, '');
}

function vercelUrl() {
  const host =
    process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
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
