'use server';

import { revalidatePath } from 'next/cache';
import { actionError, denied, projectForAction, type Denied } from '@/lib/auth/access';
import type { ReviewDecisionInput } from '@miguelfranken/ui/lib/review';
import { REVIEW_DECISIONS } from '@miguelfranken/ui/lib/review';
import { requestCaptureDiff } from '@/lib/review/diff/dispatch';
import { IgnoreRegionsError, parseIgnoreRegions, setIgnoreRegions } from '@/lib/review/diff/ignore';
import { captureInProject, decide, ReviewError } from '@/lib/review/queries';

/**
 * Records a decision about review images. Re-checks access: the team and
 * project come from the client and are never trusted, and the captures must
 * belong to the project (`decide` ignores any that do not).
 */
export async function decideReview(ref: { team: string; project: string }, input: ReviewDecisionInput): Promise<{ ok: true; decided: number } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['decide'] });
  if (denied(access)) return access;
  if (!(REVIEW_DECISIONS as readonly string[]).includes(input.decision)) return actionError('Unknown decision.');
  try {
    const { decided } = await decide({ projectId: access.project.id, captureIds: input.captureIds, decision: input.decision, comment: input.comment, userId: access.user.id });
    // The project layout sits above every page that shows a status: the run's review, the queue, the screens, a result.
    revalidatePath(`/teams/${ref.team}/projects/${ref.project}`, 'layout');
    return { ok: true, decided };
  } catch (error) {
    if (error instanceof ReviewError) return actionError(error.message);
    throw error;
  }
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
