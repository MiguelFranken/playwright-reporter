'use client';

import { UiProvider } from '@miguelfranken/ui/provider';
import { PrefetchLink } from './prefetch-link';

/**
 * Teaches `@miguelfranken/ui` how this host renders a link: `next/link`, with
 * a full prefetch on intent for the pages that support one (`PrefetchLink`).
 *
 * This lives in its own client component because `linkComponent` is a function,
 * and a server component cannot pass one across the boundary — the wiring has
 * to happen on the client side of it.
 */
export function AppUiProvider({ children }: { children: React.ReactNode }) {
  return <UiProvider linkComponent={PrefetchLink}>{children}</UiProvider>;
}
