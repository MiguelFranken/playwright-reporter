import { timingSafeEqual } from 'node:crypto';
import { sweepExpiredData } from '@/lib/data-retention';

/**
 * The scheduled data retention sweep, the database's counterpart to
 * `/api/cron/artifact-retention`. Vercel Cron calls it daily (see
 * `vercel.json`) with `Authorization: Bearer $CRON_SECRET`; self-hosted, any
 * scheduler can do the same. Without `CRON_SECRET` the endpoint stays shut.
 */
export const maxDuration = 300;

/** Leaves headroom under `maxDuration` for the batch in flight and the bookkeeping. */
const BUDGET_MS = 240_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  if (!authorized(request.headers.get('authorization'), secret)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const result = await sweepExpiredData({ trigger: 'cron', budgetMs: BUDGET_MS });
  // A failed sweep fails the call, so the scheduler's own logs show it.
  const status = result.status === 'done' && result.error ? 500 : 200;
  return Response.json(result, { status, headers: { 'cache-control': 'no-store' } });
}

export const POST = GET;

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
