'use client';

import NextLink from 'next/link';
import { UiProvider } from '@miguelfranken/ui/provider';

/**
 * Teaches `@miguelfranken/ui` how this host renders a link.
 *
 * This lives in its own client component because `linkComponent` is a
 * function, and a server component cannot pass one across the boundary — the
 * wiring has to happen on the client side of it. Same file, same reason, as
 * `apps/web/components/ui-provider.tsx`.
 */
export function SiteUiProvider({ children }: { children: React.ReactNode }) {
  return <UiProvider linkComponent={NextLink}>{children}</UiProvider>;
}
