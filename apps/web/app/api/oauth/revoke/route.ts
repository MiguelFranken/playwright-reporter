import { authenticateClient } from '@/lib/oauth/clients';
import { handle, json, preflight, readParams } from '@/lib/oauth/http';
import { revokeToken } from '@/lib/oauth/tokens';

/** Token revocation (RFC 7009). Answers 200 for unknown tokens too, as the RFC requires. */
export async function POST(request: Request) {
  return handle(async () => {
    const params = await readParams(request);
    const client = await authenticateClient(request, params);
    const token = params.get('token');
    if (token) await revokeToken(client, token);
    return json({});
  });
}

export const OPTIONS = preflight;
