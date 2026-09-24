'use server';

import { randomBytes, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { actionError, denied, getCurrentUser, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { auth } from '@/lib/auth/auth';
import { validateSlug } from '@/lib/auth/slug';
import { db } from '@/lib/db/drizzle';
import { getUserById } from '@/lib/db/queries/teams';
import { attachments, projects, runs, teamMembers, teams, users } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';

type Ok<T extends object = object> = { ok: true } & T;

const emailSchema = z.email().max(254);
const instanceRoleSchema = z.enum(['user', 'superadmin']);

/** Every action here is superadmin-only; the check runs inside the action. */
async function superadmin(): Promise<{ actorId: string } | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  if (!user.isSuperadmin) return actionError('Superadmins only.');
  return { actorId: user.id };
}

// --------------------------------------------------------------------- teams

export async function createTeam(name: string, slug: string): Promise<Ok<{ slug: string }> | Denied> {
  const actor = await superadmin();
  if (denied(actor)) return actor;

  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return actionError('Name must be between 1 and 80 characters.');
  const slugError = validateSlug(slug, 'team');
  if (slugError) return actionError(slugError);

  const [existing] = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug));
  if (existing) return actionError('That slug is already taken.');

  const id = randomUUID();
  await db.insert(teams).values({ id, slug, name: trimmed, createdBy: actor.actorId });
  // The creating superadmin becomes an admin member so the team is usable at once.
  await db.insert(teamMembers).values({ teamId: id, userId: actor.actorId, role: 'admin', addedBy: actor.actorId });
  await audit('team.create', { actorId: actor.actorId, teamId: id, target: { slug, name: trimmed } });
  revalidatePath('/', 'layout');
  return { ok: true, slug };
}

export async function deleteTeam(teamId: string, confirmation: string): Promise<Ok | Denied> {
  const actor = await superadmin();
  if (denied(actor)) return actor;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return actionError('Team not found.');
  if (confirmation !== team.slug) return actionError('Type the team slug to confirm.');

  // Collect the storage keys before the cascade removes the rows.
  const teamProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, teamId));
  const keys: string[] = [];
  if (teamProjects.length > 0) {
    const teamRuns = await db
      .select({ id: runs.id })
      .from(runs)
      .where(
        inArray(
          runs.projectId,
          teamProjects.map((p) => p.id),
        ),
      );
    if (teamRuns.length > 0) {
      const rows = await db
        .select({ key: attachments.storageKey })
        .from(attachments)
        .where(
          inArray(
            attachments.runId,
            teamRuns.map((r) => r.id),
          ),
        );
      keys.push(...rows.map((r) => r.key));
    }
  }

  await db.delete(teams).where(eq(teams.id, teamId));
  await audit('team.delete', { actorId: actor.actorId, target: { slug: team.slug, name: team.name, attachments: keys.length } });

  // Artifact bytes go afterwards and are not fatal: the rows are already gone.
  void deleteArtifacts(keys);

  revalidatePath('/', 'layout');
  return { ok: true };
}

async function deleteArtifacts(keys: string[]) {
  if (keys.length === 0) return;
  const storage = getStorage();
  for (let i = 0; i < keys.length; i += 100) {
    await storage.delete(keys.slice(i, i + 100)).catch((error) => console.error('[storage] delete failed', error));
  }
}

// --------------------------------------------------------------------- users

export async function createUserAccount(email: string, name: string, rawRole: string): Promise<Ok<{ password: string }> | Denied> {
  const actor = await superadmin();
  if (denied(actor)) return actor;

  const parsed = emailSchema.safeParse(email.trim().toLowerCase());
  if (!parsed.success) return actionError('Enter a valid email address.');
  const role = instanceRoleSchema.safeParse(rawRole);
  if (!role.success) return actionError('Pick a valid instance role.');
  if (!name.trim()) return actionError('Enter a name.');

  const password = randomBytes(12).toString('base64url');
  try {
    await auth.api.createUser({ body: { email: parsed.data, password, name: name.trim(), role: role.data } });
  } catch (error) {
    console.error('[admin] createUser failed', error);
    return actionError('Could not create the account. The email may already be in use.');
  }
  await audit('user.role', { actorId: actor.actorId, target: { email: parsed.data, role: role.data, created: true } });
  revalidatePath('/admin/users');
  return { ok: true, password };
}

export async function setInstanceRole(userId: string, rawRole: string): Promise<Ok | Denied> {
  const actor = await superadmin();
  if (denied(actor)) return actor;
  const role = instanceRoleSchema.safeParse(rawRole);
  if (!role.success) return actionError('Pick a valid instance role.');
  if (userId === actor.actorId && role.data !== 'superadmin') return actionError('You cannot remove your own superadmin role.');

  const user = await getUserById(userId);
  if (!user) return actionError('User not found.');

  await db.update(users).set({ role: role.data, updatedAt: new Date() }).where(eq(users.id, userId));
  await audit('user.role', { actorId: actor.actorId, target: { userId, email: user.email, from: user.role, to: role.data } });
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function setBanned(userId: string, banned: boolean, reason?: string): Promise<Ok | Denied> {
  const actor = await superadmin();
  if (denied(actor)) return actor;
  if (userId === actor.actorId) return actionError('You cannot ban yourself.');

  const user = await getUserById(userId);
  if (!user) return actionError('User not found.');

  try {
    // Better Auth revokes the user's sessions as part of banning. These
    // endpoints run behind the admin plugin's middleware, so they need the
    // caller's session — unlike `createUser`, which is allowed headerless.
    const h = await headers();
    if (banned) await auth.api.banUser({ body: { userId, banReason: reason?.trim() || 'Banned by an administrator' }, headers: h });
    else await auth.api.unbanUser({ body: { userId }, headers: h });
  } catch (error) {
    console.error('[admin] ban toggle failed', error);
    return actionError('Could not change the ban state.');
  }

  await audit(banned ? 'user.ban' : 'user.unban', { actorId: actor.actorId, target: { userId, email: user.email, reason } });
  revalidatePath('/admin/users');
  return { ok: true };
}

/** No mailer yet: the superadmin reads the new password once and hands it over. */
export async function setTemporaryPassword(userId: string): Promise<Ok<{ password: string }> | Denied> {
  const actor = await superadmin();
  if (denied(actor)) return actor;

  const user = await getUserById(userId);
  if (!user) return actionError('User not found.');

  const password = randomBytes(12).toString('base64url');
  try {
    // `adminMiddleware` requires the caller's session on this endpoint.
    await auth.api.setUserPassword({ body: { userId, newPassword: password }, headers: await headers() });
  } catch (error) {
    console.error('[admin] setUserPassword failed', error);
    return actionError('Could not set the password.');
  }
  await audit('user.password', { actorId: actor.actorId, target: { userId, email: user.email } });
  return { ok: true, password };
}

export async function deleteUserAccount(userId: string): Promise<Ok | Denied> {
  const actor = await superadmin();
  if (denied(actor)) return actor;
  if (userId === actor.actorId) return actionError('You cannot delete your own account.');

  const user = await getUserById(userId);
  if (!user) return actionError('User not found.');

  // Memberships and sessions cascade; audit rows survive with a null actor.
  await db.delete(users).where(eq(users.id, userId));
  await audit('user.delete', { actorId: actor.actorId, target: { userId, email: user.email } });
  revalidatePath('/admin/users');
  return { ok: true };
}
