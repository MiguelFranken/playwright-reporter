import { baseUrl } from '@/lib/auth/config';
import { instanceServers, openApiDocument } from '@/lib/api/openapi';

/**
 * This instance's OpenAPI document, with its own origin as the server. Public
 * like any API description: it lists endpoints and schemas, no data.
 */
export async function GET() {
  const doc = await openApiDocument(instanceServers(baseUrl()));
  return Response.json(doc, { headers: { 'cache-control': 'public, max-age=300' } });
}
