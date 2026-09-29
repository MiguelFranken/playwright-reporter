import { runFinishSchema, type RunFinishResponse } from '@miguelfranken/protocol';
import { after } from 'next/server';
import { errorResponse, json, readJson, requireRunToken } from '@/lib/ingest/http';
import { finishRun } from '@/lib/ingest/service';
import { afterPush } from '@/lib/push';
import { afterRunFinished } from '@/lib/review/diff/dispatch';
import { sweepDiffs } from '@/lib/review/diff/store';
import { afterIngest } from '@/lib/runs/watchdog';
import { deletedTotal, ingestSweepEnabled as dataSweepEnabled, sweepDataAfterIngest } from '@/lib/data-retention';
import { ingestSweepEnabled, sweepAfterIngest } from '@/lib/storage/retention';
import { requestContinuation, shouldContinue } from '@/lib/sweeps/continuation';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { project, run } = await requireRunToken(request, runId);
    const body = await readJson(request, runFinishSchema);
    const { watchdog, push, ...res } = await finishRun(project, run, body);
    afterIngest(watchdog);
    afterPush(push);
    // The finish that ended the run (not a repeated one) has its images measured.
    if (push) afterRunFinished(run.id);
    // A finished run is the heartbeat that lets retention work without a
    // scheduler. The two sweeps run one after the other, artifacts first, so
    // they never compete for the same connections.
    if (res.runStatus !== 'running' && (ingestSweepEnabled() || dataSweepEnabled())) {
      // A sweep that runs out of time hands the rest to a fresh invocation.
      after(async () => {
        if (ingestSweepEnabled()) {
          const r = await sweepAfterIngest().catch((err) => console.error('[retention] ingest sweep failed', err));
          if (r?.status === 'done' && shouldContinue(r, r.expiredCount, 0)) await requestContinuation('artifacts', 1);
        }
        if (dataSweepEnabled()) {
          const r = await sweepDataAfterIngest().catch((err) => console.error('[data-retention] ingest sweep failed', err));
          if (r?.status === 'done' && shouldContinue(r, deletedTotal(r.deleted), 0)) await requestContinuation('data', 1);
        }
        await sweepDiffs({ limit: 200 }).catch((err) => console.error('[retention] diff sweep failed', err));
      });
    }
    return json(res satisfies RunFinishResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
