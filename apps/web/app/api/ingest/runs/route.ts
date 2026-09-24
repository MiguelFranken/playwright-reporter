import { runStartSchema } from '@repo/protocol';
import { errorResponse, json, readJson, requireProjectToken } from '@/lib/ingest/http';
import { startRun } from '@/lib/ingest/service';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const project = await requireProjectToken(request);
    const body = await readJson(request, runStartSchema);
    return json(await startRun(project, body), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
