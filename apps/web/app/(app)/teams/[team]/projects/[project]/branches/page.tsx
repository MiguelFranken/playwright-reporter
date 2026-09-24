import { Suspense } from 'react';
import { BranchesTable } from '@miguelfranken/ui/views/branches/branches-table';
import { RangeToggle, UrlSearch } from '@/components/filters/url-filters';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { requireProject } from '@/lib/auth/access';
import { branchList } from '@/lib/db/queries/branches';
import { parseRange } from '@/lib/db/queries/shared';
import { projectHrefs } from '@/lib/view-models';

type Params = Promise<{ team: string; project: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = { params: Params; searchParams: SearchParams };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default function BranchesPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader title="Branches" description="Every branch that reported a run in this range, most recently active first." />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <UrlSearch placeholder="Search branches" className="lg:min-w-72" />
        <RangeToggle />
      </div>

      <Suspense fallback={<TableRowsSkeleton rows={10} columns={[34, 12, 8, 10, 10, 16, 10]} className="panel" />}>
        <Results params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Results({ params, searchParams }: Props) {
  const [{ team, project: projectSlug }, sp] = await Promise.all([params, searchParams]);
  const { project } = await requireProject(team, projectSlug);
  const base = `/teams/${team}/projects/${project.slug}`;
  const q = first(sp.q);
  const rows = await branchList(project.id, parseRange(first(sp.range)), { q });
  return (
    <BranchesTable
      hrefs={projectHrefs(base)}
      rows={rows}
      emptyTitle={q ? 'No branches match this search' : 'No runs in this range'}
      emptyDescription={q ? 'Try a shorter search or a wider time range.' : 'Runs grouped by git branch will appear here.'}
    />
  );
}
