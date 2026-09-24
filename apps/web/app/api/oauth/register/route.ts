import { registerClient, type RegistrationRequest } from '@/lib/oauth/clients';
import { OAuthProtocolError } from '@/lib/oauth/errors';
import { handle, json, preflight } from '@/lib/oauth/http';
import { consumeRegistrationLimit } from '@/lib/oauth/limits';

/** Dynamic Client Registration (RFC 7591), for MCP clients that do not use a metadata document. */
export async function POST(request: Request) {
  return handle(async () => {
    if (!(await consumeRegistrationLimit(request))) throw new OAuthProtocolError('slow_down', 'Too many registrations from this address; try again later.', 429);
    let body: RegistrationRequest;
    try {
      body = (await request.json()) as RegistrationRequest;
    } catch {
      throw new OAuthProtocolError('invalid_client_metadata', 'The body must be a JSON object.');
    }
    return json(await registerClient(body ?? {}), 201);
  });
}

export const OPTIONS = preflight;
