/**
 * The browser's client for the app's RPC API (`lib/rpc/router.ts`), and its
 * TanStack Query helpers: `orpc.tests.overview.queryOptions({ input })` gives
 * a query key and function that match the procedure's types.
 */
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { AppRouter } from './router';

// Relative to the page's origin; the app never calls this from the server,
// where pages read the database directly.
const link = new RPCLink({ url: '/api/rpc' });

export const client: RouterClient<AppRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

/** The two slugs every project-scoped procedure takes. */
export type ProjectRef = { team: string; project: string };

/** A run as the RPC procedures address it. */
export type RunRef = ProjectRef & { runId: string };

/** `/teams/<team>/projects/<project>` → its slugs; the live lists get only the base path. */
export function projectRefOf(base: string): ProjectRef {
  const match = /^\/teams\/([^/]+)\/projects\/([^/]+)$/.exec(base);
  if (!match) throw new Error(`Not a project base path: ${base}`);
  return { team: decodeURIComponent(match[1]), project: decodeURIComponent(match[2]) };
}
