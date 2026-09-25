import { runStartSchema, type RunStartResponse } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireProjectToken } from '@/lib/ingest/http';
import { startRun } from '@/lib/ingest/service';
import { afterPush } from '@/lib/push';
import { afterIngest } from '@/lib/runs/watchdog';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const project = await requireProjectToken(request);
    const body = await readJson(request, runStartSchema);
    const { watchdog, push, ...res } = await startRun(project, body);
    afterIngest(watchdog);
    afterPush(push);
    return json(res satisfies RunStartResponse, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
