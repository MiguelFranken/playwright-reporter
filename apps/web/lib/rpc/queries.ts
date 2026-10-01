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
import { orpc, type ProjectRef, type RunRef } from './client';

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
 * One capture's measured comparison while the viewer waits for it. It asks
 * every two seconds until the measurement is done (or cannot be), and a
 * settled answer never goes stale: a diff id's numbers do not change.
 */
export function captureDiffQuery(ref: ProjectRef, captureId: string, compareCaptureId?: string) {
  return orpc.review.diff.queryOptions({
    input: { ...ref, captureId, ...(compareCaptureId ? { compareCaptureId } : {}) },
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
    refetchInterval: (query) => (query.state.data?.diff?.state === 'pending' ? 2000 : false),
  });
}

/** The analyses of a capture against its reference, and whether one may be started. */
export function captureAnalysesQuery(ref: ProjectRef, captureId: string, baseCaptureId: string) {
  return orpc.review.analyses.queryOptions({ input: { ...ref, captureId, baseCaptureId }, staleTime: 30_000, gcTime: 10 * 60_000, retry: false });
}

/** One analysis while it runs: asked every three seconds until it is done (or failed), then kept. */
export function analysisQuery(ref: ProjectRef, analysisId: string) {
  return orpc.review.analysis.queryOptions({
    input: { ...ref, analysisId },
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
    refetchInterval: (query) => (query.state.data && (query.state.data.status === 'queued' || query.state.data.status === 'running') ? 3000 : false),
  });
}

/**
 * What rectangles drawn in the ignore editor would do to the open comparison.
 * Each set of rectangles is its own entry; an answer never goes stale (the two
 * images do not change), and a failure is shown, not retried.
 */
export function ignorePreviewQuery(ref: ProjectRef, captureId: string, regions: readonly { x: number; y: number; width: number; height: number }[], compareCaptureId?: string) {
  return orpc.review.previewIgnore.queryOptions({
    input: { ...ref, captureId, regions: [...regions], ...(compareCaptureId ? { compareCaptureId } : {}) },
    staleTime: Infinity,
    gcTime: 10 * 60_000,
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

/**
 * A run's tab data: every result row (or one spec file's), the per-file
 * tallies, the error groups. Each answer carries the event cursor it reflects,
 * and the live store replays the stream from there, so a cached answer is
 * never wrong for long — a running run catches up from its events, a finished
 * one does not change. Switching tabs, outcomes or files therefore answers
 * from the cache and shows no placeholder; a later visit still refetches
 * underneath once the answer is a few minutes old.
 *
 * The server seeds these (`lib/rpc/prefetch.ts`) with what it rendered, so the
 * first tab the page opens on is never fetched twice.
 */
const RUN_TAB_CACHE = { staleTime: 5 * 60_000, gcTime: 30 * 60_000 } as const;

export function runRowsQuery(ref: RunRef, file?: string) {
  return orpc.runs.rows.queryOptions({ input: file ? { ...ref, file } : ref, ...RUN_TAB_CACHE });
}

export function runSpecsQuery(ref: RunRef) {
  return orpc.runs.specs.queryOptions({ input: ref, ...RUN_TAB_CACHE });
}

export function runErrorsQuery(ref: RunRef) {
  return orpc.runs.errors.queryOptions({ input: ref, ...RUN_TAB_CACHE });
}

/**
 * Every tab query of one run — the rows of each file included, since query
 * keys match partially — e.g. to mark them stale once the run has finished.
 */
export function runTabQueryKeys(ref: RunRef) {
  return [orpc.runs.rows.key({ input: ref }), orpc.runs.specs.key({ input: ref }), orpc.runs.errors.key({ input: ref })];
}

/**
 * The Playwright tests a link or adopt picker offers, per search. The list
 * moves with every run, so an answer is fresh for half a minute; the previous
 * search stays on screen while the next loads.
 */
export function automatedTestsQuery(ref: ProjectRef, q: string, uncovered: boolean) {
  return orpc.testCases.automatedTests.queryOptions({
    input: { ...ref, q, uncovered },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** A run of one project, by the number its pages show. */
export type RunNumberRef = ProjectRef & { runNumber: number };

/**
 * A run's review storyboard: every flow, checkpoint and image status of the
 * run. The page renders it on the server into this query, so the first
 * screen of rows arrives with the HTML; the cache keeps it while the
 * reviewer moves between the storyboard and a result, and decisions change
 * it in place (`decideReviewMutation`) instead of rendering the page again.
 * A run's images do not change once it has finished, and the page seeds a
 * fresh answer on every visit, so the cache does not refetch on its own.
 */
export function runReviewQuery(ref: RunNumberRef) {
  return orpc.review.run.queryOptions({ input: ref, staleTime: 5 * 60_000, gcTime: 30 * 60_000 });
}

/**
 * One page of the test case list, per query string (`caseListKey`). The cases
 * page changes its filters, sort, page and suite in place, so each list it has
 * shown stays here: going back to one — ticking an option off again — shows
 * it at once, and a list older than half a minute refetches underneath. The
 * page seeds the list it rendered, so the first one is never fetched twice;
 * hovering a suite fetches that suite's list ahead of the click.
 */
export function caseListQuery(ref: ProjectRef, query: string) {
  return orpc.testCases.list.queryOptions({ input: { ...ref, query }, staleTime: 30_000, gcTime: 10 * 60_000 });
}

/** Every cached case list of every project, e.g. to mark them stale after an edit. */
export function caseListQueryKey() {
  return orpc.testCases.list.key();
}
