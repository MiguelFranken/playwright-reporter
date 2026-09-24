import { z } from 'zod';
import { errorResponse, json, readJson, requireProjectToken } from '@/lib/ingest/http';
import { completeUpload, getAttachmentForProject } from '@/lib/ingest/service';

const schema = z.object({ size: z.number().int().nonnegative().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ runId: string; attachmentId: string }> }) {
  try {
    const { attachmentId } = await params;
    const project = await requireProjectToken(request);
    const attachment = await getAttachmentForProject(project, attachmentId);
    const body = await readJson(request, schema);
    await completeUpload(attachment, body.size);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
