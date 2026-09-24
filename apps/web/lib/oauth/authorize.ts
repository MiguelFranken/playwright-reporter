/**
 * Validating an authorization request (the query string a client sends the
 * browser to /connect/mcp with). Two kinds of failure, as RFC 6749 §4.1.2.1
 * demands: an unknown client or unregistered redirect URI is shown to the
 * user and never redirected to; anything else goes back to the client as an
 * `error` parameter on its (verified) redirect URI.
 */
import type { OAuthClient } from '@/lib/db/schema';
import { SUPPORTED_SCOPES, isOurResource, issuer } from './config';
import { findClient, redirectUriMatches } from './clients';

export interface AuthorizationRequest {
  client: OAuthClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scopes: string[];
  resource: string | null;
}

export type AuthorizationValidation =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; kind: 'show'; message: string }
  | { ok: false; kind: 'redirect'; redirectTo: string };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  url.searchParams.set('iss', issuer());
  return url.toString();
}

export async function validateAuthorizationRequest(params: Params, opts: { fetchImpl?: typeof fetch } = {}): Promise<AuthorizationValidation> {
  const clientId = one(params.client_id);
  const redirectUri = one(params.redirect_uri);
  const state = one(params.state);
  if (!clientId) return { ok: false, kind: 'show', message: 'The request has no client_id.' };
  let client: OAuthClient | null;
  try {
    client = await findClient(clientId, opts);
  } catch (error) {
    return { ok: false, kind: 'show', message: error instanceof Error ? error.message : 'Unknown client.' };
  }
  if (!client) return { ok: false, kind: 'show', message: 'This application is not registered with this server.' };
  // A single registered URI may be implied; with several the request must name one.
  const effectiveRedirect = redirectUri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!effectiveRedirect || !redirectUriMatches(client.redirectUris, effectiveRedirect)) {
    return { ok: false, kind: 'show', message: 'The redirect URI does not match the ones this application registered.' };
  }
  const fail = (error: string, description: string): AuthorizationValidation => ({
    ok: false,
    kind: 'redirect',
    redirectTo: errorRedirect(effectiveRedirect, error, description, state),
  });
  if (one(params.response_type) !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
  const challenge = one(params.code_challenge);
  if (!challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return fail('invalid_request', 'PKCE is required: send code_challenge.');
  if ((one(params.code_challenge_method) ?? 'plain') !== 'S256') return fail('invalid_request', 'Only code_challenge_method=S256 is supported.');
  const resource = one(params.resource);
  if (!isOurResource(resource)) return fail('invalid_target', 'The requested resource is not served by this authorization server.');
  // Unknown scopes are ignored rather than refused (RFC 6749 §3.3 allows issuing fewer).
  const requested = (one(params.scope) ?? '').split(/\s+/).filter(Boolean);
  const scopes = requested.filter((s): s is (typeof SUPPORTED_SCOPES)[number] => (SUPPORTED_SCOPES as readonly string[]).includes(s));
  return {
    ok: true,
    request: { client, redirectUri: effectiveRedirect, state, codeChallenge: challenge, scopes: scopes.length ? scopes : ['read'], resource },
  };
}
