import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { StatGrid, type Stat } from '../../patterns/stat-grid';
import { formatBytes, formatDateTime, formatRelative } from '../../lib/format';

/**
 * Admin → Database: the panels and tables around the data retention policy.
 * The charts live in `database-charts.tsx` (client-only, Recharts); these
 * render on the server.
 */

export interface DataRetentionScheduleProps {
  /** Deployed on Vercel, where Vercel Cron calls the sweep. */
  onVercel: boolean;
  /** `CRON_SECRET` is set; without it the endpoint refuses every call. */
  cronSecretSet: boolean;
  /** Hours between sweeps after finished runs, or `null` when that sweep is off. */
  ingestSweepHours: number | null;
}

/** What deletes expired rows, and when. */
export function DataRetentionSchedule({ onVercel, cronSecretSet, ingestSweepHours }: DataRetentionScheduleProps) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-muted-foreground">Scheduled sweep</dt>
        <dd>
          {onVercel ? 'Vercel Cron, daily at 03:47 UTC (production only).' : 'Any scheduler calling the endpoint below.'}{' '}
          {cronSecretSet ? null : <span className="text-destructive">CRON_SECRET is not set, so the endpoint refuses every call.</span>}
        </dd>
        <dt className="text-muted-foreground">After a run finishes</dt>
        <dd>
          {ingestSweepHours !== null
            ? `Sweeps when none ran in the last ${ingestSweepHours} hours.`
            : 'Off (DATA_RETENTION_INGEST_SWEEP, or a Vercel preview).'}
        </dd>
        <dt className="text-muted-foreground">Freed space</dt>
        <dd className="text-muted-foreground">
          Postgres reuses the space of deleted rows for new ones; the database does not shrink on disk right away.
        </dd>
      </dl>

      {!onVercel ? (
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-code-xs">
          {'curl -fsS -H "Authorization: Bearer $CRON_SECRET" \\\n  https://<this-host>/api/cron/data-retention'}
        </pre>
      ) : null}
    </div>
  );
}

export interface DuePreviewValue {
  runs: number;
  results: number;
  /** Bytes of live artifacts that go with the due runs. */
  artifactBytes: number;
  events: number;
  /** `null` when the policy keeps the audit log forever. */
  audit: number | null;
  /** Expired sessions, tokens and invitations; `null` with housekeeping off. */
  expired: number | null;
}

/** What the saved policy deletes on the next sweep, shown even while it is off. */
export function DataRetentionDue({ due, enabled }: { due: DuePreviewValue; enabled: boolean }) {
  const n = (v: number) => v.toLocaleString('en-US');
  const stats: Stat[] = [
    { label: 'Runs', value: n(due.runs), tone: due.runs > 0 ? 'warning' : undefined },
    { label: 'Test results', value: n(due.results), hint: 'with their attempts, steps and logs' },
    { label: 'Artifacts', value: formatBytes(due.artifactBytes), hint: 'deleted from the store with their runs' },
    { label: 'Live events', value: n(due.events), hint: 'of finished runs' },
  ];
  if (due.audit !== null) stats.push({ label: 'Audit entries', value: n(due.audit) });
  if (due.expired !== null) stats.push({ label: 'Expired sign-ins', value: n(due.expired), hint: 'sessions, tokens, invitations' });

  return (
    <div className="flex flex-col gap-3">
      <StatGrid stats={stats} columns={3} />
      <p className="text-body-xs text-muted-foreground">
        {enabled
          ? 'Deleted on the next sweep.'
          : 'A preview: data retention is off, so nothing is deleted until it is turned on.'}
      </p>
    </div>
  );
}

export interface ProjectFootprintRow {
  projectId: string;
  projectName: string;
  teamName: string;
  runs: number;
  results: number;
  oldestRunAt: Date | string | null;
  /** Bytes of artifacts still in the store. */
  liveArtifactBytes: number;
  /** Results × the average bytes one result costs in the database. */
  estimatedBytes: number;
}

/** The projects holding the most rows. */
export function ProjectFootprintTable({ rows, now }: { rows: ProjectFootprintRow[]; now?: Date }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Project</TableHead>
          <TableHead className="text-right">Runs</TableHead>
          <TableHead className="text-right">Results</TableHead>
          <TableHead className="text-right">In the database</TableHead>
          <TableHead className="text-right">Artifacts</TableHead>
          <TableHead>Oldest run</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
              No projects yet.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => (
            <TableRow key={r.projectId}>
              <TableCell className="max-w-xs">
                <span className="block truncate font-medium" title={r.projectName}>
                  {r.projectName}
                </span>
                <span className="block truncate text-body-xs text-muted-foreground" title={r.teamName}>
                  {r.teamName}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.runs.toLocaleString('en-US')}</TableCell>
              <TableCell className="text-right tabular-nums">{r.results.toLocaleString('en-US')}</TableCell>
              <TableCell className="text-right tabular-nums">≈ {formatBytes(r.estimatedBytes)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{formatBytes(r.liveArtifactBytes)}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums" title={r.oldestRunAt ? formatDateTime(r.oldestRunAt) : undefined}>
                {r.oldestRunAt ? formatRelative(r.oldestRunAt, { now }) : '–'}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export interface DataSweepCountsValue {
  runs: number;
  results: number;
  attempts: number;
  attachments: number;
  events: number;
  tests: number;
  audit: number;
  auth: number;
  sweepLogs: number;
}

export interface DataSweepRow {
  id: number;
  trigger: 'cron' | 'ingest' | 'manual' | 'force';
  startedAt: Date | string;
  /** `null` while it is still running. */
  finishedAt: Date | string | null;
  /** Rows deleted by category. A sweep logged before a category existed lacks it. */
  deleted: Partial<DataSweepCountsValue>;
  artifactBytes: number;
  /** Stopped at its time budget with work left. */
  hasMore: boolean;
  error: string | null;
}

const TRIGGER_LABELS: Record<DataSweepRow['trigger'], string> = {
  cron: 'Scheduler',
  ingest: 'Run finished',
  manual: 'Run now',
  force: 'Purge history',
};

/** Everything a sweep deleted besides runs and results, in one number. */
function otherRows(d: Partial<DataSweepCountsValue>) {
  return (d.events ?? 0) + (d.tests ?? 0) + (d.audit ?? 0) + (d.auth ?? 0) + (d.sweepLogs ?? 0);
}

/** The most recent data sweeps and what each one deleted. */
export function DataSweepsTable({ sweeps, now }: { sweeps: DataSweepRow[]; now?: Date }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Started</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead className="text-right">Runs</TableHead>
          <TableHead className="text-right">Results</TableHead>
          <TableHead className="text-right">Other rows</TableHead>
          <TableHead className="text-right">Artifacts</TableHead>
          <TableHead>Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sweeps.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
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
              <TableCell className="text-right tabular-nums">{(s.deleted.runs ?? 0).toLocaleString('en-US')}</TableCell>
              <TableCell className="text-right tabular-nums">{(s.deleted.results ?? 0).toLocaleString('en-US')}</TableCell>
              <TableCell
                className="text-right tabular-nums text-muted-foreground"
                title={`${s.deleted.events ?? 0} events, ${s.deleted.tests ?? 0} tests, ${s.deleted.audit ?? 0} audit entries, ${s.deleted.auth ?? 0} expired sign-ins, ${s.deleted.sweepLogs ?? 0} sweep logs`}
              >
                {otherRows(s.deleted).toLocaleString('en-US')}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatBytes(s.artifactBytes)}</TableCell>
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
