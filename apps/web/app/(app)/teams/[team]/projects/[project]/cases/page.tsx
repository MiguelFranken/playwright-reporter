import { ClipboardList } from 'lucide-react';
import { Suspense } from 'react';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { FilterSkeleton, MetricCardsSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { flattenSuites, type SuiteNode } from '@miguelfranken/ui/lib/test-case-models';
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
import { Pagination } from '@/components/filters/pagination';
import { ResultsBoundary } from '@/components/filters/results-boundary';
import { UrlSearch, UrlSelect } from '@/components/filters/url-filters';
import { CaseList } from '@/components/test-cases/case-list';
import { LibraryActions } from '@/components/test-cases/library-actions';
import { SuiteSidebar } from '@/components/test-cases/suite-sidebar';
import { requireProject } from '@/lib/auth/access';
import { getCoverage, getSuiteTree, listCases, listCaseTags, renderedAt } from '@/lib/page-data';
import { listQuery, parseCaseFilters } from '@/lib/test-cases/filters';

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

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Tree params={params} searchParams={searchParams} />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <UrlSearch placeholder="Search key, title, steps or tags" className="xl:min-w-72" />
            <div className="flex flex-wrap items-center gap-2">
              <UrlSelect param="status" placeholder="Status" allLabel="All statuses" options={labelItems(CASE_STATUSES, CASE_STATUS_LABELS)} className="min-w-32" />
              <UrlSelect param="priority" placeholder="Priority" allLabel="All priorities" options={labelItems(CASE_PRIORITIES, CASE_PRIORITY_LABELS)} className="min-w-32" />
              <UrlSelect param="automation" placeholder="Automation" allLabel="All automation" options={labelItems(CASE_AUTOMATIONS, CASE_AUTOMATION_LABELS)} className="min-w-36" />
              <UrlSelect param="verdict" placeholder="Linked tests" allLabel="Any result" options={labelItems(CASE_VERDICTS, CASE_VERDICT_LABELS)} className="min-w-36" />
              <Suspense fallback={<FilterSkeleton widths={[120]} />}>
                <TagFilter params={params} />
              </Suspense>
            </div>
          </div>
          <ResultsBoundary searchParams={searchParams} omit={['adopt']} fallback={<TableRowsSkeleton rows={10} columns={[8, 40, 8, 12, 16, 12]} className="panel" />}>
            <Results params={params} searchParams={searchParams} />
          </ResultsBoundary>
        </div>
      </div>
    </>
  );
}

async function HeaderActions({ params, searchParams }: Props) {
  const [{ team, project: slug }, sp] = await Promise.all([params, searchParams]);
  const access = await requireProject(team, slug);
  const base = `/teams/${team}/projects/${access.project.slug}`;
  const tree = await getSuiteTree(access.project.id);
  const suite = parseCaseFilters(sp).suite;
  return (
    <LibraryActions
      base={base}
      projectRef={{ team, project: access.project.slug }}
      suites={flattenSuites(tree.roots)}
      canCreate={access.can({ testCase: ['create'] })}
      startAdopting={first(sp.adopt) === '1'}
      newCaseHref={`${base}/cases/new${suite && suite !== 'unassigned' ? `?suite=${suite}` : ''}`}
      exportHref={`${base}/cases/export${suite ? `?suite=${suite}` : ''}`}
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

async function Tree({ params, searchParams }: Props) {
  const [{ team, project: slug }, sp] = await Promise.all([params, searchParams]);
  const access = await requireProject(team, slug);
  const tree = await getSuiteTree(access.project.id);
  return (
    <SuiteSidebar
      base={`/teams/${team}/projects/${access.project.slug}`}
      projectRef={{ team, project: access.project.slug }}
      roots={tree.roots}
      total={tree.total}
      unassigned={tree.unassigned}
      selected={parseCaseFilters(sp).suite ?? null}
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
  return <UrlSelect param="tag" placeholder="Tag" allLabel="All tags" options={tags.map((t) => ({ value: t, label: t }))} className="min-w-28" />;
}

async function Results({ params, searchParams }: Props) {
  const [{ team, project: slug }, sp] = await Promise.all([params, searchParams]);
  const access = await requireProject(team, slug);
  const base = `/teams/${team}/projects/${access.project.slug}`;
  const filters = parseCaseFilters(sp);
  const now = await renderedAt();
  const [result, tree] = await Promise.all([listCases(access.project.id, filters, now), getSuiteTree(access.project.id)]);
  const canCreate = access.can({ testCase: ['create'] });

  if (result.rows.length === 0) {
    const filtered = Object.keys(sp).some((k) => k !== 'suite' && k !== 'adopt' && sp[k]);
    if (tree.total === 0) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="No test cases yet"
          description={
            canCreate
              ? 'Write a case by hand, or adopt the Playwright tests this project already runs: each becomes a case that is linked to it.'
              : 'Nobody has written a test case for this project yet.'
          }
        />
      );
    }
    return (
      <EmptyState
        icon={ClipboardList}
        title={filtered ? 'No test cases match' : 'This suite is empty'}
        description={filtered ? 'Try clearing a filter or searching for something else.' : 'Create a case here, or move cases into this suite from the list.'}
      />
    );
  }

  const inOneSuite = !!filters.suite;
  // Moving up and down is within one suite's own cases: a suite with sub-suites lists theirs too.
  const unfiltered = Object.keys(sp).every((k) => k === 'suite' || k === 'adopt' || !sp[k]);
  const leaf = filters.suite === 'unassigned' || !flattenSuites(tree.roots).some((s) => s.value !== filters.suite && isChildOf(tree.roots, s.value, filters.suite!));
  return (
    <>
      <CaseList
        base={base}
        projectRef={{ team, project: access.project.slug }}
        rows={result.rows}
        suites={flattenSuites(tree.roots)}
        canEdit={access.can({ testCase: ['update'] })}
        canDelete={access.can({ testCase: ['delete'] })}
        showSuite={!inOneSuite || filters.suite !== 'unassigned'}
        reorderable={inOneSuite && leaf && unfiltered && result.total === result.rows.length}
        sort={filters.sort}
        dir={filters.dir}
        now={now}
        caseQuery={listQuery(sp)}
      />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}

function isChildOf(roots: SuiteNode[], id: string, parentId: string): boolean {
  const walk = (nodes: SuiteNode[]): boolean => nodes.some((n) => (n.id === id ? n.parentId === parentId : walk(n.children)));
  return walk(roots);
}
