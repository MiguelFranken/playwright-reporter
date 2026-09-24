'use server';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { actionError, denied, projectForAction } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { db } from '@/lib/db/drizzle';
import { apiTokens, projects } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/tokens';

export type RenameState = { ok: boolean; message?: string } | null;

export async function renameProject(_prev: RenameState, formData: FormData): Promise<RenameState> {
  const teamSlug = String(formData.get('team') ?? '');
  const projectSlug = String(formData.get('project') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!teamSlug || !projectSlug) return { ok: false, message: 'Missing project.' };
  if (name.length < 1 || name.length > 80) return { ok: false, message: 'Name must be between 1 and 80 characters.' };

  const access = await projectForAction(teamSlug, projectSlug, { project: ['update'] });
  if (denied(access)) return access;

  if (access.project.name === name) return { ok: true, message: 'No changes.' };
  await db.update(projects).set({ name, updatedAt: new Date() }).where(eq(projects.id, access.project.id));
  await audit('project.update', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: access.project.id,
    target: { slug: access.project.slug, name },
  });
  revalidatePath(`/teams/${teamSlug}`, 'layout');
  return { ok: true, message: 'Project renamed.' };
}

export type CreateTokenResult = { ok: true; token: string; name: string } | { ok: false; message: string };

export async function createToken(teamSlug: string, projectSlug: string, rawName: string): Promise<CreateTokenResult> {
  const name = rawName.trim() || 'Reporter token';
  if (name.length > 80) return actionError('Name must be at most 80 characters.');

  const access = await projectForAction(teamSlug, projectSlug, { token: ['create'] });
  if (denied(access)) return access;

  const { token, prefix } = generateToken();
  const id = randomUUID();
  await db.insert(apiTokens).values({
    id,
    projectId: access.project.id,
    tokenHash: hashToken(token),
    tokenPrefix: prefix,
    name,
    createdBy: access.user.id,
  });
  await audit('token.create', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: access.project.id,
    target: { tokenId: id, name, prefix },
  });
  revalidatePath(`/teams/${teamSlug}/projects/${projectSlug}/settings`);
  return { ok: true, token, name };
}

export async function revokeToken(teamSlug: string, projectSlug: string, tokenId: string): Promise<{ ok: boolean; message?: string }> {
  const access = await projectForAction(teamSlug, projectSlug, { token: ['revoke'] });
  if (denied(access)) return access;

  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.projectId, access.project.id)))
    .returning({ id: apiTokens.id, name: apiTokens.name });
  if (!row) return actionError('Token not found.');
  await audit('token.revoke', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: access.project.id,
    target: { tokenId: row.id, name: row.name },
  });
  revalidatePath(`/teams/${teamSlug}/projects/${projectSlug}/settings`);
  return { ok: true };
}
