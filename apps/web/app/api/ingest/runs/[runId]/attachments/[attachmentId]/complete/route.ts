import { completeUploadRequestSchema, type CompleteUploadResponse } from '@miguelfranken/protocol';
import { errorResponse, json, readJson, requireAttachmentToken } from '@/lib/ingest/http';
import { completeUpload } from '@/lib/ingest/service';

/**
 * A completion above this is logged with its three round trips (token lookup,
 * the store's `head`, the status update), to tell which one makes the slow
 * quarter of calls slow. Most calls finish well under it, so the log stays small.
 */
const SLOW_MS = 400;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string; attachmentId: string }> }) {
  try {
    const { attachmentId } = await params;
    const start = performance.now();
    const { attachment } = await requireAttachmentToken(request, attachmentId);
    const authMs = performance.now() - start;
    const body = await readJson(request, completeUploadRequestSchema);
    const { headMs, updateMs } = await completeUpload(attachment, body.size);
    const timing = { auth: authMs, head: headMs, update: updateMs };
    if (performance.now() - start > SLOW_MS) console.warn('[ingest] slow upload completion', roundTimings(timing));
    const response = json({ ok: true } satisfies CompleteUploadResponse);
    response.headers.set(
      'server-timing',
      Object.entries(timing)
        .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
        .join(', '),
    );
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}

function roundTimings(timing: Record<string, number>) {
  return Object.fromEntries(Object.entries(timing).map(([name, ms]) => [`${name}Ms`, Math.round(ms)]));
}
