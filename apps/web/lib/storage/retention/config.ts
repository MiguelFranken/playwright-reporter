/** When a finished run may start a sweep. Environment only, so it is unit tested without a database. */

/** A finished run starts a sweep only if none started for this long. */
export const INGEST_SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Whether a finished run may start a sweep. On by default so a self-hosted
 * instance needs no scheduler; `ARTIFACT_RETENTION_INGEST_SWEEP=off` leaves
 * it to the cron. Vercel previews never sweep: they share the production
 * database and store, and would run branch code against production data.
 */
export function ingestSweepEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ARTIFACT_RETENTION_INGEST_SWEEP?.trim().toLowerCase();
  if (v === 'off' || v === 'false' || v === '0') return false;
  if (env.VERCEL && env.VERCEL_ENV !== 'production') return false;
  return true;
}
