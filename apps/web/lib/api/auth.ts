/**
 * Who a REST API request acts as. The API takes the same personal access
 * tokens as the MCP server (`pwr_pat_…`, Account → Access tokens), verified by
 * the same code, so a token's restrictions, expiry and revocation mean the
 * same thing on both.
 *
 * OAuth access tokens are refused on purpose: they are audience-bound to the
 * MCP server (RFC 8707), and accepting them here would let a token granted to
 * an AI connector drive a different resource than the one the user consented to.
 */
import { OAuthError } from '@modelcontextprotocol/server';
import type { Principal } from '@/lib/auth/principal';
import { verifier } from '@/lib/mcp/auth';
import type { Credential } from '@/lib/mcp/context';
import { ACCESS_PREFIX } from '@/lib/oauth/config';
import { apiError } from './errors';

export interface ApiCaller {
  principal: Principal;
  credential: Credential;
}

/** The token from `Authorization: Bearer …`, or null. */
export function bearerToken(headers: Headers): string | null {
  const value = headers.get('authorization')?.trim();
  const match = value ? /^Bearer\s+(\S+)$/i.exec(value) : null;
  return match?.[1] ?? null;
}

export async function authenticate(headers: Headers): Promise<ApiCaller> {
  const token = bearerToken(headers);
  if (!token) {
    throw apiError('UNAUTHORIZED', 'Missing bearer token.', 'Send "Authorization: Bearer <token>" with a personal access token from Account → Access tokens.');
  }
  if (token.startsWith(ACCESS_PREFIX)) {
    throw apiError('UNAUTHORIZED', 'OAuth access tokens are only valid for the MCP server.', 'Use a personal access token from Account → Access tokens.');
  }
  let info;
  try {
    info = await verifier.verifyAccessToken(token);
  } catch (error) {
    if (error instanceof OAuthError) {
      throw apiError('UNAUTHORIZED', error.message.replace('MCP needs', 'The API needs'), 'Create a personal access token under Account → Access tokens.');
    }
    throw error;
  }
  const principal = info.extra?.principal as Principal;
  if (!principal.grant?.scopes.includes('read')) {
    throw apiError('INSUFFICIENT_SCOPE', 'This token lacks the "read" scope.', 'Create a token with read access.');
  }
  return {
    principal,
    credential: {
      name: typeof info.extra?.tokenName === 'string' ? info.extra.tokenName : null,
      prefix: typeof info.extra?.tokenPrefix === 'string' ? info.extra.tokenPrefix : null,
      expiresAt: info.expiresAt ? new Date(info.expiresAt * 1000) : null,
    },
  };
}
