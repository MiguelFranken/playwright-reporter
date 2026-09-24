/**
 * Bearer authentication for the MCP endpoint, in the shape the SDK's
 * `requireBearerAuth` expects: a verifier that turns a token into `AuthInfo`
 * or throws an `OAuthError`. The SDK writes the 401/403 and its
 * `WWW-Authenticate` challenge; our message lands in `error_description`.
 *
 * The principal the rest of the server works with travels in
 * `AuthInfo.extra.principal`.
 */
import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from '@modelcontextprotocol/server';
import { after } from 'next/server';
import { isDemoUser } from '@/lib/auth/demo';
import type { GrantScope, Principal } from '@/lib/auth/principal';
import { findActivePersonalToken, touchPersonalToken } from '@/lib/db/queries/personal-tokens';
import { ACCESS_PREFIX, isOurResource } from '@/lib/oauth/config';
import { findActiveAccessToken, touchGrant } from '@/lib/oauth/tokens';
import { INGEST_PREFIX, PAT_PREFIX, hashToken } from '@/lib/tokens';

const scopesOf = (scopes: string[]) => scopes.filter((s): s is GrantScope => s === 'read' || s === 'write');

export const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (token.startsWith(ACCESS_PREFIX)) return verifyOAuthToken(token);
    if (!token.startsWith(PAT_PREFIX)) {
      // Anything else must also be an OAuthError: other errors become a 500.
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        token.startsWith(INGEST_PREFIX)
          ? 'This is a project ingest token. MCP needs a personal access token from Account → Access tokens.'
          : 'Unknown token. MCP needs a personal access token from Account → Access tokens.',
      );
    }
    const row = await findActivePersonalToken(hashToken(token));
    if (!row) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The token is invalid, expired or revoked.');
    if (isDemoUser(row.user)) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The shared demo account cannot use the MCP server.');

    const principal: Principal = {
      user: {
        id: row.user.id,
        email: row.user.email,
        name: row.user.name,
        image: row.user.image,
        isSuperadmin: row.user.role === 'superadmin',
      },
      grant: {
        kind: 'pat',
        id: row.token.id,
        scopes: scopesOf(row.token.scopes),
        teamIds: row.token.teamIds,
        projectId: row.token.projectId,
        allTeams: row.token.allTeams,
      },
    };
    later(() => touchPersonalToken(row.token.id));
    return {
      token,
      clientId: `pat:${row.token.id}`,
      scopes: [...principal.grant!.scopes],
      // Required: the SDK rejects tokens without an expiry. Every PAT has one.
      expiresAt: Math.floor(row.token.expiresAt.getTime() / 1000),
      extra: { principal, tokenName: row.token.name, tokenPrefix: row.token.tokenPrefix },
    };
  },
};

/** An OAuth access token (claude.ai, ChatGPT, …): the grant the user consented to becomes the principal. */
async function verifyOAuthToken(token: string): Promise<AuthInfo> {
  const row = await findActiveAccessToken(token);
  if (!row) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is invalid, expired or revoked.');
  if (isDemoUser(row.user)) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The shared demo account cannot use the MCP server.');
  // Audience binding (RFC 8707): a token minted for another resource is not ours to accept.
  if (!isOurResource(row.token.resource)) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token was issued for another resource.');
  const principal: Principal = {
    user: { id: row.user.id, email: row.user.email, name: row.user.name, image: row.user.image, isSuperadmin: row.user.role === 'superadmin' },
    grant: {
      kind: 'oauth',
      id: row.grant.id,
      scopes: scopesOf(row.grant.scopes),
      teamIds: row.grant.teamIds,
      projectId: row.grant.projectId,
      allTeams: row.grant.allTeams,
    },
  };
  later(() => touchGrant(row.grant.id));
  return {
    token,
    clientId: row.grant.clientId,
    scopes: [...principal.grant!.scopes],
    expiresAt: Math.floor(row.token.expiresAt.getTime() / 1000),
    resource: row.token.resource ? new URL(row.token.resource) : undefined,
    extra: { principal, tokenName: row.clientName, tokenPrefix: null },
  };
}

/** Usage bookkeeping after the response, like the ingest tokens'; never blocks or fails a call. */
function later(fn: () => Promise<unknown>) {
  const touch = () => fn().catch(() => undefined);
  try {
    after(touch);
  } catch {
    // Outside a request scope (tests, scripts) there is no `after`.
    void touch();
  }
}

export function principalFrom(authInfo: AuthInfo | undefined): Principal {
  const principal = authInfo?.extra?.principal as Principal | undefined;
  if (!principal) throw new Error('MCP request without an authenticated principal');
  return principal;
}

export function credentialFrom(authInfo: AuthInfo | undefined) {
  const extra = authInfo?.extra ?? {};
  return {
    name: typeof extra.tokenName === 'string' ? extra.tokenName : null,
    prefix: typeof extra.tokenPrefix === 'string' ? extra.tokenPrefix : null,
    expiresAt: authInfo?.expiresAt ? new Date(authInfo.expiresAt * 1000) : null,
  };
}
