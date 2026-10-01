'use server';

import { revalidatePath } from 'next/cache';
import { actionError, denied, projectForAction, type Denied } from '@/lib/auth/access';
import type { ReviewDecisionInput } from '@miguelfranken/ui/lib/review';
import { REVIEW_DECISIONS } from '@miguelfranken/ui/lib/review';
import { THREAD_STATUSES, type CommentEditInput, type NewThreadInput, type ThreadReplyInput, type ThreadStatusInput } from '@miguelfranken/ui/lib/review-threads';
import { requestCaptureDiff } from '@/lib/review/diff/dispatch';
import { IgnoreRegionsError, parseIgnoreRegions, setIgnoreRegions } from '@/lib/review/diff/ignore';
import { captureInProject, decide, ReviewError } from '@/lib/review/queries';
import { createThread, deleteComment, editComment, replyToThread, setThreadStatus, ThreadError } from '@/lib/review/threads';

type Ref = { team: string; project: string };

// The project layout sits above every page that shows a status or a thread: the run's review, the queue, the screens, a result.
const revalidate = (ref: Ref) => revalidatePath(`/teams/${ref.team}/projects/${ref.project}`, 'layout');

async function guarded<T>(run: () => Promise<T>): Promise<T | Denied> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ReviewError || error instanceof ThreadError) return actionError(error.message);
    throw error;
  }
}

/**
 * Records a decision about review images. Re-checks access: the team and
 * project come from the client and are never trusted, and the captures must
 * belong to the project (`decide` ignores any that do not).
 */
export async function decideReview(ref: Ref, input: ReviewDecisionInput): Promise<{ ok: true; decided: number; resolvedThreads: number } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['decide'] });
  if (denied(access)) return access;
  if (!(REVIEW_DECISIONS as readonly string[]).includes(input.decision)) return actionError('Unknown decision.');
  return guarded(async () => {
    const res = await decide({
      projectId: access.project.id,
      captureIds: input.captureIds,
      decision: input.decision,
      comment: input.comment,
      userId: access.user.id,
      resolveThreads: input.resolveThreads === true,
    });
    revalidate(ref);
    return { ok: true as const, ...res };
  });
}

/** Pins a comment thread on a review image. Anyone who may comment on the project's review may. */
export async function createReviewThread(ref: Ref, input: NewThreadInput): Promise<{ ok: true; threadId: string; number: number } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['comment'] });
  if (denied(access)) return access;
  return guarded(async () => {
    const thread = await createThread({
      projectId: access.project.id,
      captureId: String(input.captureId),
      anchor: input.anchor,
      markup: input.markup ?? null,
      imageSize: input.imageSize,
      body: String(input.body ?? ''),
      author: { userId: access.user.id, source: 'app' },
    });
    revalidate(ref);
    return { ok: true as const, threadId: thread.id, number: thread.number };
  });
}

export async function replyToReviewThread(ref: Ref, input: ThreadReplyInput): Promise<{ ok: true } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['comment'] });
  if (denied(access)) return access;
  return guarded(async () => {
    await replyToThread({ projectId: access.project.id, threadId: String(input.threadId), body: String(input.body ?? ''), author: { userId: access.user.id, source: 'app' } });
    revalidate(ref);
    return { ok: true as const };
  });
}

export async function setReviewThreadStatus(ref: Ref, input: ThreadStatusInput): Promise<{ ok: true } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['comment'] });
  if (denied(access)) return access;
  if (!(THREAD_STATUSES as readonly string[]).includes(input.status)) return actionError('Unknown status.');
  return guarded(async () => {
    await setThreadStatus({ projectId: access.project.id, threadId: String(input.threadId), status: input.status, captureId: input.captureId ?? null, author: { userId: access.user.id, source: 'app' } });
    revalidate(ref);
    return { ok: true as const };
  });
}

export async function editReviewComment(ref: Ref, input: CommentEditInput): Promise<{ ok: true } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['comment'] });
  if (denied(access)) return access;
  return guarded(async () => {
    await editComment({ projectId: access.project.id, commentId: String(input.commentId), body: String(input.body ?? ''), userId: access.user.id });
    revalidate(ref);
    return { ok: true as const };
  });
}

/** Deletes a comment (its author, or a project admin); the opening comment takes its thread with it. */
export async function deleteReviewComment(ref: Ref, input: { commentId: string }): Promise<{ ok: true; deletedThread: boolean } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['comment'] });
  if (denied(access)) return access;
  return guarded(async () => {
    // Deleting projects is what an admin can do and a member cannot: the same people moderate comments.
    const res = await deleteComment({ projectId: access.project.id, commentId: String(input.commentId), userId: access.user.id, moderate: access.can({ project: ['delete'] }) });
    revalidate(ref);
    return { ok: true as const, ...res };
  });
}

/**
 * Saves the areas a checkpoint's variant leaves out of its comparisons, then
 * has the capture measured again without them. Deciding about images and
 * leaving parts of them out take the same permission: both change what a
 * reviewer is asked to look at.
 */
export async function saveIgnoreRegions(ref: { team: string; project: string }, input: { captureId: string; regions: unknown }): Promise<{ ok: true } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['decide'] });
  if (denied(access)) return access;
  let regions;
  try {
    regions = parseIgnoreRegions(input.regions);
  } catch (error) {
    if (error instanceof IgnoreRegionsError) return actionError(error.message);
    throw error;
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.captureId)) return actionError('Image not found.');
  const saved = await setIgnoreRegions(access.project.id, input.captureId.toLowerCase(), regions, access.user.id);
  if (!saved) return actionError('Image not found.');
  const found = await captureInProject(access.project.id, input.captureId.toLowerCase());
  if (found) await requestCaptureDiff(found.capture);
  revalidatePath(`/teams/${ref.team}/projects/${ref.project}`, 'layout');
  return { ok: true };
}
