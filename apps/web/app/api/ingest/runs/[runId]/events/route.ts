import { eventBatchSchema } from '@repo/protocol';
import { errorResponse, json, readJson, requireProjectToken } from '@/lib/ingest/http';
import { getRunForProject, ingestEvents } from '@/lib/ingest/service';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const project = await requireProjectToken(request);
    const run = await getRunForProject(project, runId);
    const body = await readJson(request, eventBatchSchema);
    return json(await ingestEvents(project, run, body));
  } catch (err) {
    return errorResponse(err);
  }
}
