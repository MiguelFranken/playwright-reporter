import { uploadUrlsRequestSchema } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireRunToken } from '@/lib/ingest/http';
import { uploadInstructions } from '@/lib/ingest/service';

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { run } = await requireRunToken(request, runId);
    const body = await readJson(request, uploadUrlsRequestSchema);
    return json({ uploads: await uploadInstructions(run, body.attachmentIds) });
  } catch (err) {
    return errorResponse(err);
  }
}
