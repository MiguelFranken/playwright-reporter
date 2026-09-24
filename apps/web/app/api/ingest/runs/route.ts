import { runStartSchema } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireProjectToken } from '@/lib/ingest/http';
import { startRun } from '@/lib/ingest/service';
import { afterIngest } from '@/lib/runs/watchdog';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const project = await requireProjectToken(request);
    const body = await readJson(request, runStartSchema);
    const { watchdog, ...res } = await startRun(project, body);
    afterIngest(watchdog);
    return json(res, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
