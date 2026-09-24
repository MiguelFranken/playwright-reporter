import { FlaskConical } from 'lucide-react';
import { Suspense } from 'react';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { UrlExplorer } from '@/components/explorer/url-explorer';
import { Pagination } from '@/components/filters/pagination';
import { RangeToggle, UrlSearch, UrlSelect } from '@/components/filters/url-filters';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { FilterSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { requireProject } from '@/lib/auth/access';
import { EXPLORER_SORTS, exploreTests, type ExplorerSort } from '@/lib/db/queries/explorer';
import { listEnvironments, listPlatforms, listTestTags } from '@/lib/db/queries/runs';
import { parsePage, parseRange } from '@/lib/db/queries/shared';

type SearchParams = Record<string, string | string[] | undefined>;
type Params = Promise<{ team: string; project: string }>;
type Props = { params: Params; searchParams: Promise<SearchParams> };

const STATUS_OPTIONS = [
  { value: 'flaky', label: 'Flaky' },
  { value: 'chronic', label: 'Chronic failures' },
  { value: 'stable', label: 'Stable' },
  { value: 'passed', label: 'Last passed' },
  { value: 'failed', label: 'Last failed' },
  { value: 'skipped', label: 'Last skipped' },
];

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function list(v: string | string[] | undefined) {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

/**
 * The heading, the search field and the range toggle are static. The three
 * selects wait only on their option lists, and the table only on the query —
 * so the page is usable before either arrives.
 */
export default function TestsPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader title="Test Explorer" description="Every test case this project has recorded, with its recent history.">
        <RangeToggle />
      </PageHeader>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <UrlSearch placeholder="Search title or file (regex ok)" className="xl:min-w-72" />
        <div className="flex flex-wrap items-center gap-2">
          <UrlSelect param="status" placeholder="Status" allLabel="All statuses" options={STATUS_OPTIONS} />
          <Suspense fallback={<FilterSkeleton widths={[150, 170, 130]} />}>
            <Facets params={params} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<TableRowsSkeleton rows={10} columns={[34, 12, 14, 10, 10, 10]} className="panel" />}>
        <Results params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Facets({ params }: { params: Params }) {
  const { team, project: projectSlug } = await params;
  const { project } = await requireProject(team, projectSlug);
  const [platforms, environments, allTags] = await Promise.all([
    listPlatforms(project.id),
    listEnvironments(project.id),
    listTestTags(project.id),
  ]);
  return (
    <>
      <UrlSelect param="platform" placeholder="Platform" allLabel="All platforms" options={platforms.map((p) => ({ value: p, label: p }))} />
      <UrlSelect param="env" placeholder="Environment" allLabel="All environments" options={environments.map((e) => ({ value: e, label: e }))} />
      <UrlSelect param="tags" placeholder="Tag" allLabel="All tags" options={allTags.map((t) => ({ value: t, label: t }))} />
    </>
  );
}

async function Results({ params, searchParams }: Props) {
  const [{ team, project: projectSlug }, sp] = await Promise.all([params, searchParams]);
  const { project } = await requireProject(team, projectSlug);
  const base = `/teams/${team}/projects/${project.slug}`;

  const days = parseRange(first(sp.range), 30);
  const sortParam = first(sp.sort);
  const sort: ExplorerSort = (EXPLORER_SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as ExplorerSort) : 'lastRun';
  const dir: 'asc' | 'desc' = first(sp.dir) === 'asc' ? 'asc' : 'desc';
  const tags = list(sp.tags);
  const testId = first(sp.test);

  // The selected test is not part of this query: the drawer fetches its own
  // overview from the client, so selecting a row never re-runs the table.
  const result = await exploreTests(project.id, {
    q: first(sp.q) || undefined,
    days,
    tags: tags.length ? tags : undefined,
    platform: first(sp.platform) || undefined,
    environment: first(sp.env) || undefined,
    status: first(sp.status) || undefined,
    sort,
    dir,
    page: parsePage(first(sp.page)),
  });

  if (result.rows.length === 0) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="No tests match"
        description={`No test cases ran in the last ${days} days with the current filters. Try widening the range or clearing filters.`}
      />
    );
  }

  return (
    <>
      <UrlExplorer
        base={base}
        apiBase={`/api/teams/${team}/projects/${project.slug}`}
        rows={result.rows}
        sort={sort}
        dir={dir}
        days={days}
        initialTestId={testId}
      />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}
