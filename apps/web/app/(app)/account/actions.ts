'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { actionError, getCurrentUser, type Denied } from '@/lib/auth/access';
import { auth } from '@/lib/auth/auth';
import { deleteAvatar, storeAvatar } from '@/lib/avatars/store';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';

type Ok = { ok: true };

/** Replaces the caller's profile image with the uploaded `file`. */
export async function updateMyAvatar(formData: FormData): Promise<Ok | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');

  const stored = await storeAvatar('users', user.id, formData.get('file'));
  if ('error' in stored) return actionError(stored.error);

  return setImage(user.id, stored.url);
}

export async function removeMyAvatar(): Promise<Ok | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  return setImage(user.id, null);
}

async function setImage(userId: string, image: string | null): Promise<Ok> {
  // The previous value comes from the row, not the session: the cookie cache
  // can be a few minutes behind.
  const [previous] = await db.select({ image: users.image }).from(users).where(eq(users.id, userId));
  await db.update(users).set({ image, updatedAt: new Date() }).where(eq(users.id, userId));
  if (previous?.image !== image) await deleteAvatar('users', userId, previous?.image);

  // The sidebar reads the image from the session, whose cookie cache would
  // otherwise keep serving the old one. Reading past the cache rewrites it.
  await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  revalidatePath('/', 'layout');
  return { ok: true };
}
