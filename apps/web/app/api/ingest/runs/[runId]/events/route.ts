import { eventBatchSchema } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireProjectToken } from '@/lib/ingest/http';
import { getRunForProject, ingestEvents } from '@/lib/ingest/service';
import { afterIngest } from '@/lib/runs/watchdog';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const project = await requireProjectToken(request);
    const run = await getRunForProject(project, runId);
    const body = await readJson(request, eventBatchSchema);
    const { watchdog, ...res } = await ingestEvents(project, run, body);
    afterIngest(watchdog);
    return json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
