/**
 * The authorization server's identity and lifetimes. The issuer is the app's
 * public origin; the only protected resource is the MCP endpoint.
 */
import { baseUrl } from '@/lib/auth/config';

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600;
export const CODE_TTL_SECONDS = 600;
/** Re-fetch a Client ID Metadata Document after this long. */
export const CIMD_TTL_MS = 24 * 3600 * 1000;

export const SUPPORTED_SCOPES = ['read'] as const;

export const ACCESS_PREFIX = 'pwr_oat_';
export const REFRESH_PREFIX = 'pwr_ort_';
export const CODE_PREFIX = 'pwr_oac_';
export const CLIENT_PREFIX = 'pwr_client_';

export const issuer = () => baseUrl();
export const mcpResourceUrl = () => `${baseUrl()}/api/mcp`;

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata() {
  const base = baseUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/connect/mcp`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [...SUPPORTED_SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/account/ai`,
  };
}

/** Accepts the resource indicator (RFC 8707) for our MCP endpoint, with or without a trailing slash. */
export function isOurResource(resource: string | null | undefined): boolean {
  if (!resource) return true;
  const normalize = (u: string) => u.replace(/\/+$/, '');
  return normalize(resource) === normalize(mcpResourceUrl()) || normalize(resource) === normalize(baseUrl());
}
