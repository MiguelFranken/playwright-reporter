'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionError, denied, teamForAction, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { baseUrl } from '@/lib/auth/config';
import { generateInvitationToken, hashInvitationToken, invitationExpiry } from '@/lib/auth/invitations';
import { validateSlug } from '@/lib/auth/slug';
import { db } from '@/lib/db/drizzle';
import { countTeamAdmins, getUserByEmail } from '@/lib/db/queries/teams';
import { attachments, projects, teamInvitations, teamMembers, teams, type TeamRole } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';

const ROLES = ['admin', 'member', 'viewer'] as const;
const roleSchema = z.enum(ROLES);
const emailSchema = z.email().max(254);

type Ok<T extends object = object> = { ok: true } & T;

// ------------------------------------------------------------------ general

export async function updateTeam(teamSlug: string, name: string, slug: string): Promise<Ok<{ slug: string }> | Denied> {
  const access = await teamForAction(teamSlug, { team: ['update'] });
  if (denied(access)) return access;

  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return actionError('Name must be between 1 and 80 characters.');
  const slugError = validateSlug(slug, 'team');
  if (slugError) return actionError(slugError);

  if (slug !== access.team.slug) {
    const [existing] = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug));
    if (existing) return actionError('That slug is already taken.');
  }

  await db.update(teams).set({ name: trimmed, slug, updatedAt: new Date() }).where(eq(teams.id, access.team.id));
  await audit('team.update', { actorId: access.user.id, teamId: access.team.id, target: { name: trimmed, slug } });
  revalidatePath('/', 'layout');
  return { ok: true, slug };
}

// ------------------------------------------------------------------ projects

export async function createProject(teamSlug: string, name: string, slug: string): Promise<Ok<{ slug: string }> | Denied> {
  const access = await teamForAction(teamSlug, { project: ['create'] });
  if (denied(access)) return access;

  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return actionError('Name must be between 1 and 80 characters.');
  const slugError = validateSlug(slug, 'project');
  if (slugError) return actionError(slugError);

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.teamId, access.team.id), eq(projects.slug, slug)));
  if (existing) return actionError('A project with that slug already exists in this team.');

  const id = randomUUID();
  await db.insert(projects).values({ id, teamId: access.team.id, slug, name: trimmed, createdBy: access.user.id });
  await audit('project.create', { actorId: access.user.id, teamId: access.team.id, projectId: id, target: { slug, name: trimmed } });
  revalidatePath(`/teams/${teamSlug}`, 'layout');
  return { ok: true, slug };
}

export async function deleteProject(teamSlug: string, projectSlug: string, confirmation: string): Promise<Ok | Denied> {
  const access = await teamForAction(teamSlug, { project: ['delete'] });
  if (denied(access)) return access;
  if (confirmation !== projectSlug) return actionError('Type the project slug to confirm.');

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.teamId, access.team.id), eq(projects.slug, projectSlug)));
  if (!project) return actionError('Project not found.');

  // Collect the storage keys before the cascade removes the rows.
  const keys = await db
    .select({ key: attachments.storageKey })
    .from(attachments)
    .where(sql`${attachments.runId} in (select id from runs where project_id = ${project.id})`);

  await db.delete(projects).where(eq(projects.id, project.id));
  await audit('project.delete', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: project.id,
    target: { slug: project.slug, name: project.name, attachments: keys.length },
  });

  // Artifact bytes go afterwards and are not fatal: the rows are already gone.
  void deleteArtifacts(keys.map((k) => k.key));

  revalidatePath(`/teams/${teamSlug}`, 'layout');
  return { ok: true };
}

async function deleteArtifacts(keys: string[]) {
  const storage = getStorage();
  for (let i = 0; i < keys.length; i += 100) {
    await storage.delete(keys.slice(i, i + 100)).catch((error) => console.error('[storage] delete failed', error));
  }
}

// ------------------------------------------------------------------- members

export async function inviteMember(teamSlug: string, rawEmail: string, rawRole: string): Promise<Ok<{ link: string }> | Denied> {
  const access = await teamForAction(teamSlug, { member: ['invite'] });
  if (denied(access)) return access;

  const email = emailSchema.safeParse(rawEmail.trim().toLowerCase());
  if (!email.success) return actionError('Enter a valid email address.');
  const role = roleSchema.safeParse(rawRole);
  if (!role.success) return actionError('Pick a valid role.');

  const existingUser = await getUserByEmail(email.data);
  if (existingUser) {
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, access.team.id), eq(teamMembers.userId, existingUser.id)));
    if (member) return actionError('That person is already a member of this team.');
  }

  const [pending] = await db
    .select({ id: teamInvitations.id })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.teamId, access.team.id),
        eq(teamInvitations.email, email.data),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
      ),
    );
  if (pending) return actionError('That email already has a pending invitation. Regenerate its link instead.');

  const token = generateInvitationToken();
  await db.insert(teamInvitations).values({
    id: randomUUID(),
    teamId: access.team.id,
    email: email.data,
    role: role.data,
    tokenHash: hashInvitationToken(token),
    invitedBy: access.user.id,
    expiresAt: invitationExpiry(),
  });
  await audit('member.invite', { actorId: access.user.id, teamId: access.team.id, target: { email: email.data, role: role.data } });
  revalidatePath(`/teams/${teamSlug}/settings/members`);
  return { ok: true, link: `${baseUrl()}/invite/${token}` };
}

export async function regenerateInvitation(teamSlug: string, invitationId: string): Promise<Ok<{ link: string }> | Denied> {
  const access = await teamForAction(teamSlug, { member: ['invite'] });
  if (denied(access)) return access;

  const token = generateInvitationToken();
  const [row] = await db
    .update(teamInvitations)
    .set({ tokenHash: hashInvitationToken(token), expiresAt: invitationExpiry(), invitedBy: access.user.id })
    .where(
      and(
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.teamId, access.team.id),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
      ),
    )
    .returning({ email: teamInvitations.email });
  if (!row) return actionError('Invitation not found.');

  await audit('member.invite.regenerate', { actorId: access.user.id, teamId: access.team.id, target: { email: row.email } });
  revalidatePath(`/teams/${teamSlug}/settings/members`);
  return { ok: true, link: `${baseUrl()}/invite/${token}` };
}

export async function revokeInvitation(teamSlug: string, invitationId: string): Promise<Ok | Denied> {
  const access = await teamForAction(teamSlug, { member: ['invite'] });
  if (denied(access)) return access;

  const [row] = await db
    .update(teamInvitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(teamInvitations.id, invitationId), eq(teamInvitations.teamId, access.team.id), isNull(teamInvitations.acceptedAt)))
    .returning({ email: teamInvitations.email });
  if (!row) return actionError('Invitation not found.');

  await audit('member.invite.revoke', { actorId: access.user.id, teamId: access.team.id, target: { email: row.email } });
  revalidatePath(`/teams/${teamSlug}/settings/members`);
  return { ok: true };
}

/** For people who already have an account: skip the invitation link entirely. */
export async function addExistingUser(teamSlug: string, rawEmail: string, rawRole: string): Promise<Ok | Denied> {
  const access = await teamForAction(teamSlug, { member: ['invite'] });
  if (denied(access)) return access;

  const email = emailSchema.safeParse(rawEmail.trim().toLowerCase());
  if (!email.success) return actionError('Enter a valid email address.');
  const role = roleSchema.safeParse(rawRole);
  if (!role.success) return actionError('Pick a valid role.');

  const user = await getUserByEmail(email.data);
  if (!user) return actionError('No account with that email. Send an invitation link instead.');

  const [member] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, access.team.id), eq(teamMembers.userId, user.id)));
  if (member) return actionError('That person is already a member of this team.');

  await db.insert(teamMembers).values({ teamId: access.team.id, userId: user.id, role: role.data, addedBy: access.user.id });
  await audit('member.add', { actorId: access.user.id, teamId: access.team.id, target: { email: email.data, role: role.data } });
  revalidatePath(`/teams/${teamSlug}/settings/members`);
  return { ok: true };
}

export async function updateMemberRole(teamSlug: string, userId: string, rawRole: string): Promise<Ok | Denied> {
  const access = await teamForAction(teamSlug, { member: ['update-role'] });
  if (denied(access)) return access;

  const role = roleSchema.safeParse(rawRole);
  if (!role.success) return actionError('Pick a valid role.');

  const [member] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, access.team.id), eq(teamMembers.userId, userId)));
  if (!member) return actionError('That person is not a member of this team.');
  if (member.role === role.data) return { ok: true };

  const guard = await lastAdminGuard(access.team.id, member.role, role.data, access.user.isSuperadmin);
  if (guard) return actionError(guard);

  await db
    .update(teamMembers)
    .set({ role: role.data, updatedAt: new Date() })
    .where(and(eq(teamMembers.teamId, access.team.id), eq(teamMembers.userId, userId)));
  await audit('member.role', { actorId: access.user.id, teamId: access.team.id, target: { userId, from: member.role, to: role.data } });
  revalidatePath(`/teams/${teamSlug}`, 'layout');
  return { ok: true };
}

export async function removeMember(teamSlug: string, userId: string): Promise<Ok | Denied> {
  const access = await teamForAction(teamSlug, { member: ['remove'] });
  if (denied(access)) return access;

  const [member] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, access.team.id), eq(teamMembers.userId, userId)));
  if (!member) return actionError('That person is not a member of this team.');

  const guard = await lastAdminGuard(access.team.id, member.role, null, access.user.isSuperadmin);
  if (guard) return actionError(guard);

  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, access.team.id), eq(teamMembers.userId, userId)));
  await audit('member.remove', { actorId: access.user.id, teamId: access.team.id, target: { userId, role: member.role } });
  revalidatePath(`/teams/${teamSlug}`, 'layout');
  return { ok: true };
}

/**
 * A team must keep at least one admin. Superadmins can act through it: they
 * administer every team through their instance role anyway.
 */
async function lastAdminGuard(teamId: string, from: TeamRole, to: TeamRole | null, isSuperadmin: boolean): Promise<string | null> {
  if (isSuperadmin) return null;
  if (from !== 'admin' || to === 'admin') return null;
  const admins = await countTeamAdmins(teamId);
  if (admins <= 1) return 'A team needs at least one admin. Promote somebody else first.';
  return null;
}
