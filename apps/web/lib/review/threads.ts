/**
 * Comment threads on review images: numbered pins on screenshots, the
 * conversation under each, and whether it is resolved.
 *
 * A thread belongs to an image's identity (test, checkpoint, variant), placed
 * on one capture — its origin — in that image's pixels. Which threads a
 * capture shows:
 * - open threads placed on it or on an earlier run's capture of the image, so
 *   a change request follows the image until somebody resolves it;
 * - resolved threads where they were placed or resolved, or on the same pixels.
 *
 * A pin is `exact` on the pixels it was placed on, `outdated` on an image that
 * changed since. Numbers count per identity and never change.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  isFractionAnchor,
  MAX_COMMENT_LENGTH,
  projectAnchor,
  toPixels,
  type CommentKind,
  type CommentSource,
  type FractionAnchor,
  type ImageSize,
  type ThreadAnchor,
  type ThreadPlacement,
  type ThreadStatus,
} from '@miguelfranken/ui/lib/review-threads';
import { db } from '@/lib/db/drizzle';
import { attachments, reviewCaptures, reviewComments, reviewThreads, runs, users, type Attachment } from '@/lib/db/schema';

export class ThreadError extends Error {}

const resolvers = alias(users, 'resolvers');
const originRuns = alias(runs, 'origin_runs');
const originCaptures = alias(reviewCaptures, 'origin_captures');
const originImages = alias(attachments, 'origin_images');

export interface CommentRecord {
  id: string;
  threadId: string;
  kind: CommentKind;
  body: string;
  source: CommentSource;
  userId: string | null;
  /** The AI agent that wrote it for `userId`, if one did. */
  agentName: string | null;
  authorName: string | null;
  authorImage: string | null;
  createdAt: Date;
  editedAt: Date | null;
}

export interface ThreadRecord {
  id: string;
  testId: string;
  checkpointName: string;
  variant: string;
  number: number;
  status: ThreadStatus;
  /** In the origin image's pixels. */
  anchor: ThreadAnchor;
  origin: ImageSize & { scale: number | null };
  originCaptureId: string | null;
  originSha256: string | null;
  /** The image the thread was placed on, while it is stored: what an outdated pin is compared with. */
  originImage: { attachment: { id: string; status: Attachment['status'] }; checkpointId: string } | null;
  originRunNumber: number | null;
  originRunStartedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolvedCaptureId: string | null;
  createdBy: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  comments: CommentRecord[];
}

/** A thread as one capture shows it: where its pin falls on that image, and whether the pixels changed. */
export interface CaptureThread extends ThreadRecord {
  placement: ThreadPlacement;
  position: FractionAnchor;
}

/** What a capture needs for its threads to be chosen and placed. */
export interface ThreadTarget {
  id: string;
  runId: string;
  testId: string;
  checkpointName: string;
  variant: string;
  sha256: string | null;
  width: number | null;
  height: number | null;
}

const identityKey = (c: { testId: string; checkpointName: string; variant: string }) => `${c.testId}\u0000${c.checkpointName}\u0000${c.variant}`;

const threadColumns = {
  id: reviewThreads.id,
  testId: reviewThreads.testId,
  checkpointName: reviewThreads.checkpointName,
  variant: reviewThreads.variant,
  number: reviewThreads.number,
  status: reviewThreads.status,
  anchorKind: reviewThreads.anchor,
  x: reviewThreads.x,
  y: reviewThreads.y,
  w: reviewThreads.w,
  h: reviewThreads.h,
  originWidth: reviewThreads.originWidth,
  originHeight: reviewThreads.originHeight,
  originScale: reviewThreads.originScale,
  originCaptureId: reviewThreads.originCaptureId,
  originSha256: reviewThreads.originSha256,
  originImageId: originImages.id,
  originImageStatus: originImages.status,
  originCheckpointId: originCaptures.checkpointId,
  originRunNumber: originRuns.number,
  originRunStartedAt: originRuns.startedAt,
  resolvedAt: reviewThreads.resolvedAt,
  resolvedBy: resolvers.name,
  resolvedCaptureId: reviewThreads.resolvedCaptureId,
  createdBy: reviewThreads.createdBy,
  createdAt: reviewThreads.createdAt,
  lastActivityAt: reviewThreads.lastActivityAt,
};

type ThreadRow = {
  [K in keyof typeof threadColumns]: unknown;
};

function toThread(r: ThreadRow, comments: CommentRecord[]): ThreadRecord {
  return {
    id: r.id as string,
    testId: r.testId as string,
    checkpointName: r.checkpointName as string,
    variant: r.variant as string,
    number: r.number as number,
    status: r.status as ThreadStatus,
    anchor: { kind: r.anchorKind as ThreadAnchor['kind'], x: r.x as number, y: r.y as number, w: r.w as number | null, h: r.h as number | null },
    origin: { width: r.originWidth as number, height: r.originHeight as number, scale: r.originScale as number | null },
    originCaptureId: r.originCaptureId as string | null,
    originSha256: r.originSha256 as string | null,
    originImage: r.originImageId
      ? { attachment: { id: r.originImageId as string, status: r.originImageStatus as Attachment['status'] }, checkpointId: r.originCheckpointId as string }
      : null,
    originRunNumber: r.originRunNumber as number | null,
    originRunStartedAt: r.originRunStartedAt ? new Date(r.originRunStartedAt as Date) : null,
    resolvedAt: r.resolvedAt as Date | null,
    resolvedBy: r.resolvedBy as string | null,
    resolvedCaptureId: r.resolvedCaptureId as string | null,
    createdBy: r.createdBy as string | null,
    createdAt: r.createdAt as Date,
    lastActivityAt: r.lastActivityAt as Date,
    comments,
  };
}

async function commentsOf(threadIds: readonly string[]): Promise<Map<string, CommentRecord[]>> {
  const out = new Map<string, CommentRecord[]>();
  if (threadIds.length === 0) return out;
  const rows = await db
    .select({
      id: reviewComments.id,
      threadId: reviewComments.threadId,
      kind: reviewComments.kind,
      body: reviewComments.body,
      source: reviewComments.source,
      userId: reviewComments.userId,
      agentName: reviewComments.agentName,
      authorName: users.name,
      authorImage: users.image,
      createdAt: reviewComments.createdAt,
      editedAt: reviewComments.editedAt,
    })
    .from(reviewComments)
    .leftJoin(users, eq(users.id, reviewComments.userId))
    .where(and(inArray(reviewComments.threadId, [...threadIds]), isNull(reviewComments.deletedAt)))
    .orderBy(asc(reviewComments.createdAt), asc(reviewComments.id));
  for (const r of rows) {
    const list = out.get(r.threadId) ?? [];
    list.push(r);
    out.set(r.threadId, list);
  }
  return out;
}

async function selectThreads(where: ReturnType<typeof sql>): Promise<ThreadRecord[]> {
  const rows = await db
    .select(threadColumns)
    .from(reviewThreads)
    .leftJoin(originRuns, eq(originRuns.id, reviewThreads.originRunId))
    .leftJoin(originCaptures, eq(originCaptures.id, reviewThreads.originCaptureId))
    .leftJoin(originImages, eq(originImages.id, originCaptures.attachmentId))
    .leftJoin(resolvers, eq(resolvers.id, reviewThreads.resolvedBy))
    .where(where)
    .orderBy(asc(reviewThreads.number));
  const comments = await commentsOf(rows.map((r) => r.id));
  return rows.map((r) => toThread(r, comments.get(r.id) ?? []));
}

/** Every thread on the targets' identities, newest last per identity. */
async function threadsOfIdentities(targets: readonly { testId: string; checkpointName: string; variant: string }[]): Promise<ThreadRecord[]> {
  const unique = new Map(targets.map((c) => [identityKey(c), c]));
  if (unique.size === 0) return [];
  const tuples = [...unique.values()].map((c) => sql`(${c.testId}::uuid, ${c.checkpointName}, ${c.variant})`);
  return selectThreads(sql`(${reviewThreads.testId}, ${reviewThreads.checkpointName}, ${reviewThreads.variant}) in (${sql.join(tuples, sql`, `)})`);
}

/** Whether a capture shows a thread, and how. `startedAt` is the capture's run's start. */
export function placeThread(thread: ThreadRecord, target: ThreadTarget, startedAt: Date | null): CaptureThread | null {
  if (identityKey(thread) !== identityKey(target)) return null;
  const own = thread.originCaptureId === target.id;
  const samePixels = own || Boolean(target.sha256 && thread.originSha256 === target.sha256);
  if (thread.status === 'resolved') {
    if (!samePixels && thread.resolvedCaptureId !== target.id) return null;
  } else if (!own && thread.originRunStartedAt && startedAt && thread.originRunStartedAt > startedAt) {
    // Placed on a later run: an earlier run's image does not know about it yet.
    return null;
  }
  const size = target.width && target.height ? { width: target.width, height: target.height } : null;
  return { ...thread, placement: samePixels ? 'exact' : 'outdated', position: projectAnchor(thread.anchor, thread.origin, size) };
}

/** The threads each capture shows, in number order. */
export async function threadsForCaptures(targets: readonly ThreadTarget[]): Promise<Map<string, CaptureThread[]>> {
  const out = new Map<string, CaptureThread[]>();
  if (targets.length === 0) return out;
  const threads = await threadsOfIdentities(targets);
  if (threads.length === 0) return out;
  const runIds = [...new Set(targets.map((t) => t.runId))];
  const starts = new Map((await db.select({ id: runs.id, startedAt: runs.startedAt }).from(runs).where(inArray(runs.id, runIds))).map((r) => [r.id, r.startedAt ? new Date(r.startedAt) : null]));
  const byIdentity = new Map<string, ThreadRecord[]>();
  for (const t of threads) byIdentity.set(identityKey(t), [...(byIdentity.get(identityKey(t)) ?? []), t]);
  for (const target of targets) {
    const shown = (byIdentity.get(identityKey(target)) ?? []).map((t) => placeThread(t, target, starts.get(target.runId) ?? null)).filter((t): t is CaptureThread => t !== null);
    if (shown.length) out.set(target.id, shown);
  }
  return out;
}

// ---------------------------------------------------------------- writes

function cleanBody(body: string | null | undefined): string {
  const text = (body ?? '').trim();
  if (!text) throw new ThreadError('Write a comment first.');
  if (text.length > MAX_COMMENT_LENGTH) throw new ThreadError(`A comment has at most ${MAX_COMMENT_LENGTH} characters.`);
  return text;
}

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

async function captureOf(projectId: string, captureId: string) {
  if (!isId(captureId)) return null;
  const [row] = await db
    .select({
      id: reviewCaptures.id,
      runId: reviewCaptures.runId,
      testId: reviewCaptures.testId,
      checkpointName: reviewCaptures.checkpointName,
      variant: reviewCaptures.variant,
      sha256: reviewCaptures.sha256,
      width: reviewCaptures.width,
      height: reviewCaptures.height,
      deviceScaleFactor: reviewCaptures.deviceScaleFactor,
    })
    .from(reviewCaptures)
    .where(and(eq(reviewCaptures.projectId, projectId), eq(reviewCaptures.id, captureId)));
  return row ?? null;
}

export interface Author {
  userId: string | null;
  source: CommentSource;
  /** An AI agent writing for `userId`: its name, shown as the author. */
  agentName?: string | null;
}

/**
 * Pins a new thread on a capture. The anchor is either in fractions of the
 * image (as a browser saw it) or, with `pixels`, in the capture's own pixels
 * (as a tool reads them off the image it was sent). A capture that recorded
 * no size takes `imageSize`, the size the browser loaded.
 */
export async function createThread(input: {
  projectId: string;
  captureId: string;
  anchor: FractionAnchor | ThreadAnchor;
  pixels?: boolean;
  imageSize?: ImageSize | null;
  body: string;
  author: Author;
}): Promise<ThreadRecord> {
  const body = cleanBody(input.body);
  const capture = await captureOf(input.projectId, input.captureId);
  if (!capture) throw new ThreadError('That image is not in this project.');
  const recorded = capture.width && capture.height ? { width: capture.width, height: capture.height } : null;
  const given = input.imageSize && input.imageSize.width > 0 && input.imageSize.height > 0 ? { width: Math.round(input.imageSize.width), height: Math.round(input.imageSize.height) } : null;
  const size = recorded ?? given;
  let anchor: ThreadAnchor;
  if (input.anchor.kind === 'image') anchor = { kind: 'image', x: 0, y: 0, w: null, h: null };
  else if (!size) throw new ThreadError('The image’s size is unknown, so a pin cannot be placed on it. Comment on the whole image instead.');
  else if (input.pixels) {
    const a = input.anchor;
    const fraction = { kind: a.kind, x: a.x / size.width, y: a.y / size.height, w: a.w != null ? a.w / size.width : null, h: a.h != null ? a.h / size.height : null };
    if (!isFractionAnchor(fraction)) throw new ThreadError(`The pin must be inside the image (0–${size.width} × 0–${size.height} px).`);
    anchor = toPixels(fraction, size);
  } else {
    if (!isFractionAnchor(input.anchor)) throw new ThreadError('The pin must be inside the image.');
    anchor = toPixels(input.anchor, size);
  }

  const id = randomUUID();
  await db.transaction(async (tx) => {
    // Numbers count per image; the lock keeps two reviewers from taking the same one.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`review-thread:${capture.testId}:${capture.checkpointName}:${capture.variant}`}))`);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${reviewThreads.number}), 0) + 1` })
      .from(reviewThreads)
      .where(and(eq(reviewThreads.testId, capture.testId), eq(reviewThreads.checkpointName, capture.checkpointName), eq(reviewThreads.variant, capture.variant)));
    await tx.insert(reviewThreads).values({
      id,
      projectId: input.projectId,
      testId: capture.testId,
      checkpointName: capture.checkpointName,
      variant: capture.variant,
      number: Number(next),
      originCaptureId: capture.id,
      originRunId: capture.runId,
      originSha256: capture.sha256,
      originWidth: size?.width ?? 1,
      originHeight: size?.height ?? 1,
      originScale: capture.deviceScaleFactor,
      anchor: anchor.kind,
      x: anchor.x,
      y: anchor.y,
      w: anchor.w ?? null,
      h: anchor.h ?? null,
      createdBy: input.author.userId,
    });
    await tx.insert(reviewComments).values({ id: randomUUID(), threadId: id, projectId: input.projectId, userId: input.author.userId, kind: 'comment', body, source: input.author.source, agentName: input.author.agentName ?? null });
  });
  const [thread] = await selectThreads(sql`${reviewThreads.id} = ${id}`);
  return thread;
}

async function threadInProject(projectId: string, threadId: string) {
  if (!isId(threadId)) return null;
  const [row] = await db
    .select({ id: reviewThreads.id, status: reviewThreads.status, number: reviewThreads.number })
    .from(reviewThreads)
    .where(and(eq(reviewThreads.projectId, projectId), eq(reviewThreads.id, threadId)));
  return row ?? null;
}

/** A thread of the project, with its comments. */
export async function getThread(projectId: string, threadId: string): Promise<ThreadRecord | null> {
  if (!isId(threadId)) return null;
  const [thread] = await selectThreads(sql`${reviewThreads.projectId} = ${projectId} and ${reviewThreads.id} = ${threadId}`);
  return thread ?? null;
}

export async function replyToThread(input: { projectId: string; threadId: string; body: string; author: Author }): Promise<CommentRecord> {
  const body = cleanBody(input.body);
  const thread = await threadInProject(input.projectId, input.threadId);
  if (!thread) throw new ThreadError('That thread is not in this project.');
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(reviewComments).values({ id, threadId: thread.id, projectId: input.projectId, userId: input.author.userId, kind: 'comment', body, source: input.author.source, agentName: input.author.agentName ?? null });
    await tx.update(reviewThreads).set({ lastActivityAt: sql`now()` }).where(eq(reviewThreads.id, thread.id));
  });
  const comments = await commentsOf([thread.id]);
  return comments.get(thread.id)!.find((c) => c.id === id)!;
}

/**
 * Resolves or reopens a thread, noting it in the thread's history, with an
 * optional closing comment. Resolving on a capture keeps the thread visible
 * there. Setting the status a thread already has changes nothing.
 */
export async function setThreadStatus(input: {
  projectId: string;
  threadId: string;
  status: ThreadStatus;
  captureId?: string | null;
  body?: string | null;
  author: Author;
}): Promise<{ changed: boolean }> {
  const thread = await threadInProject(input.projectId, input.threadId);
  if (!thread) throw new ThreadError('That thread is not in this project.');
  const body = input.body?.trim() ? cleanBody(input.body) : null;
  const capture = input.captureId ? await captureOf(input.projectId, input.captureId) : null;
  const changed = thread.status !== input.status;
  await db.transaction(async (tx) => {
    if (body) await tx.insert(reviewComments).values({ id: randomUUID(), threadId: thread.id, projectId: input.projectId, userId: input.author.userId, kind: 'comment', body, source: input.author.source, agentName: input.author.agentName ?? null });
    if (!changed) return;
    await tx.insert(reviewComments).values({
      id: randomUUID(),
      threadId: thread.id,
      projectId: input.projectId,
      userId: input.author.userId,
      kind: input.status === 'resolved' ? 'resolved' : 'reopened',
      source: input.author.source,
      agentName: input.author.agentName ?? null,
      // After the closing comment, however close the clock.
      createdAt: sql`now() + interval '1 millisecond'`,
    });
    await tx
      .update(reviewThreads)
      .set(
        input.status === 'resolved'
          ? { status: 'resolved', resolvedAt: sql`now()`, resolvedBy: input.author.userId, resolvedCaptureId: capture?.id ?? null, lastActivityAt: sql`now()` }
          : { status: 'open', resolvedAt: null, resolvedBy: null, resolvedCaptureId: null, lastActivityAt: sql`now()` },
      )
      .where(eq(reviewThreads.id, thread.id));
  });
  return { changed };
}

/** Resolves every open thread the captures show: what approving an image with its change requests addressed does. */
export async function resolveThreadsOf(input: { projectId: string; captureIds: readonly string[]; author: Author }): Promise<{ resolved: number }> {
  const ids = input.captureIds.filter(isId);
  if (ids.length === 0) return { resolved: 0 };
  const targets = await db
    .select({
      id: reviewCaptures.id,
      runId: reviewCaptures.runId,
      testId: reviewCaptures.testId,
      checkpointName: reviewCaptures.checkpointName,
      variant: reviewCaptures.variant,
      sha256: reviewCaptures.sha256,
      width: reviewCaptures.width,
      height: reviewCaptures.height,
    })
    .from(reviewCaptures)
    .where(and(eq(reviewCaptures.projectId, input.projectId), inArray(reviewCaptures.id, ids)));
  const shown = await threadsForCaptures(targets);
  let resolved = 0;
  const seen = new Set<string>();
  for (const [captureId, threads] of shown) {
    for (const t of threads) {
      if (t.status !== 'open' || seen.has(t.id)) continue;
      seen.add(t.id);
      const res = await setThreadStatus({ projectId: input.projectId, threadId: t.id, status: 'resolved', captureId, author: input.author });
      if (res.changed) resolved++;
    }
  }
  return { resolved };
}

async function commentInProject(projectId: string, commentId: string) {
  if (!isId(commentId)) return null;
  const [row] = await db
    .select({ id: reviewComments.id, threadId: reviewComments.threadId, userId: reviewComments.userId, kind: reviewComments.kind })
    .from(reviewComments)
    .where(and(eq(reviewComments.projectId, projectId), eq(reviewComments.id, commentId), isNull(reviewComments.deletedAt)));
  return row ?? null;
}

/** Changes a comment's text. Only its author may. */
export async function editComment(input: { projectId: string; commentId: string; body: string; userId: string | null }): Promise<void> {
  const body = cleanBody(input.body);
  const comment = await commentInProject(input.projectId, input.commentId);
  if (!comment || comment.kind !== 'comment') throw new ThreadError('That comment is not in this project.');
  if (!input.userId || comment.userId !== input.userId) throw new ThreadError('Only its author can edit a comment.');
  await db.update(reviewComments).set({ body, editedAt: sql`now()` }).where(eq(reviewComments.id, comment.id));
}

/**
 * Deletes a comment: its author may, and so may someone who moderates the
 * project. Deleting a thread's opening comment deletes the thread.
 */
export async function deleteComment(input: { projectId: string; commentId: string; userId: string | null; moderate: boolean }): Promise<{ deletedThread: boolean }> {
  const comment = await commentInProject(input.projectId, input.commentId);
  if (!comment || comment.kind !== 'comment') throw new ThreadError('That comment is not in this project.');
  if (!input.moderate && (!input.userId || comment.userId !== input.userId)) throw new ThreadError('Only its author can delete a comment.');
  const [opening] = await db
    .select({ id: reviewComments.id })
    .from(reviewComments)
    .where(and(eq(reviewComments.threadId, comment.threadId), eq(reviewComments.kind, 'comment'), isNull(reviewComments.deletedAt)))
    .orderBy(asc(reviewComments.createdAt), asc(reviewComments.id))
    .limit(1);
  if (opening?.id === comment.id) {
    await db.delete(reviewThreads).where(eq(reviewThreads.id, comment.threadId));
    return { deletedThread: true };
  }
  await db.update(reviewComments).set({ deletedAt: sql`now()`, body: '' }).where(eq(reviewComments.id, comment.id));
  return { deletedThread: false };
}
