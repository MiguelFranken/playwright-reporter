import { runFinishSchema } from '@miguelfranken/protocol';
import { after } from 'next/server';
import { errorResponse, json, readJson, requireRunToken } from '@/lib/ingest/http';
import { finishRun } from '@/lib/ingest/service';
import { afterPush } from '@/lib/push';
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
    // A finished run is the heartbeat that lets retention work without a
    // scheduler. The two sweeps run one after the other, artifacts first, so
    // they never compete for the same connections.
    if (res.runStatus !== 'running' && (ingestSweepEnabled() || dataSweepEnabled())) {
      after(async () => {
        if (ingestSweepEnabled()) await sweepAfterIngest().catch((err) => console.error('[retention] ingest sweep failed', err));
        if (dataSweepEnabled()) await sweepDataAfterIngest().catch((err) => console.error('[data-retention] ingest sweep failed', err));
      });
    }
    return json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
