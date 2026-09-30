/**
 * The reads behind the pages people navigate between, as private caches — so
 * a hovered link can render its destination before the click.
 *
 * With Partial Prefetching (`next.config.ts`) a `<Link>` prefetches its route's
 * shared App Shell: the page's frame and its Suspense fallbacks. A link that
 * opts into a *per-link* prefetch goes further and renders the page for that
 * URL (the app's links do so on hover, focus or touch; see
 * `components/prefetch-link.tsx`) — but that prerender stops at the first
 * uncached read. The access check (`lib/auth/access.ts`) and these reads are
 * `'use cache: private'`, so the prefetch runs past them and arrives with the
 * data: the click shows the page, not its skeletons.
 *
 * A private cache is never stored on the server. Within one request it
 * deduplicates calls; after it, only the browser's router keeps the rendered
 * result, for `PAGE_DATA.stale` seconds. Every server request still reads the
 * database, and there is no server cache to invalidate. The live pages (runs
 * list, run page) carry the event cursor their data reflects and replay the
 * stream from there, so a prefetched snapshot catches up on arrival.
 *
 * Each export has the name and signature of the query it wraps
 * (`lib/db/queries/*`), which stays uncached for the REST API, the MCP server
 * and the workflows. Pages import from here; everything else imports the
 * query. Arguments are the cache key, so they must be plain values.
 *
 * Adding a page: wrap its reads here, and add its route to `PREFETCH_ROUTES`
 * (`lib/prefetch-routes.ts`) so links to it prefetch on intent.
 */
import 'server-only';
import { cacheLife } from 'next/cache';
import * as branches from '@/lib/db/queries/branches';
import * as dashboard from '@/lib/db/queries/dashboard';
import * as explorer from '@/lib/db/queries/explorer';
import * as pullRequests from '@/lib/db/queries/pull-requests';
import * as runs from '@/lib/db/queries/runs';
import * as teams from '@/lib/db/queries/teams';
import * as testCases from '@/lib/db/queries/test-cases';
import * as mcpQueries from '@/lib/db/queries/mcp';
import * as review from '@/lib/review/queries';
import * as reviewCases from '@/lib/review/cases';
import * as library from '@/lib/review/library';
import * as libraryViews from '@/lib/review/library-views';

/**
 * Thirty seconds: the shortest lifetime Next.js still includes in a per-link
 * prefetch, and the router's `staleTimes.dynamic`. A prefetch older than that
 * is fetched again on the click.
 */
const PAGE_DATA = { stale: 30 } as const;

/**
 * The instant a page measures "5 minutes ago" from, for the views rendered on
 * the server (`now` on `BranchesTable`, `BranchHeader` and friends).
 *
 * A prefetch now renders past the cached reads into the views, and a bare
 * clock read there would stop it (Next.js refuses an unstable value while
 * prerendering). Read inside a private cache, the clock is part of the cached
 * render: the relative times are as old as the data they describe, at most
 * `PAGE_DATA.stale` seconds.
 */
export async function renderedAt(): Promise<Date> {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return new Date();
}

// ---------------------------------------------------------------- teams

export async function listTeamProjects(...args: Parameters<typeof teams.listTeamProjects>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return teams.listTeamProjects(...args);
}

// ---------------------------------------------------------------- runs

export async function listRuns(...args: Parameters<typeof runs.listRuns>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.listRuns(...args);
}

export async function listActiveRunsWithCursor(...args: Parameters<typeof runs.listActiveRunsWithCursor>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.listActiveRunsWithCursor(...args);
}

export async function getRunByNumber(...args: Parameters<typeof runs.getRunByNumber>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.getRunByNumber(...args);
}

export async function getResultDetail(...args: Parameters<typeof runs.getResultDetail>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.getResultDetail(...args);
}

export async function testHistory(...args: Parameters<typeof runs.testHistory>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.testHistory(...args);
}

export async function listBranches(...args: Parameters<typeof runs.listBranches>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.listBranches(...args);
}

export async function listPullRequests(...args: Parameters<typeof runs.listPullRequests>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.listPullRequests(...args);
}

export async function listEnvironments(...args: Parameters<typeof runs.listEnvironments>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.listEnvironments(...args);
}

export async function listPlatforms(...args: Parameters<typeof runs.listPlatforms>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.listPlatforms(...args);
}

export async function listTestTags(...args: Parameters<typeof runs.listTestTags>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return runs.listTestTags(...args);
}

// ---------------------------------------------------------------- dashboard

export async function dashboardStats(...args: Parameters<typeof dashboard.dashboardStats>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return dashboard.dashboardStats(...args);
}

export async function branchSummary(...args: Parameters<typeof dashboard.branchSummary>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return dashboard.branchSummary(...args);
}

export async function mostFlakyTests(...args: Parameters<typeof dashboard.mostFlakyTests>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return dashboard.mostFlakyTests(...args);
}

export async function chronicFailures(...args: Parameters<typeof dashboard.chronicFailures>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return dashboard.chronicFailures(...args);
}

export async function passFailTrend(...args: Parameters<typeof dashboard.passFailTrend>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return dashboard.passFailTrend(...args);
}

// ---------------------------------------------------------------- explorer

export async function exploreTests(...args: Parameters<typeof explorer.exploreTests>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return explorer.exploreTests(...args);
}

export async function getTestOverview(...args: Parameters<typeof explorer.getTestOverview>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return explorer.getTestOverview(...args);
}

// ---------------------------------------------------------------- branches, pull requests

export async function branchList(...args: Parameters<typeof branches.branchList>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return branches.branchList(...args);
}

export async function getBranchOverview(...args: Parameters<typeof branches.getBranchOverview>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return branches.getBranchOverview(...args);
}

export async function pullRequestList(...args: Parameters<typeof pullRequests.pullRequestList>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return pullRequests.pullRequestList(...args);
}

export async function getPullRequestOverview(...args: Parameters<typeof pullRequests.getPullRequestOverview>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return pullRequests.getPullRequestOverview(...args);
}

// ---------------------------------------------------------------- test cases

export async function getSuiteTree(...args: Parameters<typeof testCases.getSuiteTree>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return testCases.getSuiteTree(...args);
}

export async function listCases(...args: Parameters<typeof testCases.listCases>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return testCases.listCases(...args);
}

export async function getCaseDetail(...args: Parameters<typeof testCases.getCaseDetail>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return testCases.getCaseDetail(...args);
}

export async function caseNeighbours(...args: Parameters<typeof testCases.caseNeighbours>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return testCases.caseNeighbours(...args);
}

export async function listCaseVersions(...args: Parameters<typeof testCases.listCaseVersions>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return testCases.listCaseVersions(...args);
}

export async function getCoverage(...args: Parameters<typeof testCases.getCoverage>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return testCases.getCoverage(...args);
}

export async function listFieldDefs(...args: Parameters<typeof testCases.listFieldDefs>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return testCases.listFieldDefs(...args);
}

export async function listCaseTags(...args: Parameters<typeof testCases.listCaseTags>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return testCases.listCaseTags(...args);
}

// ---------------------------------------------------------------- review checkpoints

export async function runReview(...args: Parameters<typeof review.runReview>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return review.runReview(...args);
}

export async function runReviewCounts(...args: Parameters<typeof review.runReviewCounts>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return review.runReviewCounts(...args);
}

export async function reviewQueue(...args: Parameters<typeof review.reviewQueue>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return review.reviewQueue(...args);
}

export async function defaultBranch(...args: Parameters<typeof mcpQueries.defaultBranch>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return mcpQueries.defaultBranch(...args);
}

export async function casesOfTests(...args: Parameters<typeof reviewCases.casesOfTests>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return reviewCases.casesOfTests(...args);
}

// ---------------------------------------------------------------- the library

export async function listLibraryReferences(...args: Parameters<typeof library.listLibraryReferences>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return library.listLibraryReferences(...args);
}

export async function getLibraryReference(...args: Parameters<typeof library.getLibraryReference>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return library.getLibraryReference(...args);
}

export async function defaultLibraryRef(...args: Parameters<typeof library.defaultLibraryRef>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return library.defaultLibraryRef(...args);
}

export async function libraryFlows(...args: Parameters<typeof library.libraryFlows>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return library.libraryFlows(...args);
}

export async function referenceRuns(...args: Parameters<typeof library.referenceRuns>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return library.referenceRuns(...args);
}

export async function listLibraryViews(...args: Parameters<typeof libraryViews.listLibraryViews>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return libraryViews.listLibraryViews(...args);
}

export async function libraryCandidates(...args: Parameters<typeof library.libraryCandidates>) {
  'use cache: private';
  cacheLife(PAGE_DATA);
  return library.libraryCandidates(...args);
}
