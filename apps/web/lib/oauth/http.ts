/**
 * Request plumbing shared by the OAuth endpoints: form or JSON bodies, CORS
 * for browser-based clients (tokens are bearer credentials, never cookies, so
 * a wildcard origin is safe here), and uniform error responses.
 */
import { OAuthProtocolError } from './errors';

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
  'access-control-max-age': '86400',
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function readParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get('content-type') ?? '';
  const text = await request.text();
  if (text.length > 64 * 1024) throw new OAuthProtocolError('invalid_request', 'Request body too large.');
  if (type.includes('application/json')) {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text || '{}');
    } catch {
      throw new OAuthProtocolError('invalid_request', 'Malformed JSON body.');
    }
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) if (typeof v === 'string') params.set(k, v);
    return params;
  }
  return new URLSearchParams(text);
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', pragma: 'no-cache', ...CORS_HEADERS } });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof OAuthProtocolError) {
      const response = error.toResponse();
      for (const [k, v] of Object.entries(CORS_HEADERS)) response.headers.set(k, v);
      return response;
    }
    console.error('[oauth] unexpected error', error);
    return json({ error: 'server_error', error_description: 'Unexpected error.' }, 500);
  }
}
