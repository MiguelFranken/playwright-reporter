import { Suspense } from 'react';
import { RetentionPolicyForm, RunSweepButton } from '@/components/admin/retention-card';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ListRowsSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { Alert, AlertDescription, AlertTitle } from '@miguelfranken/ui/components/alert';
import { Badge } from '@miguelfranken/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@miguelfranken/ui/components/table';
import { requireSuperadmin } from '@/lib/auth/access';
import { getStorage } from '@/lib/storage';
import {
  ATTACHMENT_KINDS,
  INGEST_SWEEP_INTERVAL_MS,
  getRetentionPolicy,
  ingestSweepEnabled,
  listSweeps,
  retentionStats,
} from '@/lib/storage/retention';
import { formatBytes, formatDateTime, formatRelative } from '@miguelfranken/ui/lib/format';

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
        <CardContent className="overflow-x-auto px-0">
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
          <RunSweepButton />
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
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
      {source !== 'saved' ? (
        <p className="text-body-s text-muted-foreground">
          {source === 'environment'
            ? 'Not saved yet: this is the default from ARTIFACT_RETENTION_DAYS. Saving here takes precedence.'
            : 'Not saved yet: every artifact is kept until retention is turned on.'}
        </p>
      ) : updatedAt ? (
        <p className="text-body-s text-muted-foreground" title={formatDateTime(updatedAt)}>
          Last changed {formatRelative(updatedAt)}.
        </p>
      ) : null}
      <RetentionPolicyForm policy={policy} kinds={[...ATTACHMENT_KINDS]} />
    </div>
  );
}

async function StoreData() {
  await requireSuperadmin();
  const storage = getStorage();
  const cronSecret = Boolean(process.env.CRON_SECRET);
  const onVercel = Boolean(process.env.VERCEL);
  const ingest = ingestSweepEnabled();
  const hours = INGEST_SWEEP_INTERVAL_MS / 3_600_000;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-muted-foreground">Driver</dt>
        <dd>
          <Badge variant="secondary" className="font-mono">
            {storage.name}
          </Badge>
        </dd>
        <dt className="text-muted-foreground">Deletes expired objects</dt>
        <dd>{storage.retention === 'app' ? 'This app, during a sweep' : 'The storage provider, by its own lifecycle rules'}</dd>
        <dt className="text-muted-foreground">Scheduled sweep</dt>
        <dd>
          {onVercel ? 'Vercel Cron, daily at 03:17 UTC (production only).' : 'Any scheduler calling the endpoint below.'}{' '}
          {cronSecret ? null : <span className="text-destructive">CRON_SECRET is not set, so the endpoint refuses every call.</span>}
        </dd>
        <dt className="text-muted-foreground">After a run finishes</dt>
        <dd>{ingest ? `Sweeps when none ran in the last ${hours} hours.` : 'Off (ARTIFACT_RETENTION_INGEST_SWEEP, or a Vercel preview).'}</dd>
      </dl>

      {storage.retention === 'provider' ? (
        <Alert>
          <AlertTitle>The store expires objects itself</AlertTitle>
          <AlertDescription>
            Set the same lifetimes here as in the provider&apos;s lifecycle rules. A sweep then only marks artifacts as expired, so old runs say so
            instead of showing a broken link; it never deletes anything.
          </AlertDescription>
        </Alert>
      ) : null}

      {!onVercel ? (
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-code-xs">
          {'curl -fsS -H "Authorization: Bearer $CRON_SECRET" \\\n  https://<this-host>/api/cron/artifact-retention'}
        </pre>
      ) : null}
    </div>
  );
}

async function UsageData() {
  await requireSuperadmin();
  const { policy } = await getRetentionPolicy();
  const rows = await retentionStats(policy);
  const total = rows.reduce(
    (t, r) => ({
      liveCount: t.liveCount + r.liveCount,
      liveBytes: t.liveBytes + r.liveBytes,
      dueCount: t.dueCount + r.dueCount,
      dueBytes: t.dueBytes + r.dueBytes,
      expiredCount: t.expiredCount + r.expiredCount,
      expiredBytes: t.expiredBytes + r.expiredBytes,
    }),
    { liveCount: 0, liveBytes: 0, dueCount: 0, dueBytes: 0, expiredCount: 0, expiredBytes: 0 },
  );

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Kind</TableHead>
          <TableHead className="text-right">Stored</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead className="text-right">Due</TableHead>
          <TableHead className="text-right">Expired</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
              No artifacts uploaded yet.
            </TableCell>
          </TableRow>
        ) : (
          [...rows, { kind: 'Total', ...total }].map((r) => (
            <TableRow key={r.kind} className={r.kind === 'Total' ? 'font-medium' : undefined}>
              <TableCell className="capitalize">{r.kind}</TableCell>
              <TableCell className="text-right tabular-nums">{r.liveCount}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBytes(r.liveBytes)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.dueCount} <span className="text-muted-foreground">({formatBytes(r.dueBytes)})</span>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {r.expiredCount} ({formatBytes(r.expiredBytes)})
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

const TRIGGER_LABELS = { cron: 'Scheduler', ingest: 'Run finished', manual: 'Run now' } as const;

async function SweepsData() {
  await requireSuperadmin();
  const sweeps = await listSweeps(10);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Started</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead className="text-right">Expired</TableHead>
          <TableHead className="text-right">Freed</TableHead>
          <TableHead>Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sweeps.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
              No sweep has run yet.
            </TableCell>
          </TableRow>
        ) : (
          sweeps.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="text-muted-foreground tabular-nums" title={formatDateTime(s.startedAt)}>
                {formatRelative(s.startedAt)}
              </TableCell>
              <TableCell>{TRIGGER_LABELS[s.trigger]}</TableCell>
              <TableCell className="text-right tabular-nums">{s.expiredCount}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBytes(s.expiredBytes)}</TableCell>
              <TableCell className="max-w-sm truncate">
                {s.error ? (
                  <span className="text-destructive" title={s.error}>
                    Failed: {s.error}
                  </span>
                ) : !s.finishedAt ? (
                  <span className="text-muted-foreground">Running…</span>
                ) : s.hasMore ? (
                  <span className="text-muted-foreground">Time budget spent; the next sweep continues.</span>
                ) : (
                  <span className="text-muted-foreground">Done</span>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
