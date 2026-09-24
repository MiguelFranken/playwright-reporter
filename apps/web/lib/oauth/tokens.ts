/**
 * Codes and tokens. All opaque, all stored as sha256, all short-lived except
 * the refresh token, which rotates on every use: presenting a rotated one
 * again means it was copied, and the whole grant is revoked (RFC 9700 §4.14).
 */
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { oauthClients, oauthCodes, oauthGrants, oauthTokens, users, type OAuthClient } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/tokens';
import { ACCESS_PREFIX, ACCESS_TOKEN_TTL_SECONDS, CODE_PREFIX, CODE_TTL_SECONDS, REFRESH_PREFIX, REFRESH_TOKEN_TTL_SECONDS, isOurResource, mcpResourceUrl } from './config';
import { OAuthProtocolError, invalidGrant, invalidRequest } from './errors';
import { redirectUriMatches } from './clients';

export interface GrantRestrictions {
  scopes: string[];
  teamIds: string[] | null;
  projectId: string | null;
  allTeams: boolean;
}

/** Records the consent and returns the authorization code for the redirect. */
export async function createAuthorization(input: {
  userId: string;
  client: OAuthClient;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  restrictions: GrantRestrictions;
}) {
  const grantId = randomUUID();
  const { token: code } = generateToken(CODE_PREFIX);
  await db.transaction(async (tx) => {
    await tx.insert(oauthGrants).values({ id: grantId, userId: input.userId, clientId: input.client.clientId, ...input.restrictions });
    await tx.insert(oauthCodes).values({
      codeHash: hashToken(code),
      grantId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      resource: input.resource,
      expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
    });
  });
  return { code, grantId };
}

function s256(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function issueTokens(grantId: string, resource: string | null, scopes: string[]) {
  const access = generateToken(ACCESS_PREFIX).token;
  const refresh = generateToken(REFRESH_PREFIX).token;
  const now = Date.now();
  await db.insert(oauthTokens).values([
    { id: randomUUID(), grantId, kind: 'access', tokenHash: hashToken(access), resource: resource ?? mcpResourceUrl(), expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000) },
    { id: randomUUID(), grantId, kind: 'refresh', tokenHash: hashToken(refresh), resource: resource ?? mcpResourceUrl(), expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000) },
  ]);
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refresh, scope: scopes.join(' ') };
}

export async function revokeGrant(grantId: string) {
  const now = new Date();
  await db.update(oauthGrants).set({ revokedAt: now }).where(and(eq(oauthGrants.id, grantId), isNull(oauthGrants.revokedAt)));
  await db.update(oauthTokens).set({ revokedAt: now }).where(and(eq(oauthTokens.grantId, grantId), isNull(oauthTokens.revokedAt)));
}

export async function exchangeCode(client: OAuthClient, params: URLSearchParams) {
  const code = params.get('code');
  const verifier = params.get('code_verifier');
  const redirectUri = params.get('redirect_uri');
  if (!code) throw invalidRequest('code is required.');
  if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw invalidRequest('A valid code_verifier is required (PKCE).');
  const [row] = await db
    .select({ code: oauthCodes, grant: oauthGrants })
    .from(oauthCodes)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthCodes.grantId))
    .where(eq(oauthCodes.codeHash, hashToken(code)))
    .limit(1);
  if (!row || row.grant.clientId !== client.clientId) throw invalidGrant('The authorization code is invalid.');
  if (row.code.usedAt) {
    // A replayed code: revoke everything it produced (RFC 6749 §4.1.2).
    await revokeGrant(row.grant.id);
    throw invalidGrant('The authorization code was already used.');
  }
  if (row.code.expiresAt < new Date()) throw invalidGrant('The authorization code has expired.');
  if (row.grant.revokedAt) throw invalidGrant('The authorization was revoked.');
  if (redirectUri && !redirectUriMatches([row.code.redirectUri], redirectUri)) throw invalidGrant('redirect_uri does not match the authorization request.');
  if (s256(verifier) !== row.code.codeChallenge) throw invalidGrant('The code_verifier does not match the code_challenge.');
  const resource = params.get('resource');
  if (!isOurResource(resource)) throw new OAuthProtocolError('invalid_target', 'Unknown resource.');
  const [claimed] = await db
    .update(oauthCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthCodes.codeHash, row.code.codeHash), isNull(oauthCodes.usedAt)))
    .returning({ codeHash: oauthCodes.codeHash });
  if (!claimed) throw invalidGrant('The authorization code was already used.');
  return issueTokens(row.grant.id, row.code.resource ?? resource, row.grant.scopes);
}

export async function refresh(client: OAuthClient, params: URLSearchParams) {
  const token = params.get('refresh_token');
  if (!token) throw invalidRequest('refresh_token is required.');
  const [row] = await db
    .select({ token: oauthTokens, grant: oauthGrants })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .where(and(eq(oauthTokens.tokenHash, hashToken(token)), eq(oauthTokens.kind, 'refresh')))
    .limit(1);
  if (!row || row.grant.clientId !== client.clientId) throw invalidGrant('The refresh token is invalid.');
  if (row.token.rotatedAt) {
    await revokeGrant(row.grant.id);
    throw invalidGrant('The refresh token was already used; the authorization has been revoked for safety.');
  }
  if (row.token.revokedAt || row.grant.revokedAt || row.token.expiresAt < new Date()) throw invalidGrant('The refresh token is expired or revoked.');
  const [rotated] = await db
    .update(oauthTokens)
    .set({ rotatedAt: new Date() })
    .where(and(eq(oauthTokens.id, row.token.id), isNull(oauthTokens.rotatedAt)))
    .returning({ id: oauthTokens.id });
  if (!rotated) {
    await revokeGrant(row.grant.id);
    throw invalidGrant('The refresh token was already used.');
  }
  // A narrower scope may be requested; a broader one may not.
  const requested = params.get('scope')?.split(/\s+/).filter(Boolean);
  const scopes = requested?.length ? row.grant.scopes.filter((s) => requested.includes(s)) : row.grant.scopes;
  return issueTokens(row.grant.id, row.token.resource, scopes.length ? scopes : row.grant.scopes);
}

/** RFC 7009: revoking a refresh token ends the grant; revoking an access token ends only that token. */
export async function revokeToken(client: OAuthClient, token: string) {
  const [row] = await db
    .select({ token: oauthTokens, grant: oauthGrants })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .where(eq(oauthTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.grant.clientId !== client.clientId) return;
  if (row.token.kind === 'refresh') await revokeGrant(row.grant.id);
  else await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.id, row.token.id));
}

/** The grant and user behind a live access token, for the MCP endpoint's verifier. */
export async function findActiveAccessToken(token: string, now = new Date()) {
  const [row] = await db
    .select({
      token: oauthTokens,
      grant: oauthGrants,
      clientName: oauthClients.clientName,
      user: { id: users.id, email: users.email, name: users.name, image: users.image, role: users.role },
    })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthGrants.clientId))
    .innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(
      and(
        eq(oauthTokens.tokenHash, hashToken(token)),
        eq(oauthTokens.kind, 'access'),
        isNull(oauthTokens.revokedAt),
        isNull(oauthGrants.revokedAt),
        gt(oauthTokens.expiresAt, now),
        or(eq(users.banned, false), lt(users.banExpires, now)),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function touchGrant(grantId: string) {
  await db
    .update(oauthGrants)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(oauthGrants.id, grantId), or(isNull(oauthGrants.lastUsedAt), lt(oauthGrants.lastUsedAt, sql`now() - interval '1 minute'`))));
}

/** The connected applications of a user, for Account → Connected apps. */
export async function listGrants(userId: string) {
  return db
    .select({
      id: oauthGrants.id,
      clientName: oauthClients.clientName,
      clientUri: oauthClients.clientUri,
      clientId: oauthClients.clientId,
      kind: oauthClients.kind,
      scopes: oauthGrants.scopes,
      teamIds: oauthGrants.teamIds,
      projectId: oauthGrants.projectId,
      allTeams: oauthGrants.allTeams,
      createdAt: oauthGrants.createdAt,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthGrants.clientId))
    .where(and(eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)))
    .orderBy(sql`${oauthGrants.createdAt} desc`);
}
