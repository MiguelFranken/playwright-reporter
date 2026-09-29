'use server';

import { revalidatePath } from 'next/cache';
import { actionError, denied, projectForAction, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { parseLibraryRef, libraryRefParam, type LibraryReferencePatch } from '@miguelfranken/ui/lib/library';
import { LibraryError, setLibraryReference } from '@/lib/review/library';

/**
 * Keeps, pins, renames, makes default or drops a library reference. Anyone
 * who may decide about review images may curate the library: both are about
 * what the product is meant to look like. The reference arrives as its URL
 * form (`branch:main`, `pr:128`) and is parsed again here.
 */
export async function updateLibraryReference(
  ref: { team: string; project: string },
  reference: string,
  patch: LibraryReferencePatch,
): Promise<{ ok: true; kept: boolean } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { review: ['decide'] });
  if (denied(access)) return access;
  const key = parseLibraryRef(reference);
  if (!key) return actionError('Unknown branch or pull request.');
  if (patch.pin !== undefined && patch.pin !== 'latest' && !(Number.isInteger(patch.pin) && patch.pin > 0)) return actionError('Unknown run.');
  try {
    const { kept } = await setLibraryReference({ projectId: access.project.id, key, patch, userId: access.user.id });
    await audit('library.update', {
      actorId: access.user.id,
      teamId: access.team.id,
      projectId: access.project.id,
      target: { reference: libraryRefParam(key), ...patch },
    });
    // The library, the review queue, the branch and pull request pages and the case pages all show references.
    revalidatePath(`/teams/${ref.team}/projects/${ref.project}`, 'layout');
    return { ok: true, kept };
  } catch (error) {
    if (error instanceof LibraryError) return actionError(error.message);
    throw error;
  }
}
