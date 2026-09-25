/**
 * Query options for the RPC procedures, with each one's cache policy.
 *
 * A prefetch and the `useQuery` it warms — or a server prefetch and the client
 * query it hydrates — must agree on the key *and* on the cache policy, or the
 * prefetched answer is thrown away (a different key) or refetched at once (a
 * shorter `staleTime`). Building both from one factory keeps them in step.
 */
import { keepPreviousData } from '@tanstack/react-query';
import type { FormFields } from '@miguelfranken/ui/hooks/use-form-fields';
import { orpc, type ProjectRef } from './client';

/**
 * The explorer drawer's overview of one test.
 *
 * Stale-while-revalidate: re-opening a test within a few minutes shows the
 * cached overview without a request; later it still shows the cached one at
 * once and refetches underneath, so a test that has run since is not frozen
 * at the first answer. The window (`days`) is part of the key, so a range
 * change never serves another range's numbers. A failure is not retried: the
 * drawer keeps the summary from the row, which is perfectly good.
 */
export function testOverviewQuery(ref: ProjectRef, testId: string, days: number) {
  return orpc.tests.overview.queryOptions({
    input: { ...ref, testId, days },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
}

/**
 * What a retention form would delete if saved as it is being edited. Each
 * set of fields is its own entry, so going back to values already previewed
 * answers from the cache; the previous answer stays on screen while the next
 * loads (`placeholderData`), instead of flashing a placeholder per keystroke.
 * The counts move slowly, so half a minute is fresh enough.
 */
export function dataRetentionDueQuery(fields: FormFields) {
  return orpc.admin.dataRetentionDue.queryOptions({
    input: { fields },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function artifactRetentionDueQuery(fields: FormFields) {
  return orpc.admin.artifactRetentionDue.queryOptions({
    input: { fields },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
