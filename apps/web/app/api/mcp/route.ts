import { handleMcpRequest } from '@/lib/mcp/http';

/**
 * The MCP endpoint (Streamable HTTP). Tools are bounded database reads; 60 s
 * is headroom for cold starts and a hard cap on any idle stream.
 *
 * Under Cache Components `dynamic`/`revalidate` do not exist; POST handlers
 * are never prerendered, and nothing here may be cached — every answer
 * depends on the caller.
 */
export const maxDuration = 60;

export const POST = handleMcpRequest;
// 2025-era clients: the stateless fallback answers GET/DELETE with 405.
// 2026-07-28 clients: the SDK serves its subscription stream here.
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
