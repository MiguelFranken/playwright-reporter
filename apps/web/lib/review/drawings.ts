/**
 * Drawings on review images, on their own: strokes, highlights, arrows, boxes
 * and ellipses a reviewer draws to show what they mean, without a comment.
 * One row per shape, so each can be erased.
 *
 * A drawing is about the pixels it was drawn on. A capture shows the drawings
 * made on it and on any capture of the same image (same test, checkpoint and
 * variant) with the same pixels; once the image changes, they stay with the
 * version they were drawn on. A comment that carries a drawing is a thread
 * (`threads.ts`), and follows the image as threads do.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { cleanMarkup, isFractionShape, markupToPixels, MAX_IMAGE_DRAWINGS, projectMarkup, type MarkupShape } from '@miguelfranken/ui/lib/review-markup';
import type { ImageSize } from '@miguelfranken/ui/lib/review-threads';
import { db } from '@/lib/db/drizzle';
import { reviewCaptures, reviewDrawings, users } from '@/lib/db/schema';

export class DrawingError extends Error {}

/** The most shapes one request saves or erases. */
export const MAX_DRAWINGS_PER_REQUEST = 50;

export interface DrawingRecord {
  id: string;
  testId: string;
  checkpointName: string;
  variant: string;
  originCaptureId: string | null;
  originSha256: string | null;
  origin: ImageSize;
  /** In the origin image's pixels. */
  shape: MarkupShape;
  createdBy: string | null;
  authorName: string | null;
  createdAt: Date;
}

/** A drawing as one capture shows it: its shape in fractions of that image. */
export interface CaptureDrawing extends DrawingRecord {
  position: MarkupShape;
}

/** What a capture needs for its drawings to be chosen and placed. */
export interface DrawingTarget {
  id: string;
  testId: string;
  checkpointName: string;
  variant: string;
  sha256: string | null;
  width: number | null;
  height: number | null;
}

const identityKey = (c: { testId: string; checkpointName: string; variant: string }) => `${c.testId}\u0000${c.checkpointName}\u0000${c.variant}`;
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

async function selectDrawings(where: ReturnType<typeof sql>): Promise<DrawingRecord[]> {
  const rows = await db
    .select({
      id: reviewDrawings.id,
      testId: reviewDrawings.testId,
      checkpointName: reviewDrawings.checkpointName,
      variant: reviewDrawings.variant,
      originCaptureId: reviewDrawings.originCaptureId,
      originSha256: reviewDrawings.originSha256,
      originWidth: reviewDrawings.originWidth,
      originHeight: reviewDrawings.originHeight,
      shape: reviewDrawings.shape,
      createdBy: reviewDrawings.createdBy,
      authorName: users.name,
      createdAt: reviewDrawings.createdAt,
    })
    .from(reviewDrawings)
    .leftJoin(users, eq(users.id, reviewDrawings.createdBy))
    .where(where)
    .orderBy(asc(reviewDrawings.createdAt), asc(reviewDrawings.id));
  return rows.map(({ originWidth, originHeight, ...r }) => ({ ...r, origin: { width: originWidth, height: originHeight } }));
}

/** Whether a capture shows a drawing, and where. */
export function placeDrawing(drawing: DrawingRecord, target: DrawingTarget): CaptureDrawing | null {
  if (identityKey(drawing) !== identityKey(target)) return null;
  const samePixels = drawing.originCaptureId === target.id || Boolean(target.sha256 && drawing.originSha256 === target.sha256);
  if (!samePixels) return null;
  const size = target.width && target.height ? { width: target.width, height: target.height } : null;
  return { ...drawing, position: projectMarkup([drawing.shape], drawing.origin, size)[0] };
}

/** The drawings each capture shows, oldest first. */
export async function drawingsForCaptures(targets: readonly DrawingTarget[]): Promise<Map<string, CaptureDrawing[]>> {
  const out = new Map<string, CaptureDrawing[]>();
  const unique = new Map(targets.map((c) => [identityKey(c), c]));
  if (unique.size === 0) return out;
  const tuples = [...unique.values()].map((c) => sql`(${c.testId}::uuid, ${c.checkpointName}, ${c.variant})`);
  const drawings = await selectDrawings(sql`(${reviewDrawings.testId}, ${reviewDrawings.checkpointName}, ${reviewDrawings.variant}) in (${sql.join(tuples, sql`, `)})`);
  if (drawings.length === 0) return out;
  for (const target of targets) {
    const shown = drawings.map((d) => placeDrawing(d, target)).filter((d): d is CaptureDrawing => d !== null);
    if (shown.length) out.set(target.id, shown);
  }
  return out;
}

/**
 * Saves shapes drawn on a capture, in fractions of the image as the browser
 * showed it, under the ids the browser chose. A capture that recorded no
 * size takes `imageSize`, the size the browser loaded. An id already saved
 * is left as it is: a retried request saves nothing twice.
 */
export async function createDrawings(input: {
  projectId: string;
  captureId: string;
  drawings: readonly { id: string; shape: unknown }[];
  imageSize?: ImageSize | null;
  userId: string | null;
}): Promise<{ created: number }> {
  if (!Array.isArray(input.drawings) || input.drawings.length === 0) throw new DrawingError('Draw something first.');
  if (input.drawings.length > MAX_DRAWINGS_PER_REQUEST) throw new DrawingError(`At most ${MAX_DRAWINGS_PER_REQUEST} shapes at once.`);
  for (const d of input.drawings) {
    if (!d || typeof d.id !== 'string' || !isId(d.id)) throw new DrawingError('That drawing has no valid id.');
    if (!isFractionShape(d.shape)) throw new DrawingError('That drawing cannot be saved: it is outside the image, or too large.');
  }
  if (!isId(input.captureId)) throw new DrawingError('That image is not in this project.');
  const [capture] = await db
    .select({
      id: reviewCaptures.id,
      testId: reviewCaptures.testId,
      checkpointName: reviewCaptures.checkpointName,
      variant: reviewCaptures.variant,
      sha256: reviewCaptures.sha256,
      width: reviewCaptures.width,
      height: reviewCaptures.height,
    })
    .from(reviewCaptures)
    .where(and(eq(reviewCaptures.projectId, input.projectId), eq(reviewCaptures.id, input.captureId)));
  if (!capture) throw new DrawingError('That image is not in this project.');
  const recorded = capture.width && capture.height ? { width: capture.width, height: capture.height } : null;
  const given = input.imageSize && input.imageSize.width > 0 && input.imageSize.height > 0 ? { width: Math.round(input.imageSize.width), height: Math.round(input.imageSize.height) } : null;
  const size = recorded ?? given;
  if (!size) throw new DrawingError('The image’s size is unknown, so a drawing cannot be placed on it.');

  const identity = and(eq(reviewDrawings.testId, capture.testId), eq(reviewDrawings.checkpointName, capture.checkpointName), eq(reviewDrawings.variant, capture.variant));
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(reviewDrawings).where(identity);
  if (Number(count) + input.drawings.length > MAX_IMAGE_DRAWINGS) throw new DrawingError(`An image holds at most ${MAX_IMAGE_DRAWINGS} drawings. Erase some first.`);

  const rows = input.drawings.map((d) => ({
    id: d.id.toLowerCase(),
    projectId: input.projectId,
    testId: capture.testId,
    checkpointName: capture.checkpointName,
    variant: capture.variant,
    originCaptureId: capture.id,
    originSha256: capture.sha256,
    originWidth: size.width,
    originHeight: size.height,
    shape: markupToPixels(cleanMarkup([d.shape as MarkupShape]), size)[0],
    createdBy: input.userId,
  }));
  const inserted = await db.insert(reviewDrawings).values(rows).onConflictDoNothing({ target: reviewDrawings.id }).returning({ id: reviewDrawings.id, projectId: reviewDrawings.projectId });
  return { created: inserted.length };
}

/**
 * Erases drawings: a person their own, a moderator anyone's. Ids no longer
 * there are skipped (erased already); one somebody else drew is refused,
 * and nothing is erased.
 */
export async function deleteDrawings(input: { projectId: string; drawingIds: readonly string[]; userId: string | null; moderate: boolean }): Promise<{ deleted: number }> {
  if (!Array.isArray(input.drawingIds) || input.drawingIds.length === 0) return { deleted: 0 };
  if (input.drawingIds.length > MAX_DRAWINGS_PER_REQUEST) throw new DrawingError(`At most ${MAX_DRAWINGS_PER_REQUEST} shapes at once.`);
  if (!input.drawingIds.every((id) => typeof id === 'string' && isId(id))) throw new DrawingError('That drawing is not in this project.');
  const ids = input.drawingIds.map((id) => id.toLowerCase());
  const found = await db
    .select({ id: reviewDrawings.id, createdBy: reviewDrawings.createdBy })
    .from(reviewDrawings)
    .where(and(eq(reviewDrawings.projectId, input.projectId), inArray(reviewDrawings.id, ids)));
  if (!input.moderate && found.some((d) => !input.userId || d.createdBy !== input.userId)) throw new DrawingError('Only whoever drew it can erase a drawing.');
  if (found.length === 0) return { deleted: 0 };
  const deleted = await db
    .delete(reviewDrawings)
    .where(
      and(
        eq(reviewDrawings.projectId, input.projectId),
        inArray(
          reviewDrawings.id,
          found.map((d) => d.id),
        ),
      ),
    )
    .returning({ id: reviewDrawings.id });
  return { deleted: deleted.length };
}
