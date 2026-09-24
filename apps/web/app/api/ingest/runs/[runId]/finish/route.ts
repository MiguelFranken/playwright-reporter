import { runFinishSchema } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireProjectToken } from '@/lib/ingest/http';
import { finishRun, getRunForProject } from '@/lib/ingest/service';
import { afterPush } from '@/lib/push';
import { afterIngest } from '@/lib/runs/watchdog';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const project = await requireProjectToken(request);
    const run = await getRunForProject(project, runId);
    const body = await readJson(request, runFinishSchema);
    const { watchdog, push, ...res } = await finishRun(project, run, body);
    afterIngest(watchdog);
    afterPush(push);
    return json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
