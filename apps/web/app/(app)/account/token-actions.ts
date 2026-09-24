'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionError, getCurrentUser, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { patMaxTtlDays } from '@/lib/auth/config';
import { DEMO_READ_ONLY, isDemoUser } from '@/lib/auth/demo';
import { listAccessibleTeamIds, resolveProjectByIdFor } from '@/lib/auth/principal';
import { db } from '@/lib/db/drizzle';
import { personalAccessTokens } from '@/lib/db/schema';
import { PAT_PREFIX, generateToken, hashToken } from '@/lib/tokens';

const createInput = z.object({
  name: z.string().trim().min(1, 'Give the token a name.').max(60, 'Name must be at most 60 characters.'),
  expiresInDays: z.number().int().min(1),
  /** `all`: every team I can see; `team`: one team; `project`: one project. */
  restriction: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }),
    z.object({ kind: z.literal('team'), teamId: z.uuid() }),
    z.object({ kind: z.literal('project'), projectId: z.uuid() }),
  ]),
  allTeams: z.boolean().default(false),
});

export type CreatePersonalTokenInput = z.input<typeof createInput>;
export type CreatePersonalTokenResult = { ok: true; token: string; name: string } | Denied;

/**
 * Mints a personal access token for the signed-in user. Restrictions are
 * validated against what the user can see *now*; they are re-checked on every
 * request anyway, so they can only ever narrow access.
 */
export async function createPersonalToken(raw: CreatePersonalTokenInput): Promise<CreatePersonalTokenResult> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  // The demo account is shared by every visitor; a token would outlive their visit.
  if (isDemoUser(user)) return actionError(DEMO_READ_ONLY);

  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? 'Invalid input.');
  const input = parsed.data;

  const maxDays = patMaxTtlDays();
  if (input.expiresInDays > maxDays) return actionError(`Tokens can live at most ${maxDays} days.`);
  if (input.allTeams && !user.isSuperadmin) return actionError('Only superadmins can create tokens for all teams.');

  const self = { user, grant: null };
  let teamIds: string[] | null = null;
  let projectId: string | null = null;
  if (input.restriction.kind === 'team') {
    const visible = await listAccessibleTeamIds(self);
    if (!visible.includes(input.restriction.teamId)) return actionError('Team not found.');
    teamIds = [input.restriction.teamId];
  } else if (input.restriction.kind === 'project') {
    const access = await resolveProjectByIdFor(self, input.restriction.projectId);
    if (!access || !access.can({ run: ['read'] })) return actionError('Project not found.');
    projectId = access.project.id;
    teamIds = [access.team.id];
  }

  const { token, prefix } = generateToken(PAT_PREFIX);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  await db.insert(personalAccessTokens).values({
    id,
    userId: user.id,
    name: input.name,
    tokenHash: hashToken(token),
    tokenPrefix: prefix,
    scopes: ['read'],
    teamIds,
    projectId,
    allTeams: input.allTeams,
    expiresAt,
  });
  await audit('pat.create', {
    actorId: user.id,
    projectId,
    teamId: teamIds?.length === 1 ? teamIds[0] : null,
    target: { tokenId: id, name: input.name, prefix, expiresAt: expiresAt.toISOString(), allTeams: input.allTeams },
  });
  revalidatePath('/account');
  return { ok: true, token, name: input.name };
}

/** Revokes one of the caller's own tokens; superadmins may revoke anybody's. */
export async function revokePersonalToken(tokenId: string): Promise<{ ok: true } | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  if (!z.uuid().safeParse(tokenId).success) return actionError('Token not found.');

  const owned = user.isSuperadmin ? undefined : eq(personalAccessTokens.userId, user.id);
  const [row] = await db
    .update(personalAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(personalAccessTokens.id, tokenId), isNull(personalAccessTokens.revokedAt), owned))
    .returning({ id: personalAccessTokens.id, name: personalAccessTokens.name, userId: personalAccessTokens.userId });
  if (!row) return actionError('Token not found.');
  await audit('pat.revoke', { actorId: user.id, target: { tokenId: row.id, name: row.name, ownerId: row.userId } });
  revalidatePath('/account');
  revalidatePath('/admin/mcp');
  return { ok: true };
}
