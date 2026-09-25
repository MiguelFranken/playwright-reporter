import Link from 'next/link';
import { Activity, ArrowRight, Clock, FlaskConical, Gauge, GitBranch, ListChecks, Repeat, TrendingUp } from 'lucide-react';
import { Suspense } from 'react';
import { BranchSummaryTable } from '@miguelfranken/ui/views/dashboard/branch-summary-table';
import { MetricCard, toneClass } from '@miguelfranken/ui/patterns/metric-card';
import { PassFailChart } from '@miguelfranken/ui/views/dashboard/pass-fail-chart';
import { ChronicFailuresList, FlakyTestsList } from '@miguelfranken/ui/views/dashboard/test-health-lists';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { RangeToggle } from '@/components/filters/url-filters';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ChartSkeleton, ListRowsSkeleton, MetricCardsSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { Button } from '@miguelfranken/ui/components/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { requireProject } from '@/lib/auth/access';
import { projectHrefs } from '@/lib/view-models';
import { branchSummary, chronicFailures, dashboardStats, mostFlakyTests, passFailTrend } from '@/lib/db/queries/dashboard';
import { parseRange } from '@/lib/db/queries/shared';
import { formatDuration, formatPercent } from '@miguelfranken/ui/lib/format';
import { reliabilityLabel } from '@/lib/metrics/score';
import { cn } from '@miguelfranken/ui/lib/cn';

type Params = Promise<{ team: string; project: string }>;
type SearchParams = Promise<{ range?: string }>;
type Props = { params: Params; searchParams: SearchParams };

/**
 * Nothing is awaited at this level, so every heading, card frame and the range
 * toggle belong to the static shell and paint immediately. Each data region
 * below is its own streaming boundary and resolves independently.
 */
export default function DashboardPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader title="Dashboard" description="Test health across this project's recent runs.">
        <RangeToggle />
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<MetricCardsSkeleton />}>
          <Stats params={params} searchParams={searchParams} />
        </Suspense>
      </section>

      {/* No card header: the chart frame states its own measure, movement and
          window, and a title above it would only say the same thing twice. */}
      <Card>
        <CardContent>
          <Suspense fallback={<ChartSkeleton />}>
            <Trend params={params} />
          </Suspense>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 gap-0 py-0">
          <CardHeader className="border-b py-5">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              Branch summary
            </CardTitle>
            <CardDescription>Most recently active branches in this range.</CardDescription>
            <CardAction>
              <Suspense fallback={null}>
                <AllBranchesLink params={params} searchParams={searchParams} />
              </Suspense>
            </CardAction>
          </CardHeader>
          <CardContent flush className="py-0">
            <Suspense fallback={<TableRowsSkeleton rows={5} columns={[40, 12, 24, 14]} />}>
              <Branches params={params} searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="min-w-0 gap-0 py-0">
          <CardHeader className="border-b py-5">
            <CardTitle className="flex items-center gap-2">
              <Repeat className="size-4 text-muted-foreground" />
              Most flaky tests
            </CardTitle>
            <CardDescription>Tests that passed only after a retry, ranked by flaky rate.</CardDescription>
          </CardHeader>
          <CardContent flush className="py-0">
            <Suspense fallback={<ListRowsSkeleton />}>
              <Flaky params={params} searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </section>

      <Card className="min-w-0 gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-muted-foreground" />
            Chronic failures
          </CardTitle>
          <CardDescription>Tests failing 5+ times in a row, or in at least 70% of their runs.</CardDescription>
        </CardHeader>
        <CardContent flush className="py-0">
          <Suspense fallback={<ListRowsSkeleton />}>
            <Chronic params={params} searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

/** Resolves `params`/`searchParams` once per boundary; `requireProject` is request-cached. */
async function scope({ params, searchParams }: Props) {
  const [{ team, project: projectSlug }, sp] = await Promise.all([params, searchParams]);
  const { project } = await requireProject(team, projectSlug);
  return { project, days: parseRange(sp.range), base: `/teams/${team}/projects/${project.slug}` };
}

async function Stats(props: Props) {
  const { project, days } = await scope(props);
  const stats = await dashboardStats(project.id, days);
  const rel = reliabilityLabel(stats.reliability);
  return (
    <>
      <MetricCard
        icon={ListChecks}
        label="Tracked tests"
        value={stats.trackedTests.toLocaleString()}
        subtext={stats.newTests > 0 ? `+${stats.newTests.toLocaleString()} new in the last ${days} days` : 'No new tests in this range'}
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
        hint="Averaged per test over the range: 100 − failure rate × 100 − flaky rate × 50, clamped to 0–100."
      />
      <MetricCard icon={Clock} label="Avg run duration" value={formatDuration(stats.avgRunDurationMs)} subtext="Across passed and failed runs" />
    </>
  );
}

async function Trend({ params }: { params: Params }) {
  const { team, project: projectSlug } = await params;
  const { project } = await requireProject(team, projectSlug);
  const trend = await passFailTrend(project.id, 30);
  if (trend.length === 0) {
    return <EmptyState icon={TrendingUp} title="No finished runs yet" description="Upload a Playwright report to see the trend." className="py-10" />;
  }
  return <PassFailChart data={trend.map((t) => ({ ...t, startedAt: t.startedAt.toISOString() }))} />;
}

async function Branches(props: Props) {
  const { project, days, base } = await scope(props);
  return <BranchSummaryTable hrefs={projectHrefs(base)} rows={await branchSummary(project.id, days)} />;
}

async function AllBranchesLink(props: Props) {
  const [{ base }, sp] = await Promise.all([scope(props), props.searchParams]);
  return (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`${base}/branches${sp.range ? `?range=${sp.range}` : ''}`} />}>
      All branches
      <ArrowRight data-icon="inline-end" />
    </Button>
  );
}

async function Flaky(props: Props) {
  const { project, days, base } = await scope(props);
  return <FlakyTestsList hrefs={projectHrefs(base)} rows={await mostFlakyTests(project.id, days, 10)} />;
}

async function Chronic(props: Props) {
  const { project, days, base } = await scope(props);
  return <ChronicFailuresList hrefs={projectHrefs(base)} rows={await chronicFailures(project.id, days, 10)} />;
}
