import { runFinishSchema, type RunFinishResponse } from '@miguelfranken/protocol';
import { after } from 'next/server';
import { errorResponse, json, readJson, requireRunToken } from '@/lib/ingest/http';
import { finishRun } from '@/lib/ingest/service';
import { afterPush } from '@/lib/push';
import { afterRunFinished } from '@/lib/review/diff/dispatch';
import { sweepDiffs } from '@/lib/review/diff/store';
import { afterIngest } from '@/lib/runs/watchdog';
import { ingestSweepEnabled as dataSweepEnabled, sweepDataAfterIngest } from '@/lib/data-retention';
import { ingestSweepEnabled, sweepAfterIngest } from '@/lib/storage/retention';

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
      after(async () => {
        if (ingestSweepEnabled()) await sweepAfterIngest().catch((err) => console.error('[retention] ingest sweep failed', err));
        if (dataSweepEnabled()) await sweepDataAfterIngest().catch((err) => console.error('[data-retention] ingest sweep failed', err));
        await sweepDiffs({ limit: 200 }).catch((err) => console.error('[retention] diff sweep failed', err));
      });
    }
    return json(res satisfies RunFinishResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
