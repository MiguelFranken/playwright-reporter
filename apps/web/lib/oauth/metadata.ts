/**
 * The two discovery documents: RFC 9728 protected-resource metadata (at the
 * root and path-suffixed, `…/api/mcp`) and RFC 8414 authorization-server
 * metadata. Served here rather than through the SDK's helper, which insists
 * on an https issuer — that would break `http://localhost` development and
 * self-hosted instances on a private network.
 */
import { authorizationServerMetadata, issuer, mcpResourceUrl, SUPPORTED_SCOPES } from './config';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'mcp-protocol-version',
};

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Playwright Reporter',
    resource_documentation: `${issuer()}/account/ai`,
  };
}

/**
 * The documents come from deployment config alone (never the request), so the
 * CDN may keep them for a day; a new deployment starts with an empty cache.
 */
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

function respond(request: Request, body: unknown) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  return Response.json(body, { headers: { ...CORS, 'cache-control': CACHE_CONTROL } });
}

export const protectedResourceResponse = async (request: Request) => respond(request, protectedResourceMetadata());
export const authorizationServerResponse = async (request: Request) => respond(request, authorizationServerMetadata());
