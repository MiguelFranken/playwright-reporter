import { errorResponse, json, requireAttachmentToken } from '@/lib/ingest/http';
import { storeUpload } from '@/lib/ingest/service';

export const maxDuration = 120;

/** Proxy upload target: streams the request body into the configured storage adapter. */
export async function PUT(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { attachmentId } = await params;
    const { attachment } = await requireAttachmentToken(request, attachmentId);
    const size = await storeUpload(attachment, request.body, request.headers.get('content-type'));
    return json({ ok: true, size });
  } catch (err) {
    return errorResponse(err);
  }
}
