'use server';

import { revalidatePath } from 'next/cache';
import { actionError, denied, projectForAction, type Denied } from '@/lib/auth/access';
import type { ReviewDecisionInput } from '@miguelfranken/ui/lib/review';
import { REVIEW_DECISIONS } from '@miguelfranken/ui/lib/review';
import { decide, ReviewError } from '@/lib/review/queries';

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
