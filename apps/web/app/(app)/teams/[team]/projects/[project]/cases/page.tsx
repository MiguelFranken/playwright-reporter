import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { Suspense } from 'react';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { FilterSkeleton, MetricCardsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { organizePrompt } from '@miguelfranken/ui/lib/ai-handoff';
import { flattenSuites } from '@miguelfranken/ui/lib/test-case-models';
import {
  CASE_AUTOMATION_LABELS,
  CASE_AUTOMATIONS,
  CASE_PRIORITIES,
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  CASE_VERDICT_LABELS,
  CASE_VERDICTS,
  labelItems,
} from '@miguelfranken/ui/lib/test-cases';
import { CoverageSummary } from '@miguelfranken/ui/views/test-cases/coverage-summary';
import { ShallowUrlParams, UrlMultiSelect, UrlSearch } from '@/components/filters/url-filters';
import { LibraryActions } from '@/components/test-cases/library-actions';
import { SuiteSidebar } from '@/components/test-cases/suite-sidebar';
import { CASE_LIST_SKELETON, UrlCaseResults } from '@/components/test-cases/url-case-results';
import { requireProject } from '@/lib/auth/access';
import { baseUrl } from '@/lib/auth/config';
import { getCoverage, getSuiteTree, listCases, listCaseTags, renderedAt } from '@/lib/page-data';
import { makeServerQueryClient } from '@/lib/rpc/prefetch';
import { caseListQuery } from '@/lib/rpc/queries';
import { caseListView } from '@/lib/test-cases/case-list-view';
import { caseListKey } from '@/lib/test-cases/filters';

type SearchParams = Record<string, string | string[] | undefined>;
type Params = Promise<{ team: string; project: string }>;
type Props = { params: Params; searchParams: Promise<SearchParams> };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The test case library: coverage at the top, the suite tree beside the list.
 * The header, the search and the static filters render at once; the tree,
 * the numbers and the list each stream on their own.
 *
 * The suite, the filters, the sort and the page change in place
 * (`ShallowUrlParams`): the list reads a cached query per combination, which
 * this page seeds with the one it rendered, so nothing below renders on the
 * server again for them.
 */
export default function CasesPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader title="Test Cases" description="Manual and automated test cases in one place, with what your Playwright runs say about each.">
        <Suspense fallback={<Skeleton className="h-8 w-64" />}>
          <HeaderActions params={params} searchParams={searchParams} />
        </Suspense>
      </PageHeader>

      <Suspense fallback={<MetricCardsSkeleton count={6} />}>
        <Coverage params={params} />
      </Suspense>

      <ShallowUrlParams>
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Tree params={params} />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <UrlSearch placeholder="Search key, title, steps or tags" className="xl:min-w-72" />
            <div className="flex flex-wrap items-center gap-2">
              <UrlMultiSelect param="status" placeholder="Status" allLabel="All statuses" options={labelItems(CASE_STATUSES, CASE_STATUS_LABELS)} className="min-w-32" />
              <UrlMultiSelect param="priority" placeholder="Priority" allLabel="All priorities" options={labelItems(CASE_PRIORITIES, CASE_PRIORITY_LABELS)} className="min-w-32" />
              <UrlMultiSelect param="automation" placeholder="Automation" allLabel="All automation" options={labelItems(CASE_AUTOMATIONS, CASE_AUTOMATION_LABELS)} className="min-w-36" />
              <UrlMultiSelect param="verdict" placeholder="Linked tests" allLabel="Any result" options={labelItems(CASE_VERDICTS, CASE_VERDICT_LABELS)} className="min-w-36" />
              <Suspense fallback={<FilterSkeleton widths={[120]} />}>
                <TagFilter params={params} />
              </Suspense>
            </div>
          </div>
          <Suspense fallback={CASE_LIST_SKELETON}>
            <Results params={params} searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
      </ShallowUrlParams>
    </>
  );
}

async function HeaderActions({ params, searchParams }: Props) {
  const [{ team, project: slug }, sp] = await Promise.all([params, searchParams]);
  const access = await requireProject(team, slug);
  const base = `/teams/${team}/projects/${access.project.slug}`;
  const tree = await getSuiteTree(access.project.id);
  return (
    <LibraryActions
      base={base}
      projectRef={{ team, project: access.project.slug }}
      suites={flattenSuites(tree.roots)}
      canCreate={access.can({ testCase: ['create'] })}
      startAdopting={first(sp.adopt) === '1'}
      newCaseHref={`${base}/cases/new`}
      exportHref={`${base}/cases/export`}
      aiPrompt={organizePrompt({ casesUrl: `${baseUrl()}${base}/cases` })}
    />
  );
}

async function Coverage({ params }: { params: Params }) {
  const { team, project: slug } = await params;
  const { project } = await requireProject(team, slug);
  const base = `/teams/${team}/projects/${project.slug}/cases`;
  const coverage = await getCoverage(project.id, await renderedAt());
  return (
    <CoverageSummary
      coverage={coverage}
      hrefs={{
        planned: `${base}?automation=planned`,
        failing: `${base}?verdict=failing`,
        attention: `${base}?attention=1`,
        uncovered: `${base}?adopt=1`,
      }}
    />
  );
}

/** The tree reads the suite on screen from the URL itself, so it does not wait for the query. */
async function Tree({ params }: { params: Params }) {
  const { team, project: slug } = await params;
  const access = await requireProject(team, slug);
  const tree = await getSuiteTree(access.project.id);
  return (
    <SuiteSidebar
      base={`/teams/${team}/projects/${access.project.slug}`}
      projectRef={{ team, project: access.project.slug }}
      roots={tree.roots}
      total={tree.total}
      unassigned={tree.unassigned}
      canEdit={access.can({ testCase: ['update'] })}
      canDelete={access.can({ testCase: ['delete'] })}
    />
  );
}

async function TagFilter({ params }: { params: Params }) {
  const { team, project: slug } = await params;
  const { project } = await requireProject(team, slug);
  const tags = await listCaseTags(project.id);
  if (tags.length === 0) return null;
  return <UrlMultiSelect param="tag" placeholder="Tag" allLabel="All tags" options={tags.map((t) => ({ value: t, label: t }))} className="min-w-28" />;
}

/**
 * Renders the list on the server once, into the query the client list reads.
 * The read is a private cache (`lib/page-data.ts`), so hovering a link here
 * prefetches the page with its rows.
 */
async function Results({ params, searchParams }: Props) {
  const [{ team, project: slug }, sp] = await Promise.all([params, searchParams]);
  const access = await requireProject(team, slug);
  const projectRef = { team, project: access.project.slug };
  const now = await renderedAt();
  const key = caseListKey(sp);
  const [view, tree] = await Promise.all([caseListView(access.project.id, key, now, listCases), getSuiteTree(access.project.id)]);
  const queries = makeServerQueryClient();
  queries.setQueryData(caseListQuery(projectRef, key).queryKey, view);
  return (
    <HydrationBoundary state={dehydrate(queries)}>
      <UrlCaseResults
        base={`/teams/${team}/projects/${access.project.slug}`}
        projectRef={projectRef}
        roots={tree.roots}
        total={tree.total}
        canCreate={access.can({ testCase: ['create'] })}
        canEdit={access.can({ testCase: ['update'] })}
        canDelete={access.can({ testCase: ['delete'] })}
        now={now}
      />
    </HydrationBoundary>
  );
}
