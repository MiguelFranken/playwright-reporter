'use client';

import { type ReactNode } from 'react';
import { sameSearch } from '@/lib/filters/pending-queue';
import { usePendingSearch } from './pending-search';

/**
 * Shows the results' skeleton the moment a filter asks for other results,
 * instead of leaving the old rows up until the server answers.
 *
 * The old rows stay mounted, only hidden, so the swap costs the click nothing
 * but a style change; the router replaces them when the new ones arrive.
 * Params in `omit` do not change the results, so a pending change to those
 * alone keeps the rows where they are.
 */
export function PendingResults({ omit = [], fallback, children }: { omit?: readonly string[]; fallback: ReactNode; children: ReactNode }) {
  const { params, pending, committed } = usePendingSearch();
  const changes = pending && !sameSearch(relevant(params, omit), relevant(committed, omit));
  return (
    <>
      {changes ? fallback : null}
      <div style={{ display: changes ? 'none' : 'contents' }}>{children}</div>
    </>
  );
}

function relevant(params: URLSearchParams, omit: readonly string[]) {
  return new URLSearchParams([...params].filter(([k]) => !omit.includes(k))).toString();
}
