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
import type { GrantScope, Principal } from '@/lib/auth/principal';
import { findActivePersonalToken, touchPersonalToken } from '@/lib/db/queries/personal-tokens';
import { INGEST_PREFIX, PAT_PREFIX, hashToken } from '@/lib/tokens';

export const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
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
        scopes: row.token.scopes.filter((s): s is GrantScope => s === 'read' || s === 'write'),
        teamIds: row.token.teamIds,
        projectId: row.token.projectId,
        allTeams: row.token.allTeams,
      },
    };
    touchLater(row.token.id);
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

/** `last_used_at` after the response, like the ingest tokens' bookkeeping; never blocks or fails a call. */
function touchLater(id: string) {
  const touch = () => touchPersonalToken(id).catch(() => undefined);
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
