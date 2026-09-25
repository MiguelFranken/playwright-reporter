import { Suspense, type ReactNode } from 'react';
import { searchKey } from '@/lib/search-key';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * A Suspense boundary that shows its fallback again every time the query
 * changes — the next page, another filter, a new sort.
 *
 * Filters and the pager navigate inside a transition, and during a transition
 * React keeps content that is already on screen rather than fall back to a
 * skeleton. So a plain boundary shows the skeleton on the first load only; on
 * every later change the old rows stay put until the new ones arrive, which
 * reads as nothing happening. Keying the boundary on the query makes each
 * result set a new boundary, and a new boundary does show its fallback.
 *
 * `omit` names params that do not change the results (a selected row that
 * opens a drawer, say), so setting them keeps the table where it is.
 *
 * Reading the query is dynamic, so the key is computed under an outer boundary
 * with the same fallback; the static shell around it still prerenders.
 */
export function ResultsBoundary({
  searchParams,
  omit,
  fallback,
  children,
}: {
  searchParams: Promise<SearchParams>;
  omit?: readonly string[];
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <Keyed searchParams={searchParams} omit={omit} fallback={fallback}>
        {children}
      </Keyed>
    </Suspense>
  );
}

async function Keyed({
  searchParams,
  omit,
  fallback,
  children,
}: {
  searchParams: Promise<SearchParams>;
  omit?: readonly string[];
  fallback: ReactNode;
  children: ReactNode;
}) {
  const key = searchKey(await searchParams, omit);
  return (
    <Suspense key={key} fallback={fallback}>
      {children}
    </Suspense>
  );
}
