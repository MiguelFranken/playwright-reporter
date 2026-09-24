/**
 * The MCP endpoint's request pipeline: kill switch → DNS-rebinding guard →
 * bearer auth → SDK handler. The handler is created once per process; it
 * builds a fresh server per request through `buildServer`.
 */
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  originValidationResponse,
  requireBearerAuth,
} from '@modelcontextprotocol/server';
import { mcpResourceUrl } from '@/lib/oauth/config';
import { verifier } from './auth';
import { allowedHosts, mcpEnabledByEnv } from './config';
import { getMcpSetting } from './instance';
import { buildServer } from './server';

const handler = createMcpHandler(buildServer, {
  // 2025-era clients (still most of them) are served statelessly, per request.
  legacy: 'stateless',
  // Modern era: one JSON body per call; our tools emit no progress or logs.
  responseMode: 'json',
  // We never publish list changes; keep idle listen streams bounded.
  maxSubscriptions: 16,
  onerror: (error) => {
    if (!process.env.VITEST) console.error(JSON.stringify({ evt: 'mcp.error', message: error.message }));
  },
});

/**
 * Built per request: the metadata URL depends on BASE_URL, which a test (or a
 * preview deployment) may set after this module loaded. It points clients at
 * the protected-resource document, which is how they discover OAuth.
 */
function gate(request: Request) {
  return requireBearerAuth({
    verifier,
    requiredScopes: ['read'],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(mcpResourceUrl())),
  })(request);
}

/** The env var can only switch it off; a superadmin can also switch it off at runtime. */
export async function mcpEnabled(): Promise<boolean> {
  if (!mcpEnabledByEnv()) return false;
  return (await getMcpSetting()).enabled;
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (!(await mcpEnabled())) {
    return Response.json({ error: 'not_found', message: 'The MCP server is disabled on this instance.' }, { status: 404 });
  }
  const hosts = allowedHosts();
  const rejected = hostHeaderValidationResponse(request, hosts) ?? originValidationResponse(request, hosts);
  if (rejected) return rejected;

  const auth = await gate(request);
  if (auth instanceof Response) return auth;
  return handler.fetch(request, { authInfo: auth });
}
