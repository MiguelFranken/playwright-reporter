import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Activity, Clock, FlaskConical, Gauge, ListChecks, PlayCircle, Repeat, TrendingUp } from 'lucide-react';
import { PullRequestHeader, PullRequestHeaderSkeleton } from '@miguelfranken/ui/views/pull-requests/pull-request-header';
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
import { ResultsBoundary } from '@/components/filters/results-boundary';
import { RangeToggle } from '@/components/filters/url-filters';
import { LiveRunsTable } from '@/components/live/live-runs';
import { LiveConnection, LiveStoreProvider } from '@/components/live/live-store';
import { requireProject } from '@/lib/auth/access';
import { getPullRequestOverview } from '@/lib/db/queries/pull-requests';
import { chronicFailures, dashboardStats, mostFlakyTests, passFailTrend } from '@/lib/db/queries/dashboard';
import { listRuns } from '@/lib/db/queries/runs';
import { parsePage, parseRange } from '@/lib/db/queries/shared';
import { reliabilityLabel } from '@/lib/metrics/score';
import { projectHrefs, toRunListItem } from '@/lib/view-models';

type Params = Promise<{ team: string; project: string; number: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = { params: Params; searchParams: SearchParams };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * One pull or merge request: the dashboard's figures narrowed to its runs, and
 * every run it has had — the branch page, keyed by the request instead. Like
 * the dashboard, nothing is awaited here — each region streams on its own, and
 * the header is the one that decides the request does not exist.
 */
export default function PullRequestPage({ params, searchParams }: Props) {
  return (
    <LiveStoreProvider>
      <Suspense fallback={null}>
        <PullRequestsLink params={params} searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<PullRequestHeaderSkeleton />}>
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
            <CardDescription>Tests in this request&apos;s runs that passed only after a retry.</CardDescription>
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
            <CardDescription>Tests failing 5+ times in a row in this request&apos;s runs, or in at least 70% of them.</CardDescription>
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
        {/* The list is every run, whatever the range: only its page reloads it. */}
        <ResultsBoundary
          searchParams={searchParams}
          omit={['range']}
          fallback={<TableRowsSkeleton rows={10} columns={[12, 34, 16, 20, 8, 10]} className="panel" />}
        >
          <Runs params={params} searchParams={searchParams} />
        </ResultsBoundary>
      </section>
    </LiveStoreProvider>
  );
}

/**
 * Resolves the route once per boundary; `requireProject` is request-cached.
 * A number that is not one (`/pull-requests/abc`) is a page that does not exist.
 */
async function scope({ params, searchParams }: Props) {
  const [{ team, project: projectSlug, number }, sp] = await Promise.all([params, searchParams]);
  if (!/^\d{1,9}$/.test(number)) notFound();
  const { project } = await requireProject(team, projectSlug);
  const range = first(sp.range);
  return { project, prNumber: Number(number), sp, range, days: parseRange(range), base: `/teams/${team}/projects/${project.slug}` };
}

async function PullRequestsLink(props: Props) {
  const { base, range } = await scope(props);
  return <BackLink href={`${base}/pull-requests${range ? `?range=${range}` : ''}`}>Pull requests</BackLink>;
}

async function Header(props: Props) {
  const { project, prNumber, base } = await scope(props);
  const overview = await getPullRequestOverview(project.id, prNumber);
  if (!overview) notFound();
  return (
    <PullRequestHeader pullRequest={overview} hrefs={projectHrefs(base)}>
      <RangeToggle />
    </PullRequestHeader>
  );
}

async function Stats(props: Props) {
  const { project, prNumber, days } = await scope(props);
  const stats = await dashboardStats(project.id, days, { prNumber });
  const rel = reliabilityLabel(stats.reliability);
  return (
    <>
      <MetricCard
        icon={ListChecks}
        label="Tests run"
        value={stats.trackedTests.toLocaleString()}
        subtext={stats.newTests > 0 ? `+${stats.newTests.toLocaleString()} new to this request in ${days} days` : `No new tests in the last ${days} days`}
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
        hint="Averaged per test over this request's runs in the range: 100 − failure rate × 100 − flaky rate × 50, clamped to 0–100."
      />
      <MetricCard icon={Clock} label="Avg run duration" value={formatDuration(stats.avgRunDurationMs)} subtext="Across passed and failed runs" />
    </>
  );
}

async function Trend(props: Props) {
  const { project, prNumber } = await scope(props);
  const trend = await passFailTrend(project.id, 30, { prNumber });
  if (trend.length === 0) {
    return <EmptyState icon={TrendingUp} title="No finished runs for this request yet" description="The trend appears once a run on it finishes." className="py-10" />;
  }
  return <PassFailChart data={trend.map((t) => ({ ...t, startedAt: t.startedAt.toISOString() }))} />;
}

async function Flaky(props: Props) {
  const { project, prNumber, days, base } = await scope(props);
  return <FlakyTestsList hrefs={projectHrefs(base)} rows={await mostFlakyTests(project.id, days, 10, { prNumber })} />;
}

async function Chronic(props: Props) {
  const { project, prNumber, days, base } = await scope(props);
  return <ChronicFailuresList hrefs={projectHrefs(base)} rows={await chronicFailures(project.id, days, 10, { prNumber })} />;
}

async function LiveBadge(props: Props) {
  const { base } = await scope(props);
  return <LiveConnection streamUrl={`/api${base}/live`} label="Live" mode="project" />;
}

/** Every run of the request, not just the range: this is where you go to find one. */
async function Runs(props: Props) {
  const { project, prNumber, base, sp } = await scope(props);
  const filters = { prNumber, page: parsePage(first(sp.page)) };
  const result = await listRuns(project.id, filters);
  if (result.rows.length === 0) {
    return <EmptyState icon={PlayCircle} title="No runs on this page" description="This request has fewer runs than the page you asked for." />;
  }
  return (
    <>
      <LiveRunsTable base={base} runs={result.rows.map(toRunListItem)} cursor={result.cursor} filters={filters} pageSize={result.pageSize} />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}
