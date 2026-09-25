import { Alert, AlertDescription, AlertTitle } from '../../components/alert';
import { Badge } from '../../components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { formatBytes, formatDateTime, formatRelative } from '../../lib/format';

export interface StoreScheduleProps {
  /** The storage driver's name, e.g. `local`, `vercel-blob` or `s3`. */
  driver: string;
  /** Who deletes expired objects: this app during a sweep, or the provider's own lifecycle rules. */
  retention: 'app' | 'provider';
  /** Deployed on Vercel, where Vercel Cron calls the sweep. */
  onVercel: boolean;
  /** `CRON_SECRET` is set; without it the endpoint refuses every call. */
  cronSecretSet: boolean;
  /** Hours between sweeps after finished runs, or `null` when that sweep is off. */
  ingestSweepHours: number | null;
  /** A `provider` store whose lifecycle rules this app writes when the policy is saved. */
  managesLifecycle?: boolean;
}

/** Admin → Storage: what deletes expired artifacts, and when. */
export function StoreSchedule({ driver, retention, onVercel, cronSecretSet, ingestSweepHours, managesLifecycle = false }: StoreScheduleProps) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-muted-foreground">Driver</dt>
        <dd>
          <Badge variant="secondary" className="font-mono">
            {driver}
          </Badge>
        </dd>
        <dt className="text-muted-foreground">Deletes expired objects</dt>
        <dd>{retention === 'app' ? 'This app, during a sweep' : 'The storage provider, by its own lifecycle rules'}</dd>
        <dt className="text-muted-foreground">Scheduled sweep</dt>
        <dd>
          {onVercel ? 'Vercel Cron, daily at 03:17 UTC (production only).' : 'Any scheduler calling the endpoint below.'}{' '}
          {cronSecretSet ? null : <span className="text-destructive">CRON_SECRET is not set, so the endpoint refuses every call.</span>}
        </dd>
        <dt className="text-muted-foreground">After a run finishes</dt>
        <dd>
          {ingestSweepHours !== null
            ? `Sweeps when none ran in the last ${ingestSweepHours} hours.`
            : 'Off (ARTIFACT_RETENTION_INGEST_SWEEP, or a Vercel preview).'}
        </dd>
      </dl>

      {retention === 'provider' ? (
        <Alert>
          <AlertTitle>The store expires objects itself</AlertTitle>
          <AlertDescription>
            {managesLifecycle
              ? 'Saving the policy writes it to the bucket as lifecycle rules, one per kind. '
              : 'Set the same lifetimes here as in the provider\u2019s lifecycle rules. '}
            A sweep then only marks artifacts as expired, so old runs say so instead of showing a broken link; it never deletes anything.
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

export interface StorageUsageRow {
  kind: string;
  liveCount: number;
  liveBytes: number;
  /** What the saved policy expires on the next sweep. */
  dueCount: number;
  dueBytes: number;
  expiredCount: number;
  expiredBytes: number;
}

/** Artifacts by kind, with a total row. */
export function StorageUsageTable({ rows }: { rows: StorageUsageRow[] }) {
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

export interface RetentionSweepRow {
  id: number;
  trigger: 'cron' | 'ingest' | 'manual' | 'force';
  startedAt: Date | string;
  /** `null` while it is still running. */
  finishedAt: Date | string | null;
  expiredCount: number;
  expiredBytes: number;
  /** Stopped at its time budget with expired artifacts left. */
  hasMore: boolean;
  error: string | null;
}

const TRIGGER_LABELS: Record<RetentionSweepRow['trigger'], string> = {
  cron: 'Scheduler',
  ingest: 'Run finished',
  manual: 'Run now',
  force: 'Force delete',
};

/** The most recent retention sweeps and what each one freed. */
export function RetentionSweepsTable({ sweeps, now }: { sweeps: RetentionSweepRow[]; now?: Date }) {
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
                {formatRelative(s.startedAt, { now })}
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
