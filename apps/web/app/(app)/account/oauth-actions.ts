'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionError, getCurrentUser, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { db } from '@/lib/db/drizzle';
import { oauthGrants } from '@/lib/db/schema';
import { revokeGrant } from '@/lib/oauth/tokens';

/** Disconnects an application: its grant and every token it holds stop working at once. */
export async function revokeConnectedApp(grantId: string): Promise<{ ok: true } | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  if (!z.uuid().safeParse(grantId).success) return actionError('Connection not found.');
  const [grant] = await db
    .select({ id: oauthGrants.id, clientId: oauthGrants.clientId })
    .from(oauthGrants)
    .where(and(eq(oauthGrants.id, grantId), eq(oauthGrants.userId, user.id), isNull(oauthGrants.revokedAt)))
    .limit(1);
  if (!grant) return actionError('Connection not found.');
  await revokeGrant(grant.id);
  await audit('oauth.revoke', { actorId: user.id, target: { grantId: grant.id, clientId: grant.clientId } });
  revalidatePath('/account');
  return { ok: true };
}
