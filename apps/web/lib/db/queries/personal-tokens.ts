import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { personalAccessTokens, projects, teams, users } from '@/lib/db/schema';

/**
 * Personal access tokens. Only the sha256 of a token is stored; lookups go by
 * hash. Ownership is always part of the `where` clause of a mutation, so a
 * user can never revoke somebody else's token by guessing an id.
 */

const listColumns = {
  id: personalAccessTokens.id,
  name: personalAccessTokens.name,
  tokenPrefix: personalAccessTokens.tokenPrefix,
  scopes: personalAccessTokens.scopes,
  teamIds: personalAccessTokens.teamIds,
  allTeams: personalAccessTokens.allTeams,
  projectId: personalAccessTokens.projectId,
  projectSlug: projects.slug,
  projectTeamSlug: teams.slug,
  expiresAt: personalAccessTokens.expiresAt,
  lastUsedAt: personalAccessTokens.lastUsedAt,
  revokedAt: personalAccessTokens.revokedAt,
  createdAt: personalAccessTokens.createdAt,
};

export type PersonalTokenListRow = Awaited<ReturnType<typeof listPersonalTokens>>[number];

export async function listPersonalTokens(userId: string) {
  return db
    .select(listColumns)
    .from(personalAccessTokens)
    .leftJoin(projects, eq(projects.id, personalAccessTokens.projectId))
    .leftJoin(teams, eq(teams.id, projects.teamId))
    .where(eq(personalAccessTokens.userId, userId))
    .orderBy(desc(personalAccessTokens.createdAt));
}

/** Every token on the instance, for the superadmin overview. */
export async function listAllPersonalTokens() {
  return db
    .select({ ...listColumns, userId: users.id, userName: users.name, userEmail: users.email })
    .from(personalAccessTokens)
    .innerJoin(users, eq(users.id, personalAccessTokens.userId))
    .leftJoin(projects, eq(projects.id, personalAccessTokens.projectId))
    .leftJoin(teams, eq(teams.id, projects.teamId))
    .orderBy(desc(personalAccessTokens.createdAt));
}

/** The token and its owner, if it is usable right now: not revoked, not expired, owner not banned. */
export async function findActivePersonalToken(tokenHash: string, now = new Date()) {
  const [row] = await db
    .select({
      token: personalAccessTokens,
      user: { id: users.id, email: users.email, name: users.name, image: users.image, role: users.role },
    })
    .from(personalAccessTokens)
    .innerJoin(users, eq(users.id, personalAccessTokens.userId))
    .where(
      and(
        eq(personalAccessTokens.tokenHash, tokenHash),
        isNull(personalAccessTokens.revokedAt),
        gt(personalAccessTokens.expiresAt, now),
        // Better Auth's admin plugin: a ban with an expiry lifts itself.
        or(eq(users.banned, false), lt(users.banExpires, now)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Usage bookkeeping, throttled to one write per minute per token. */
export async function touchPersonalToken(id: string) {
  await db
    .update(personalAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(personalAccessTokens.id, id),
        or(isNull(personalAccessTokens.lastUsedAt), lt(personalAccessTokens.lastUsedAt, sql`now() - interval '1 minute'`)),
      ),
    );
}
