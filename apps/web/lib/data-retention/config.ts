/** When a finished run may start a data sweep. Environment only, so it is unit tested without a database. */

/** A finished run starts a sweep only if none started for this long. */
export const INGEST_SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Expired sessions, tokens and invitations stay this long after expiring, so a late "why was I signed out" still has its row. */
export const EXPIRED_GRACE_DAYS = 7;

/** Rate-limit windows are seconds long; a row untouched for a day counts for nothing. */
export const RATE_LIMIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Both sweep logs (artifacts and data) keep this many days of history. */
export const SWEEP_LOG_DAYS = 180;

/**
 * Whether a finished run may start a sweep. On by default so a self-hosted
 * instance needs no scheduler; `DATA_RETENTION_INGEST_SWEEP=off` leaves it to
 * the cron. Vercel previews never sweep: they share the production database
 * and would run branch code against production data.
 */
export function ingestSweepEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.DATA_RETENTION_INGEST_SWEEP?.trim().toLowerCase();
  if (v === 'off' || v === 'false' || v === '0') return false;
  if (env.VERCEL && env.VERCEL_ENV !== 'production') return false;
  return true;
}

/** What a superadmin types to arm "Purge history", which deletes every finished run. */
export const PURGE_CONFIRMATION = 'delete all run history';
