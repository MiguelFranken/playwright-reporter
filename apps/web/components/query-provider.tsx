'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';

// Development only: the condition is a build-time constant, so production
// bundles drop the import (and the devtools' own dependencies) entirely.
const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })))
    : () => null;

/**
 * TanStack Query for the data client components load themselves (through
 * `lib/rpc/client.ts`). Pages still render their data on the server; queries
 * only hold what a click or a live event asks for afterwards, so nothing is
 * prefetched or hydrated here.
 *
 * The client lives in the root layout and so outlives every navigation —
 * signing out or in clears it (`app-sidebar.tsx`, `login-form.tsx`).
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
  return (
    <QueryClientProvider client={client}>
      {children}
      <Suspense fallback={null}>
        <ReactQueryDevtools />
      </Suspense>
    </QueryClientProvider>
  );
}
