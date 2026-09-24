import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamInvitations, teams, type TeamRole } from '@/lib/db/schema';
import { invitationTtlHours } from './config';

/** Same pattern as `api_tokens`: random 32 bytes, only the SHA-256 is stored. */
export function generateInvitationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function invitationExpiry(from = new Date()) {
  return new Date(from.getTime() + invitationTtlHours() * 3600 * 1000);
}

export type ResolvedInvitation = {
  id: string;
  teamId: string;
  teamSlug: string;
  teamName: string;
  email: string;
  role: TeamRole;
  expiresAt: Date;
};

/**
 * Resolves a raw token to a *usable* invitation: not accepted, not revoked, not
 * expired. Returns null for every other case without distinguishing them, so
 * the page cannot be used to probe which tokens exist.
 */
export async function resolveInvitation(token: string): Promise<ResolvedInvitation | null> {
  if (!token) return null;
  const [row] = await db
    .select({
      id: teamInvitations.id,
      teamId: teamInvitations.teamId,
      teamSlug: teams.slug,
      teamName: teams.name,
      email: teamInvitations.email,
      role: teamInvitations.role,
      expiresAt: teamInvitations.expiresAt,
    })
    .from(teamInvitations)
    .innerJoin(teams, eq(teams.id, teamInvitations.teamId))
    .where(
      and(
        eq(teamInvitations.tokenHash, hashInvitationToken(token)),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Team roles ordered weakest to strongest; used when re-inviting an existing member. */
const RANK: Record<TeamRole, number> = { viewer: 0, member: 1, admin: 2 };

export function higherRole(a: TeamRole, b: TeamRole): TeamRole {
  return RANK[a] >= RANK[b] ? a : b;
}
