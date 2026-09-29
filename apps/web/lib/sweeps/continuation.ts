/**
 * Continuing a retention sweep that ran out of time.
 *
 * A sweep is bounded by its request: a serverless function (Vercel) is killed
 * at its `maxDuration`, so every sweep stops starting batches at a time budget
 * and records `hasMore`. Left alone, the rest would wait for the next daily
 * cron. Instead, the sweep hands the rest to a fresh invocation of its cron
 * endpoint, which answers at once and sweeps in `after()` with a budget of its
 * own, and so on until nothing is due. Each link is a new request, so no single
 * one outlives its platform's limit.
 *
 * Continuing needs `CRON_SECRET` (the endpoint's credential) and the app's
 * public origin (`baseUrl()`). Without the secret the rest is left to the
 * next finished run, which continues a sweep that left work (see
 * `ingestSweepDue`), and to the daily cron.
 */
import { baseUrl } from '@/lib/auth/config';

export type SweepKind = 'artifacts' | 'data';

const PATHS: Record<SweepKind, string> = {
  artifacts: '/api/cron/artifact-retention',
  data: '/api/cron/data-retention',
};

/** Carries the link's number, so a chain that never drains stops. */
export const CONTINUATION_HEADER = 'x-sweep-continuation';

/** Links per chain: with a four-minute budget each, well over three hours of sweeping. */
export const MAX_CONTINUATIONS = 50;

/** The last sweep, as its log row records it. */
export interface SweepLogRow {
  startedAt: Date;
  finishedAt: Date | null;
  hasMore: boolean;
  error: string | null;
}

/**
 * Whether a finished run may start a sweep, given the latest one: when none
 * started within `intervalMs`, or when the latest stopped at its budget with
 * work left — the backlog then drains run by run instead of once per
 * interval. A sweep still running, or one that failed, is left alone.
 */
export function ingestSweepDue(latest: SweepLogRow | undefined, intervalMs: number, now = Date.now()): boolean {
  if (!latest) return true;
  if (now - latest.startedAt.getTime() >= intervalMs) return true;
  return latest.finishedAt !== null && latest.hasMore && !latest.error;
}

/**
 * Whether a sweep should hand the rest on: it stopped at its budget, did not
 * fail, got something done (a sweep that cannot make progress would only
 * chain empty links), and the chain is not at its cap.
 */
export function shouldContinue(result: { hasMore: boolean; error: string | null }, progress: number, link: number): boolean {
  return result.hasMore && !result.error && progress > 0 && link < MAX_CONTINUATIONS;
}

/** The link number a continuation request carries; `0` for a request that starts a chain. */
export function continuationLink(request: Request): number {
  const n = Number(request.headers.get(CONTINUATION_HEADER));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Asks a fresh invocation to continue the sweep, as link `link`. The endpoint
 * answers before it sweeps, so this returns in a moment; call it from
 * `after()`. Returns whether the continuation was accepted.
 */
export async function requestContinuation(kind: SweepKind, link: number): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  try {
    const res = await fetch(`${baseUrl()}${PATHS[kind]}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, [CONTINUATION_HEADER]: String(link) },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return true;
    console.error(`[retention] continuing the ${kind} sweep was refused: HTTP ${res.status}`);
  } catch (err) {
    console.error(`[retention] continuing the ${kind} sweep failed`, err);
  }
  return false;
}

/** Whether a sweep that stops with work left can be continued at all. */
export function canContinue(): boolean {
  return Boolean(process.env.CRON_SECRET);
}
