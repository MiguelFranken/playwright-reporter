import { PlayCircle } from 'lucide-react';
import { Suspense } from 'react';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { Pagination } from '@/components/filters/pagination';
import { RangeToggle, UrlSearch, UrlSelect } from '@/components/filters/url-filters';
import { LiveActiveRuns, LiveRunsTable } from '@/components/live/live-runs';
import { LiveConnection, LiveStoreProvider } from '@/components/live/live-store';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { FilterSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { requireProject } from '@/lib/auth/access';
import { listActiveRunsWithCursor, listBranches, listEnvironments, listRuns } from '@/lib/db/queries/runs';
import { parsePage, parseRange } from '@/lib/db/queries/shared';
import { toRunListItem } from '@/lib/view-models';

type Params = Promise<{ team: string; project: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = { params: Params; searchParams: SearchParams };

const STATUS_OPTIONS = [
  { value: 'running', label: 'Running' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'timedout', label: 'Timed out' },
  { value: 'interrupted', label: 'Interrupted' },
  { value: 'incomplete', label: 'Abandoned' },
];

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default function RunsPage({ params, searchParams }: Props) {
  return (
    <LiveStoreProvider>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            Test Runs
            <Suspense fallback={null}>
              <LiveBadge params={params} />
            </Suspense>
          </span>
        }
        description="Every report this project has received, newest first."
      />

      <Suspense fallback={null}>
        <Active params={params} />
      </Suspense>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <UrlSearch placeholder="Search commit, branch or #number" className="lg:min-w-72" />
        <div className="flex flex-wrap items-center gap-2">
          <UrlSelect param="status" placeholder="Status" allLabel="All statuses" options={STATUS_OPTIONS} />
          <Suspense fallback={<FilterSkeleton widths={[150, 170]} />}>
            <Facets params={params} />
          </Suspense>
          <RangeToggle param="range" options={[7, 30, 90]} allowAll />
        </div>
      </div>

      <Suspense fallback={<TableRowsSkeleton rows={10} columns={[12, 34, 16, 20, 8, 10]} className="panel" />}>
        <Results params={params} searchParams={searchParams} />
      </Suspense>
    </LiveStoreProvider>
  );
}

async function LiveBadge({ params }: { params: Params }) {
  const { team, project: projectSlug } = await params;
  const { project } = await requireProject(team, projectSlug);
  return <LiveConnection streamUrl={`/api/teams/${team}/projects/${project.slug}/live`} label="Live" mode="project" />;
}

async function Facets({ params }: { params: Params }) {
  const { team, project: projectSlug } = await params;
  const { project } = await requireProject(team, projectSlug);
  const [branches, environments] = await Promise.all([listBranches(project.id), listEnvironments(project.id)]);
  return (
    <>
      <UrlSelect param="branch" placeholder="Branch" allLabel="All branches" options={branches.map((b) => ({ value: b, label: b }))} />
      <UrlSelect param="env" placeholder="Environment" allLabel="All environments" options={environments.map((e) => ({ value: e, label: e }))} />
    </>
  );
}

async function Active({ params }: { params: Params }) {
  const { team, project: projectSlug } = await params;
  const { project } = await requireProject(team, projectSlug);
  const { runs, cursor } = await listActiveRunsWithCursor(project.id);
  return <LiveActiveRuns base={`/teams/${team}/projects/${project.slug}`} runs={runs.map(toRunListItem)} cursor={cursor} />;
}

async function Results({ params, searchParams }: Props) {
  const [{ team, project: projectSlug }, sp] = await Promise.all([params, searchParams]);
  const { project } = await requireProject(team, projectSlug);
  const base = `/teams/${team}/projects/${project.slug}`;

  const range = first(sp.range);
  const filters = {
    status: first(sp.status),
    branch: first(sp.branch),
    environment: first(sp.env),
    q: first(sp.q),
    days: range ? parseRange(range) : undefined,
    page: parsePage(first(sp.page)),
  };
  const hasFilters = Boolean(filters.status || filters.branch || filters.environment || filters.q || range);
  const result = await listRuns(project.id, filters);

  if (result.rows.length === 0) {
    return (
      <EmptyState
        icon={PlayCircle}
        title={hasFilters ? 'No runs match these filters' : 'No test runs yet'}
        description={
          hasFilters ? (
            'Try widening the time range or clearing the search and filters.'
          ) : (
            <>
              Run <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-code-xs">pnpm --filter playwright-demo test:e2e</code> to record
              your first run.
            </>
          )
        }
      />
    );
  }

  return (
    <>
      <LiveRunsTable base={base} runs={result.rows.map(toRunListItem)} cursor={result.cursor} filters={filters} pageSize={result.pageSize} />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}
