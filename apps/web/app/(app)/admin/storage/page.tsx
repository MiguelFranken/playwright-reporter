import { Suspense } from 'react';
import { ForceDeleteButton, RetentionPolicyForm, RunSweepButton } from '@/components/admin/retention-card';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ListRowsSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { RetentionPolicySource } from '@miguelfranken/ui/views/admin/retention-policy-form';
import { RetentionSweepsTable, StorageUsageTable, StoreSchedule } from '@miguelfranken/ui/views/admin/storage';
import { requireSuperadmin } from '@/lib/auth/access';
import { getStorage } from '@/lib/storage';
import {
  ATTACHMENT_KINDS,
  EVICT_CONFIRMATION,
  INGEST_SWEEP_INTERVAL_MS,
  getRetentionPolicy,
  ingestSweepEnabled,
  listSweeps,
  retentionStats,
} from '@/lib/storage/retention';

export default function AdminStoragePage() {
  return (
    <>
      <PageHeader title="Storage" description="Where test artifacts live, and how long screenshots, videos and traces are kept." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Retention policy</CardTitle>
            <CardDescription>
              Expired artifacts are deleted from the store. Their runs keep every result, error and step, and show the artifact as expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ListRowsSkeleton rows={4} />}>
              <PolicyData />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Store and schedule</CardTitle>
            <CardDescription>What deletes expired artifacts, and when.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ListRowsSkeleton rows={4} />}>
              <StoreData />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>Usage</CardTitle>
          <CardDescription>Artifacts by kind. “Due” is what the saved policy expires on the next sweep, counted even while retention is off.</CardDescription>
        </CardHeader>
        <CardContent flush className="overflow-x-auto">
          <Suspense fallback={<TableRowsSkeleton rows={6} columns={[20, 15, 15, 15, 15]} />}>
            <UsageData />
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
            <RunSweepButton />
            <ForceDeleteButton expected={EVICT_CONFIRMATION} />
          </div>
        </CardHeader>
        <CardContent flush className="overflow-x-auto">
          <Suspense fallback={<TableRowsSkeleton rows={4} columns={[20, 15, 15, 15, 25]} />}>
            <SweepsData />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function PolicyData() {
  await requireSuperadmin();
  const { policy, source, updatedAt } = await getRetentionPolicy();
  return (
    <div className="flex flex-col gap-4">
      <RetentionPolicySource source={source} updatedAt={updatedAt} />
      <RetentionPolicyForm policy={policy} kinds={[...ATTACHMENT_KINDS]} />
    </div>
  );
}

async function StoreData() {
  await requireSuperadmin();
  const storage = getStorage();
  return (
    <StoreSchedule
      driver={storage.name}
      retention={storage.retention}
      onVercel={Boolean(process.env.VERCEL)}
      cronSecretSet={Boolean(process.env.CRON_SECRET)}
      ingestSweepHours={ingestSweepEnabled() ? INGEST_SWEEP_INTERVAL_MS / 3_600_000 : null}
    />
  );
}

async function UsageData() {
  await requireSuperadmin();
  const { policy } = await getRetentionPolicy();
  return <StorageUsageTable rows={await retentionStats(policy)} />;
}

async function SweepsData() {
  await requireSuperadmin();
  return <RetentionSweepsTable sweeps={await listSweeps(10)} />;
}
