import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { sweepDiffs } from '@/lib/review/diff/store';
import { sweepExpiredArtifacts } from '@/lib/storage/retention';
import { continuationLink, requestContinuation, shouldContinue } from '@/lib/sweeps/continuation';

/**
 * The scheduled artifact retention sweep. Vercel Cron calls it daily (see
 * `vercel.json`) with `Authorization: Bearer $CRON_SECRET`; self-hosted, any
 * scheduler can do the same (a Kubernetes CronJob, systemd timer, crontab
 * with curl). Without `CRON_SECRET` the endpoint stays shut.
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
    after(() => sweep(link).catch((err) => console.error('[retention] continued sweep failed', err)));
    return Response.json({ status: 'continuing', link }, { status: 202, headers: { 'cache-control': 'no-store' } });
  }
  const { result, diffsSwept } = await sweep(0);
  // A failed sweep fails the call, so the scheduler's own logs show it.
  const status = result.status === 'done' && result.error ? 500 : 200;
  return Response.json({ ...result, diffsSwept }, { status, headers: { 'cache-control': 'no-store' } });
}

export const POST = GET;

async function sweep(link: number) {
  const started = Date.now();
  const result = await sweepExpiredArtifacts({ trigger: 'cron', budgetMs: BUDGET_MS });
  // Then the image comparisons whose images the sweep (or a deleted run) took, with their overlays.
  let diffsSwept = 0;
  try {
    for (let n = -1; n !== 0 && Date.now() - started < BUDGET_MS; ) diffsSwept += n = await sweepDiffs();
  } catch (err) {
    console.error('[retention] diff sweep failed', err);
  }
  if (result.status === 'done' && shouldContinue(result, result.expiredCount, link)) {
    after(() => requestContinuation('artifacts', link + 1));
  }
  return { result, diffsSwept };
}

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
