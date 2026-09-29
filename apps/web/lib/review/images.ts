/**
 * Review images as the MCP tools, the REST API and the annotated-image route
 * hand them out: the bytes of a capture, its threads as pins, and thread
 * positions in every coordinate system a reader might think in — the image's
 * pixels, percentages of it, and the page's CSS pixels.
 */
import { eq } from 'drizzle-orm';
import { describeAnchor, toPixels, type ImageSize } from '@miguelfranken/ui/lib/review-threads';
import { db } from '@/lib/db/drizzle';
import { attachments } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { readAll } from '@/lib/mcp/tools/get-artifact';
import type { CaptureRecord } from './queries';
import type { CaptureThread } from './threads';
import type { PinSpec } from './annotate';

/** The most bytes read to re-encode an image: a full page at 2× is large, what goes out is scaled. */
export const SOURCE_MAX_BYTES = 40 * 1024 * 1024;

/** A capture's image bytes, or `null` while it uploads, after retention, or past `max`. */
export async function readCaptureBytes(capture: Pick<CaptureRecord, 'attachment'>, max = SOURCE_MAX_BYTES): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (capture.attachment.status !== 'uploaded') return null;
  const [row] = await db
    .select({ storageKey: attachments.storageKey, sizeBytes: attachments.sizeBytes, contentType: attachments.contentType })
    .from(attachments)
    .where(eq(attachments.id, capture.attachment.id));
  if (!row || (row.sizeBytes ?? 0) > max) return null;
  const object = await getStorage().get(row.storageKey);
  if (!object) return null;
  const { bytes, complete } = await readAll(object.stream, max);
  return complete ? { bytes, contentType: row.contentType } : null;
}

/** The pins to draw: open threads, and resolved ones when asked. Threads about the whole image have none. */
export function pinSpecs(threads: readonly CaptureThread[], includeResolved = false): PinSpec[] {
  return threads
    .filter((t) => t.anchor.kind !== 'image' && (includeResolved || t.status === 'open'))
    .map((t) => ({ number: t.number, status: t.status, placement: t.placement, anchor: t.position }));
}

/** The size of the capture's image: recorded, else the thread's origin (for captures that recorded none). */
export function imageSizeOf(capture: Pick<CaptureRecord, 'width' | 'height'>, fallback?: ImageSize | null): ImageSize | null {
  if (capture.width && capture.height) return { width: capture.width, height: capture.height };
  return fallback ?? null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Where a thread points on a capture, in pixels, percent and CSS pixels. */
export function threadPosition(thread: CaptureThread, capture: Pick<CaptureRecord, 'width' | 'height' | 'deviceScaleFactor'>) {
  const size = imageSizeOf(capture, thread.origin)!;
  const a = thread.position;
  if (a.kind === 'image') return { kind: 'image' as const, pixels: null, percent: null, css: null, text: 'whole image' };
  const px = toPixels(a, size);
  const dpr = capture.deviceScaleFactor && capture.deviceScaleFactor > 0 ? capture.deviceScaleFactor : null;
  const css = dpr ? { x: Math.round(px.x / dpr), y: Math.round(px.y / dpr), w: px.w != null ? Math.round(px.w / dpr) : null, h: px.h != null ? Math.round(px.h / dpr) : null } : null;
  return {
    kind: a.kind,
    pixels: { x: px.x, y: px.y, w: px.w ?? null, h: px.h ?? null },
    percent: { x: round1(a.x * 100), y: round1(a.y * 100), w: a.w != null ? round1(a.w * 100) : null, h: a.h != null ? round1(a.h * 100) : null },
    css,
    text: `${describeAnchor(px)} px${css ? `, CSS ${describeAnchor({ kind: a.kind, ...css })}` : ''}, ${round1(a.x * 100)}% across, ${round1(a.y * 100)}% down`,
  };
}

/** A thread's comments as a tool reports them: who (and whether through an assistant), when, what. */
export function threadComments(thread: CaptureThread) {
  return thread.comments.map((c) => ({
    kind: c.kind,
    author: c.authorName ?? (c.source === 'mcp' ? 'AI assistant' : null),
    via: c.source,
    at: c.createdAt.toISOString(),
    body: c.body,
  }));
}
