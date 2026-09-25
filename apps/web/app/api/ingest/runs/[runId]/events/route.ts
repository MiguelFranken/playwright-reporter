import { eventBatchSchema, type EventBatchResponse } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireRunToken } from '@/lib/ingest/http';
import { ingestEvents } from '@/lib/ingest/service';
import { afterIngest } from '@/lib/runs/watchdog';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { project, run } = await requireRunToken(request, runId);
    const body = await readJson(request, eventBatchSchema);
    const { watchdog, ...res } = await ingestEvents(project, run, body);
    afterIngest(watchdog);
    return json(res satisfies EventBatchResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
