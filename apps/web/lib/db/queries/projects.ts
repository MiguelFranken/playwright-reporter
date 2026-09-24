import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { apiTokens, users } from '@/lib/db/schema';

// Resolving a project from a slug lives in `lib/auth/access.ts` so that access
// is always decided before any data is read. Queries here take ids only.

export async function listTokens(projectId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
      createdByName: users.name,
    })
    .from(apiTokens)
    .leftJoin(users, eq(users.id, apiTokens.createdBy))
    .where(eq(apiTokens.projectId, projectId))
    .orderBy(asc(apiTokens.createdAt));
}
