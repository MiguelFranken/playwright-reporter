import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Activity, Clock, FlaskConical, Gauge, ListChecks, PlayCircle, Repeat, TrendingUp } from 'lucide-react';
import { BranchHeader, BranchHeaderSkeleton } from '@miguelfranken/ui/views/branches/branch-header';
import { MetricCard, toneClass } from '@miguelfranken/ui/patterns/metric-card';
import { PassFailChart } from '@miguelfranken/ui/views/dashboard/pass-fail-chart';
import { ChronicFailuresList, FlakyTestsList } from '@miguelfranken/ui/views/dashboard/test-health-lists';
import { BackLink } from '@miguelfranken/ui/patterns/back-link';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { ChartSkeleton, ListRowsSkeleton, MetricCardsSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { formatDuration, formatPercent } from '@miguelfranken/ui/lib/format';
import { cn } from '@miguelfranken/ui/lib/cn';
import { Pagination } from '@/components/filters/pagination';
import { RangeToggle } from '@/components/filters/url-filters';
import { LiveRunsTable } from '@/components/live/live-runs';
import { LiveConnection, LiveStoreProvider } from '@/components/live/live-store';
import { requireProject } from '@/lib/auth/access';
import { getBranchOverview } from '@/lib/db/queries/branches';
import { chronicFailures, dashboardStats, mostFlakyTests, passFailTrend } from '@/lib/db/queries/dashboard';
import { listRuns } from '@/lib/db/queries/runs';
import { parsePage, parseRange } from '@/lib/db/queries/shared';
import { reliabilityLabel } from '@/lib/metrics/score';
import { projectHrefs, toRunListItem } from '@/lib/view-models';

type Params = Promise<{ team: string; project: string; branch: string[] }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = { params: Params; searchParams: SearchParams };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * One branch: the dashboard's figures narrowed to it, and every run it has
 * had. Like the dashboard, nothing is awaited here — each region streams on
 * its own, and the header is the one that decides the branch does not exist.
 */
export default function BranchPage({ params, searchParams }: Props) {
  return (
    <LiveStoreProvider>
      <Suspense fallback={null}>
        <BranchesLink params={params} searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<BranchHeaderSkeleton />}>
        <Header params={params} searchParams={searchParams} />
      </Suspense>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<MetricCardsSkeleton />}>
          <Stats params={params} searchParams={searchParams} />
        </Suspense>
      </section>

      <Card>
        <CardContent>
          <Suspense fallback={<ChartSkeleton />}>
            <Trend params={params} searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 gap-0 py-0">
          <CardHeader className="border-b py-5">
            <CardTitle className="flex items-center gap-2">
              <Repeat className="size-4 text-muted-foreground" />
              Most flaky tests
            </CardTitle>
            <CardDescription>Tests on this branch that passed only after a retry.</CardDescription>
          </CardHeader>
          <CardContent flush className="py-0">
            <Suspense fallback={<ListRowsSkeleton />}>
              <Flaky params={params} searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="min-w-0 gap-0 py-0">
          <CardHeader className="border-b py-5">
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-muted-foreground" />
              Chronic failures
            </CardTitle>
            <CardDescription>Tests failing 5+ times in a row on this branch, or in at least 70% of its runs.</CardDescription>
          </CardHeader>
          <CardContent flush className="py-0">
            <Suspense fallback={<ListRowsSkeleton />}>
              <Chronic params={params} searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-headline-s">Runs</h2>
          <Suspense fallback={null}>
            <LiveBadge params={params} searchParams={searchParams} />
          </Suspense>
        </div>
        <Suspense fallback={<TableRowsSkeleton rows={10} columns={[12, 34, 16, 20, 8, 10]} className="panel" />}>
          <Runs params={params} searchParams={searchParams} />
        </Suspense>
      </section>
    </LiveStoreProvider>
  );
}

/**
 * Resolves the route once per boundary; `requireProject` is request-cached.
 * The catch-all hands the branch back in its path segments (`feature/x` is
 * two), already decoded, so joining them restores the name.
 */
async function scope({ params, searchParams }: Props) {
  const [{ team, project: projectSlug, branch: segments }, sp] = await Promise.all([params, searchParams]);
  const { project } = await requireProject(team, projectSlug);
  const range = first(sp.range);
  return { project, branch: segments.join('/'), sp, range, days: parseRange(range), base: `/teams/${team}/projects/${project.slug}` };
}

async function BranchesLink(props: Props) {
  const { base, range } = await scope(props);
  return <BackLink href={`${base}/branches${range ? `?range=${range}` : ''}`}>Branches</BackLink>;
}

async function Header(props: Props) {
  const { project, branch, base } = await scope(props);
  const overview = await getBranchOverview(project.id, branch);
  if (!overview) notFound();
  return (
    <BranchHeader branch={overview} hrefs={projectHrefs(base)}>
      <RangeToggle />
    </BranchHeader>
  );
}

async function Stats(props: Props) {
  const { project, branch, days } = await scope(props);
  const stats = await dashboardStats(project.id, days, { branch });
  const rel = reliabilityLabel(stats.reliability);
  return (
    <>
      <MetricCard
        icon={ListChecks}
        label="Tests run"
        value={stats.trackedTests.toLocaleString()}
        subtext={stats.newTests > 0 ? `+${stats.newTests.toLocaleString()} new to this branch in ${days} days` : `No new tests in the last ${days} days`}
      />
      <MetricCard
        icon={Activity}
        label="Run pass rate"
        value={formatPercent(stats.runPassRate)}
        subtext={stats.finishedRuns > 0 ? `${stats.passedRuns} of ${stats.finishedRuns} runs passed` : 'No finished runs'}
      />
      <MetricCard
        icon={Gauge}
        label="Reliability score"
        value={stats.reliability === null ? '–' : stats.reliability}
        badge={<span className={cn('text-label-m', toneClass[rel.tone])}>{rel.label}</span>}
        subtext="Provisional: 100 − failure% − flaky%/2"
        hint="Averaged per test over this branch's runs in the range: 100 − failure rate × 100 − flaky rate × 50, clamped to 0–100."
      />
      <MetricCard icon={Clock} label="Avg run duration" value={formatDuration(stats.avgRunDurationMs)} subtext="Across passed and failed runs" />
    </>
  );
}

async function Trend(props: Props) {
  const { project, branch } = await scope(props);
  const trend = await passFailTrend(project.id, 30, { branch });
  if (trend.length === 0) {
    return <EmptyState icon={TrendingUp} title="No finished runs on this branch yet" description="The trend appears once a run on it finishes." className="py-10" />;
  }
  return <PassFailChart data={trend.map((t) => ({ ...t, startedAt: t.startedAt.toISOString() }))} />;
}

async function Flaky(props: Props) {
  const { project, branch, days, base } = await scope(props);
  return <FlakyTestsList hrefs={projectHrefs(base)} rows={await mostFlakyTests(project.id, days, 10, { branch })} />;
}

async function Chronic(props: Props) {
  const { project, branch, days, base } = await scope(props);
  return <ChronicFailuresList hrefs={projectHrefs(base)} rows={await chronicFailures(project.id, days, 10, { branch })} />;
}

async function LiveBadge(props: Props) {
  const { base } = await scope(props);
  return <LiveConnection streamUrl={`/api${base}/live`} label="Live" mode="project" />;
}

/** Every run on the branch, not just the range: this is where you go to find one. */
async function Runs(props: Props) {
  const { project, branch, base, sp } = await scope(props);
  const filters = { branch, page: parsePage(first(sp.page)) };
  const result = await listRuns(project.id, filters);
  if (result.rows.length === 0) {
    return <EmptyState icon={PlayCircle} title="No runs on this page" description="This branch has fewer runs than the page you asked for." />;
  }
  return (
    <>
      <LiveRunsTable base={base} runs={result.rows.map(toRunListItem)} cursor={result.cursor} filters={filters} pageSize={result.pageSize} />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}
