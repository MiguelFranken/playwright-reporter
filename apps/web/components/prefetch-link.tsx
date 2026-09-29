'use client';

import NextLink from 'next/link';
import { useState } from 'react';
import type { LinkProps } from '@miguelfranken/ui/provider';
import { isPrefetchRoute } from '@/lib/prefetch-routes';

/**
 * The app's `<Link>`: `next/link`, which prefetches the destination's shared
 * App Shell as it scrolls into view, plus a per-link prefetch of the full page
 * once the reader shows intent — the pointer rests on it, it takes focus, or a
 * finger touches it.
 *
 * That second prefetch renders the destination for this exact URL, data
 * included, so the click shows the page rather than its skeletons. It costs a
 * server invocation per link, which is why it waits for intent instead of
 * firing for every link on screen (a run lists hundreds), and why it is only
 * asked for where it gets further than the shell (`lib/prefetch-routes.ts`).
 * A link that sets `prefetch` itself keeps its own choice.
 *
 * `@miguelfranken/ui` renders every link through this (`AppUiProvider`).
 */
export function PrefetchLink({ prefetch, onPointerEnter, onFocus, onTouchStart, ...props }: LinkProps) {
  const [intent, setIntent] = useState(false);
  const eligible = prefetch === undefined && isPrefetchRoute(props.href);
  // `null` is next/link's default (the App Shell); `true` adds the per-link prefetch.
  const mode = prefetch ?? (eligible && intent ? true : null);
  const onIntent = () => {
    if (eligible && !intent) setIntent(true);
  };

  return (
    <NextLink
      {...props}
      prefetch={mode}
      onPointerEnter={(event) => {
        onIntent();
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        onIntent();
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        onIntent();
        onTouchStart?.(event);
      }}
    />
  );
}
