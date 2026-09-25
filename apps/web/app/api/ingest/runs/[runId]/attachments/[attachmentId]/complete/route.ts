import { completeUploadRequestSchema, type CompleteUploadResponse } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireAttachmentToken } from '@/lib/ingest/http';
import { completeUpload } from '@/lib/ingest/service';

export async function POST(request: Request, { params }: { params: Promise<{ runId: string; attachmentId: string }> }) {
  try {
    const { attachmentId } = await params;
    const { attachment } = await requireAttachmentToken(request, attachmentId);
    const body = await readJson(request, completeUploadRequestSchema);
    await completeUpload(attachment, body.size);
    return json({ ok: true } satisfies CompleteUploadResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
