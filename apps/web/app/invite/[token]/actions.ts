'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { actionError, getCurrentUser, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { auth } from '@/lib/auth/auth';
import { higherRole, resolveInvitation } from '@/lib/auth/invitations';
import { db } from '@/lib/db/drizzle';
import { getUserByEmail } from '@/lib/db/queries/teams';
import { teamInvitations, teamMembers, users } from '@/lib/db/schema';

const INVALID = 'This invitation is no longer valid. Ask for a new link.';

type Ok = { ok: true; teamSlug: string };

const newUserSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80),
  password: z.string().min(10, 'The password must be at least 10 characters.').max(200),
});

/**
 * Invitee has no account yet. Order matters: the user is created first, then
 * the membership. If the second step fails the user exists without a
 * membership and the invitation is still pending, so reloading the page shows
 * the "sign in" state and `acceptInvitationExisting` finishes the job.
 */
export async function acceptInvitationNewUser(token: string, name: string, password: string, confirm: string): Promise<Ok | Denied> {
  if (password !== confirm) return actionError('The passwords do not match.');
  const parsed = newUserSchema.safeParse({ name, password });
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? 'Check your details.');

  // Re-resolve: the invitation may have been revoked since the page rendered.
  const invitation = await resolveInvitation(token);
  if (!invitation) return actionError(INVALID);

  if (await getUserByEmail(invitation.email)) {
    return actionError('An account with this email already exists. Sign in to accept the invitation.');
  }

  try {
    // Called without request/headers, which is what lets the admin plugin skip
    // its session check; it also ignores `emailAndPassword.disableSignUp`.
    await auth.api.createUser({ body: { email: invitation.email, password: parsed.data.password, name: parsed.data.name, role: 'user' } });
  } catch (error) {
    console.error('[invite] createUser failed', error);
    return actionError('Could not create the account. It may already exist — try signing in.');
  }

  const user = await getUserByEmail(invitation.email);
  if (!user) return actionError('Could not create the account.');

  const joined = await join(invitation.id, invitation.teamId, invitation.role, user.id);
  if (!joined) return actionError(INVALID);

  await auth.api.signInEmail({ body: { email: invitation.email, password: parsed.data.password }, headers: await headers() });
  return { ok: true, teamSlug: invitation.teamSlug };
}

/** Invitee is signed in with the invited email. */
export async function acceptInvitationExisting(token: string): Promise<Ok | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');

  const invitation = await resolveInvitation(token);
  if (!invitation) return actionError(INVALID);
  if (user.email.toLowerCase() !== invitation.email) {
    return actionError(`This invitation is for ${invitation.email}. Sign out to accept it with that account.`);
  }

  const joined = await join(invitation.id, invitation.teamId, invitation.role, user.id);
  if (!joined) return actionError(INVALID);
  return { ok: true, teamSlug: invitation.teamSlug };
}

/**
 * Consumes the invitation and creates (or upgrades) the membership in one
 * transaction, so a token can never be spent twice.
 */
async function join(invitationId: string, teamId: string, role: 'admin' | 'member' | 'viewer', userId: string) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(teamInvitations)
      .set({ acceptedAt: new Date(), acceptedBy: userId })
      .where(and(eq(teamInvitations.id, invitationId), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt)))
      .returning({ id: teamInvitations.id });
    if (!claimed) return false;

    const [existing] = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    if (existing) {
      // Already a member: keep whichever role is stronger.
      const next = higherRole(existing.role, role);
      if (next !== existing.role) {
        await tx
          .update(teamMembers)
          .set({ role: next, updatedAt: new Date() })
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
      }
    } else {
      await tx.insert(teamMembers).values({ teamId, userId, role });
    }
    return true;
  }).then(async (ok) => {
    if (ok) {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
      await audit('member.join', { actorId: userId, teamId, target: { email: user?.email, role } });
    }
    return ok;
  });
}
