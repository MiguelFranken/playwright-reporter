import { authenticateClient } from '@/lib/oauth/clients';
import { OAuthProtocolError } from '@/lib/oauth/errors';
import { handle, json, preflight, readParams } from '@/lib/oauth/http';
import { exchangeCode, refresh } from '@/lib/oauth/tokens';

/** The token endpoint: authorization_code (with PKCE) and refresh_token grants. */
export async function POST(request: Request) {
  return handle(async () => {
    const params = await readParams(request);
    const client = await authenticateClient(request, params);
    switch (params.get('grant_type')) {
      case 'authorization_code':
        return json(await exchangeCode(client, params));
      case 'refresh_token':
        return json(await refresh(client, params));
      default:
        throw new OAuthProtocolError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
    }
  });
}

export const OPTIONS = preflight;
