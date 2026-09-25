/**
 * Server-side prefetching into the browser's query cache.
 *
 * A page starts a query while it renders, without waiting for it, and wraps
 * the client component that reads it in `<HydrationBoundary state={dehydrate(client)}>`.
 * The query is dehydrated while still pending: its promise streams to the
 * browser with the rest of the RSC payload, and the client's `useQuery` for
 * the same key picks up the answer instead of fetching it again. Nothing on
 * the page waits for it.
 *
 * The key must be the one the client asks for, so it comes from the same
 * factory in `lib/rpc/queries.ts`; only the query function differs — the
 * server reads the database directly rather than calling its own RPC route.
 */
import 'server-only';
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';

/** One per request: a server query client must never be shared between users. */
export function makeServerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      dehydrate: {
        // Pending queries too: that is what lets the page stream instead of wait.
        shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}
