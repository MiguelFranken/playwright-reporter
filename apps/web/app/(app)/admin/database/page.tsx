import { cache, Suspense } from 'react';
import { DataRetentionPolicyForm, PurgeRunHistoryButton, RunDataSweepButton } from '@/components/admin/data-retention-card';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ListRowsSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { DataRetentionPolicySource } from '@miguelfranken/ui/views/admin/data-retention-policy-form';
import { DataRetentionDue, DataRetentionSchedule, DataSweepsTable, ProjectFootprintTable } from '@miguelfranken/ui/views/admin/database';
import { DatabaseIngestChart, DatabaseSizeChart } from '@miguelfranken/ui/views/admin/database-charts';
import { requireSuperadmin } from '@/lib/auth/access';
import {
  INGEST_SWEEP_INTERVAL_MS,
  PURGE_CONFIRMATION,
  getDataRetentionPolicy,
  ingestSweepEnabled,
  listDataSweeps,
} from '@/lib/data-retention';
import { RUN_HISTORY_TABLES, databaseSize, duePreview, historyTotals, ingestByDay, projectFootprints } from '@/lib/data-retention/stats';
import { getRetentionPolicy } from '@/lib/storage/retention';

// One read per request, shared by the cards that stream in separately.
const loadSize = cache(databaseSize);
const loadIngest = cache(() => ingestByDay(365));
const loadTotals = cache(async () => historyTotals(await loadSize()));

export default function AdminDatabasePage() {
  return (
    <>
      <PageHeader title="Database" description="How much run history the database holds, how fast it grows, and how long it is kept." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <SizeData />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <IngestData />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Retention policy</CardTitle>
            <CardDescription>
              Separate from the artifact policy under Storage. Deleting a run deletes everything recorded for it: results, attempts, steps, logs
              and artifacts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ListRowsSkeleton rows={5} />}>
              <PolicyData />
            </Suspense>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Due</CardTitle>
              <CardDescription>What the saved policy deletes on the next sweep, counted even while data retention is off.</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<ListRowsSkeleton rows={2} />}>
                <DueData />
              </Suspense>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>What deletes expired rows, and when.</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<ListRowsSkeleton rows={3} />}>
                <ScheduleData />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>Projects</CardTitle>
          <CardDescription>The ten projects holding the most test results. “In the database” is estimated from the average cost of a result.</CardDescription>
        </CardHeader>
        <CardContent flush className="overflow-x-auto">
          <Suspense fallback={<TableRowsSkeleton rows={4} columns={[30, 12, 12, 16, 14, 16]} />}>
            <ProjectsData />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b py-5">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Recent sweeps</CardTitle>
            <CardDescription>The last ten, from the scheduler, finished runs, or this page.</CardDescription>
          </div>
          <div className="flex gap-2">
            <RunDataSweepButton />
            <PurgeRunHistoryButton expected={PURGE_CONFIRMATION} />
          </div>
        </CardHeader>
        <CardContent flush className="overflow-x-auto">
          <Suspense fallback={<TableRowsSkeleton rows={4} columns={[16, 14, 10, 12, 12, 12, 24]} />}>
            <SweepsData />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function SizeData() {
  await requireSuperadmin();
  const [size, totals, days] = await Promise.all([loadSize(), loadTotals(), loadIngest()]);
  const history = size.tables.filter((t) => (RUN_HISTORY_TABLES as readonly string[]).includes(t.name)).reduce((sum, t) => sum + t.totalBytes, 0);
  return (
    <DatabaseSizeChart
      totalBytes={size.totalBytes}
      historyBytes={history}
      tables={size.tables}
      bytesPerResult={totals.bytesPerResult}
      resultsLast30Days={days.slice(-30).reduce((sum, d) => sum + d.results, 0)}
    />
  );
}

async function IngestData() {
  await requireSuperadmin();
  return <DatabaseIngestChart data={await loadIngest()} />;
}

async function PolicyData() {
  await requireSuperadmin();
  const [{ policy, source, updatedAt }, artifacts] = await Promise.all([getDataRetentionPolicy(), getRetentionPolicy()]);
  // The longest an artifact lives under the storage policy, or null when they are kept forever.
  const artifactDays = artifacts.policy.enabled ? Math.max(artifacts.policy.days, ...Object.values(artifacts.policy.overrides)) : null;
  return (
    <div className="flex flex-col gap-4">
      <DataRetentionPolicySource source={source} updatedAt={updatedAt} />
      <DataRetentionPolicyForm policy={policy} artifactDays={artifactDays} />
    </div>
  );
}

async function DueData() {
  await requireSuperadmin();
  const { policy } = await getDataRetentionPolicy();
  return <DataRetentionDue due={await duePreview(policy)} enabled={policy.enabled} />;
}

async function ScheduleData() {
  await requireSuperadmin();
  return (
    <DataRetentionSchedule
      onVercel={Boolean(process.env.VERCEL)}
      cronSecretSet={Boolean(process.env.CRON_SECRET)}
      ingestSweepHours={ingestSweepEnabled() ? INGEST_SWEEP_INTERVAL_MS / 3_600_000 : null}
    />
  );
}

async function ProjectsData() {
  await requireSuperadmin();
  const [rows, totals] = await Promise.all([projectFootprints(10), loadTotals()]);
  return <ProjectFootprintTable rows={rows.map((r) => ({ ...r, estimatedBytes: r.results * totals.bytesPerResult }))} />;
}

async function SweepsData() {
  await requireSuperadmin();
  return <DataSweepsTable sweeps={await listDataSweeps(10)} />;
}
