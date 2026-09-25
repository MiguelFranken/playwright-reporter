import { RPCHandler } from '@orpc/server/fetch';
import { appRouter } from '@/lib/rpc/router';

/**
 * The app's internal RPC endpoint (`lib/rpc/router.ts`), called by client
 * components through TanStack Query. POST only: oRPC's RPC protocol sends
 * every call as a POST, and the session cookie is `SameSite=Lax`, so another
 * site cannot make the browser call it with the user's session.
 */
const handler = new RPCHandler(appRouter);

async function handle(request: Request) {
  // Belt and braces for browsers that send Fetch Metadata.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response('forbidden', { status: 403 });
  const { response } = await handler.handle(request, { prefix: '/api/rpc' });
  return response ?? new Response('not found', { status: 404 });
}

export const POST = handle;
