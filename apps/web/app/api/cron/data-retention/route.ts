import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { deletedTotal, sweepExpiredData } from '@/lib/data-retention';
import { continuationLink, requestContinuation, shouldContinue } from '@/lib/sweeps/continuation';

/**
 * The scheduled data retention sweep, the database's counterpart to
 * `/api/cron/artifact-retention`. Vercel Cron calls it daily (see
 * `vercel.json`) with `Authorization: Bearer $CRON_SECRET`; self-hosted, any
 * scheduler can do the same. Without `CRON_SECRET` the endpoint stays shut.
 *
 * A sweep that runs out of time calls this endpoint again as a continuation
 * (`lib/sweeps/continuation`): that call is answered at once with 202 and
 * swept in `after()`, so the chain never waits on itself.
 */
export const maxDuration = 300;

/** Leaves headroom under `maxDuration` for the batch in flight and the bookkeeping. */
const BUDGET_MS = 240_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  if (!authorized(request.headers.get('authorization'), secret)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const link = continuationLink(request);
  if (link > 0) {
    after(() => sweep(link).catch((err) => console.error('[data-retention] continued sweep failed', err)));
    return Response.json({ status: 'continuing', link }, { status: 202, headers: { 'cache-control': 'no-store' } });
  }
  const result = await sweep(0);
  // A failed sweep fails the call, so the scheduler's own logs show it.
  const status = result.status === 'done' && result.error ? 500 : 200;
  return Response.json(result, { status, headers: { 'cache-control': 'no-store' } });
}

export const POST = GET;

async function sweep(link: number) {
  const result = await sweepExpiredData({ trigger: 'cron', budgetMs: BUDGET_MS });
  if (result.status === 'done' && shouldContinue(result, deletedTotal(result.deleted), link)) {
    after(() => requestContinuation('data', link + 1));
  }
  return result;
}

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
