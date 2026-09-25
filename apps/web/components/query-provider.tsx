'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * TanStack Query for the data client components load themselves (through
 * `lib/rpc/client.ts`). Pages still render their data on the server; queries
 * only hold what a click or a live event asks for afterwards, so nothing is
 * prefetched or hydrated here.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  // One client per browser tab, created on first render (never shared across server requests).
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // What the live views fetch is kept current by the event stream, not by refetching.
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
