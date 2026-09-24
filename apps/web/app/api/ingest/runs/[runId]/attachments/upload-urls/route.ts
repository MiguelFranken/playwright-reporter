import { uploadUrlsRequestSchema } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireProjectToken } from '@/lib/ingest/http';
import { getRunForProject, uploadInstructions } from '@/lib/ingest/service';

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const project = await requireProjectToken(request);
    const run = await getRunForProject(project, runId);
    const body = await readJson(request, uploadUrlsRequestSchema);
    return json({ uploads: await uploadInstructions(run, body.attachmentIds) });
  } catch (err) {
    return errorResponse(err);
  }
}
