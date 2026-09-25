import { runHeartbeatSchema } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireRunToken } from '@/lib/ingest/http';
import { heartbeat } from '@/lib/ingest/service';
import { afterIngest } from '@/lib/runs/watchdog';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { project, run } = await requireRunToken(request, runId);
    const body = await readJson(request, runHeartbeatSchema);
    const { watchdog, ...res } = await heartbeat(project, run, body);
    afterIngest(watchdog);
    return json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
