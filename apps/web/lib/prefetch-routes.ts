/**
 * The routes worth a per-link prefetch, and the test for them.
 *
 * Every `<Link>` already prefetches its route's App Shell (Partial
 * Prefetching, `next.config.ts`). A per-link prefetch (`prefetch={true}`)
 * renders the destination for that exact URL instead — one server invocation
 * per link — and only pays off where that render gets further than the shell:
 * pages whose access check and reads are private caches (`lib/page-data.ts`).
 * Elsewhere it would stop at the same Suspense fallbacks the shell already
 * has, so those links keep the shell alone.
 *
 * `PrefetchLink` (`components/prefetch-link.tsx`) asks for the per-link
 * prefetch on intent — hover, focus, touch — for hrefs matching these, per the
 * Next.js guidance for pages with many links to the same route.
 *
 * Keep this in step with `lib/page-data.ts`: a route belongs here once its
 * page reads through it.
 */
const TEAM = '/teams/[^/]+';
const PROJECT = `${TEAM}/projects/[^/]+`;

export const PREFETCH_ROUTES: readonly RegExp[] = [
  // The team overview: its project cards.
  new RegExp(`^${TEAM}$`),
  // The project sections in the sidebar.
  new RegExp(`^${PROJECT}/(dashboard|runs|tests|cases|branches|pull-requests|review)$`),
  // The visual review's approved screens.
  new RegExp(`^${PROJECT}/review/screens$`),
  // A run (its header; the tabs stream after the click), a result, a test.
  new RegExp(`^${PROJECT}/runs/\\d+(/review)?$`),
  new RegExp(`^${PROJECT}/runs/\\d+/tests/[^/]+$`),
  new RegExp(`^${PROJECT}/tests/[^/]+$`),
  // A test case and its history.
  new RegExp(`^${PROJECT}/cases/\\d+(/history)?$`),
  // A branch (slashes allowed) and a pull request.
  new RegExp(`^${PROJECT}/branches/.+$`),
  new RegExp(`^${PROJECT}/pull-requests/\\d+$`),
];

/** Whether an href points at a page that renders further than its App Shell when prefetched per link. */
export function isPrefetchRoute(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  const pathname = href.split(/[?#]/, 1)[0]!;
  return PREFETCH_ROUTES.some((route) => route.test(pathname));
}
