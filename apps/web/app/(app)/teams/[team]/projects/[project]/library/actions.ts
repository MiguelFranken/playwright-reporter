'use server';

import { revalidatePath } from 'next/cache';
import { actionError, denied, projectForAction, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { parseLibraryRef, libraryRefParam, type LibraryReferencePatch } from '@miguelfranken/ui/lib/library';
import type { LibraryViewDef } from '@miguelfranken/ui/lib/library-views';
import { LibraryError, setLibraryReference } from '@/lib/review/library';
import { createLibraryView, deleteLibraryView as removeLibraryView, LibraryViewError, updateLibraryView } from '@/lib/review/library-views';

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

/**
 * Saves the signed-in person's own library view: a new one, or (with `id`)
 * a new name or new settings for one they saved. Anyone who can read the
 * project may keep views of it; they are nobody else's.
 */
export async function saveLibraryView(
  ref: { team: string; project: string },
  input: { id?: string; name?: string; config?: unknown },
): Promise<{ ok: true; view: LibraryViewDef } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { run: ['read'] });
  if (denied(access)) return access;
  try {
    const view = input.id
      ? await updateLibraryView({ projectId: access.project.id, userId: access.user.id, id: input.id, name: input.name, config: input.config })
      : await createLibraryView({ projectId: access.project.id, userId: access.user.id, name: input.name ?? '', config: input.config });
    revalidatePath(`/teams/${ref.team}/projects/${ref.project}/library`);
    return { ok: true, view };
  } catch (error) {
    if (error instanceof LibraryViewError) return actionError(error.message);
    throw error;
  }
}

export async function deleteLibraryView(ref: { team: string; project: string }, id: string): Promise<{ ok: true } | Denied> {
  const access = await projectForAction(ref.team, ref.project, { run: ['read'] });
  if (denied(access)) return access;
  const { deleted } = await removeLibraryView({ projectId: access.project.id, userId: access.user.id, id });
  if (!deleted) return actionError('That view does not exist.');
  revalidatePath(`/teams/${ref.team}/projects/${ref.project}/library`);
  return { ok: true };
}
