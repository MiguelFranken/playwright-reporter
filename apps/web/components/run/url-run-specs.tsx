'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { RunSpecs, type SpecSummary } from '@repo/ui/views/run/run-specs';
import type { RunResultRow } from '@repo/ui/views/run/run-result';
import type { SpecFilterChange, SpecFilters } from '@repo/ui/lib/spec-filter';
import { runHrefs } from '@/lib/view-models';

/**
 * Binds the specs tab's search, sort and status filters to the query string,
 * so a narrowed list is as shareable as the run page itself.
 *
 * The href builders are constructed *here* rather than handed down: a function
 * cannot cross the server/client boundary, so the server sends the plain `base`
 * string and this component turns it into callbacks. They carry the filters
 * along, which is what keeps the list narrowed when you open a file.
 *
 * It owns its navigation instead of reusing `useUrlParams` for two reasons,
 * both of which come from the menu staying open while you tick several boxes:
 *
 * - **The committed value lags a round trip.** React holds the old render until
 *   the new one is ready, so a ticked box would sit unticked until the server
 *   answered. `useOptimistic` moves it at once and folds back when `filters`
 *   catches up — including when the user goes back, which is why it is not a
 *   `useState` that would then have to be unwound by hand.
 * - **Two quick changes would race.** Each writes a copy of the *current* query
 *   string, and the second one reads the string from before the first landed.
 *   Writing all three keys from one merged state on every change makes the
 *   result the same whichever order they commit in.
 */
export function UrlRunSpecs({
  base,
  runNumber,
  specs,
  selected,
  rows,
  filters,
}: {
  base: string;
  runNumber: number;
  specs: SpecSummary[];
  selected?: string;
  rows: RunResultRow[] | null;
  filters: SpecFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(filters);

  const onFilterChange = (change: SpecFilterChange) => {
    // An absent key is untouched; an explicit `null` clears it.
    const next: SpecFilters = {
      q: change.q === undefined ? shown.q : (change.q ?? undefined),
      sort: change.sort === undefined ? shown.sort : (change.sort ?? undefined),
      status: change.status === undefined ? shown.status : (change.status ?? undefined),
    };
    startTransition(() => {
      setShown(next);
      const qs = new URLSearchParams(params.toString());
      for (const key of ['q', 'sort', 'status', 'page']) qs.delete(key);
      if (next.q) qs.set('q', next.q);
      if (next.sort) qs.set('sort', next.sort);
      for (const status of next.status ?? []) qs.append('status', status);
      const search = qs.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  };

  return (
    <RunSpecs
      hrefs={runHrefs(base, runNumber, shown)}
      specs={specs}
      selected={selected}
      rows={rows}
      filters={shown}
      isPending={isPending}
      onFilterChange={onFilterChange}
    />
  );
}
