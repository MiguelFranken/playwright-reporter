import { PullRequestsTable } from '@miguelfranken/ui/views/pull-requests/pull-requests-table';
import { Pagination } from '@/components/filters/pagination';
import { ResultsBoundary } from '@/components/filters/results-boundary';
import { RangeToggle, UrlSearch } from '@/components/filters/url-filters';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { requireProject } from '@/lib/auth/access';
import { pullRequestList } from '@/lib/db/queries/pull-requests';
import { parsePage, parseRange } from '@/lib/db/queries/shared';
import { projectHrefs } from '@/lib/view-models';

type Params = Promise<{ team: string; project: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = { params: Params; searchParams: SearchParams };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default function PullRequestsPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader
        title="Pull requests"
        description="Every pull or merge request that reported a run in this range, most recently active first."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <UrlSearch placeholder="Search title, branch or number" className="lg:min-w-72" />
        <RangeToggle />
      </div>

      <ResultsBoundary searchParams={searchParams} fallback={<TableRowsSkeleton rows={10} columns={[40, 12, 8, 10, 10, 14, 10]} className="panel" />}>
        <Results params={params} searchParams={searchParams} />
      </ResultsBoundary>
    </>
  );
}

async function Results({ params, searchParams }: Props) {
  const [{ team, project: projectSlug }, sp] = await Promise.all([params, searchParams]);
  const { project } = await requireProject(team, projectSlug);
  const base = `/teams/${team}/projects/${project.slug}`;
  const q = first(sp.q);
  const result = await pullRequestList(project.id, parseRange(first(sp.range)), { q, page: parsePage(first(sp.page)) });
  return (
    <>
      <PullRequestsTable
        hrefs={projectHrefs(base)}
        rows={result.rows}
        emptyTitle={q ? 'No pull requests match this search' : 'No pull requests in this range'}
        emptyDescription={
          q ? (
            'Try a shorter search or a wider time range.'
          ) : (
            <>
              Runs appear here once the reporter knows their pull or merge request: detected on GitHub Actions and GitLab CI, or set
              with <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-code-xs">PW_REPORTER_PR_NUMBER</code>.
            </>
          )
        }
      />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}
