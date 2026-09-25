import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { TestOverview } from '@miguelfranken/ui/views/explorer/test-overview';
import { RangeToggle } from '@/components/filters/url-filters';
import { BackLink } from '@miguelfranken/ui/patterns/back-link';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ChartSkeleton, MetricCardsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { Badge } from '@miguelfranken/ui/components/badge';
import { requireProject } from '@/lib/auth/access';
import { projectHrefs } from '@/lib/view-models';
import { getTestOverview } from '@/lib/db/queries/explorer';
import { parseRange } from '@/lib/db/queries/shared';

type Params = Promise<{ team: string; project: string; testId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function TestPage(props: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<TestOverviewSkeleton />}>
      <TestContent {...props} />
    </Suspense>
  );
}

function TestOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCardsSkeleton />
      </div>
      <ChartSkeleton />
    </div>
  );
}

async function TestContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ team, project: projectSlug, testId }, sp] = await Promise.all([params, searchParams]);
  const { project } = await requireProject(team, projectSlug);
  const base = `/teams/${team}/projects/${project.slug}`;
  const days = parseRange(Array.isArray(sp.range) ? sp.range[0] : sp.range, 30);
  const overview = await getTestOverview(project.id, testId, days);
  if (!overview) notFound();

  const { test } = overview;
  const describe = test.titlePath.slice(0, -1).filter(Boolean);
  const rangeQs = sp.range ? `?range=${days}` : '';

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/tests${rangeQs}`}>Test Explorer</BackLink>
      <PageHeader
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 break-words">{test.title}</span>
            {test.pwProject ? (
              <Badge variant="outline" className="font-normal">
                {test.pwProject}
              </Badge>
            ) : null}
          </span>
        }
        description={
          <span className="flex flex-col gap-1">
            <span className="truncate text-code-s" title={test.file}>
              {test.file}
              {describe.length ? <span className="text-muted-foreground/70"> › {describe.join(' › ')}</span> : null}
            </span>
            {test.tags.length ? (
              <span className="flex flex-wrap gap-1">
                {test.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="h-4 px-1.5 text-label-xs">
                    {t}
                  </Badge>
                ))}
              </span>
            ) : null}
          </span>
        }
      >
        <RangeToggle />
      </PageHeader>

      <TestOverview
        hrefs={{ ...projectHrefs(base), sibling: (id: string) => `${base}/tests/${id}${rangeQs}` }}
        overview={overview}
        days={days}
        platform={test.pwProject}
      />
    </div>
  );
}
