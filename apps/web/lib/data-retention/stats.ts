/**
 * How full the database is, and how fast it fills: what Admin → Database
 * charts. Sizes come from Postgres' own catalogue, counts of what was ingested
 * from the rows themselves, and "due" is what the saved policy would delete
 * on the next sweep — counted even while the policy is off, as a preview.
 */
import { and, count, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  attachments,
  auditLogs,
  oauthCodes,
  oauthTokens,
  projects,
  runEvents,
  runs,
  sessions,
  teamInvitations,
  teams,
  testResults,
  verifications,
} from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { EXPIRED_GRACE_DAYS } from './config';
import { runsDueWhere } from './index';
import { cutoffs, fillDays, type DataRetentionPolicy, type IngestDay } from './policy';

/** The tables one run writes to: what "run history" costs on disk. */
export const RUN_HISTORY_TABLES = ['runs', 'run_shards', 'test_results', 'test_attempts', 'attachments', 'run_events', 'tests'] as const;

export interface TableSize {
  name: string;
  /** Postgres' live-row estimate (`pg_stat_user_tables.n_live_tup`): cheap at any size. */
  rows: number;
  tableBytes: number;
  indexBytes: number;
  /** Out-of-line storage for large values: jsonb steps, stdout, error stacks. */
  toastBytes: number;
  totalBytes: number;
}

export interface DatabaseSize {
  /** `pg_database_size`: every table, index and catalogue, including other schemas. */
  totalBytes: number;
  tables: TableSize[];
}

export async function databaseSize(): Promise<DatabaseSize> {
  const [total] = await db.execute<{ bytes: string }>(sql`select pg_database_size(current_database())::text as bytes`);
  const rows = await db.execute<{ name: string; rows: string; table_bytes: string; index_bytes: string; total_bytes: string }>(sql`
    select c.relname as name,
           coalesce(s.n_live_tup, 0)::text as rows,
           pg_relation_size(c.oid)::text as table_bytes,
           pg_indexes_size(c.oid)::text as index_bytes,
           pg_total_relation_size(c.oid)::text as total_bytes
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
     where n.nspname = 'public' and c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc, c.relname
  `);
  return {
    totalBytes: Number(total?.bytes ?? 0),
    tables: rows.map((r) => {
      const tableBytes = Number(r.table_bytes);
      const indexBytes = Number(r.index_bytes);
      const totalBytes = Number(r.total_bytes);
      return {
        name: r.name,
        rows: Number(r.rows),
        tableBytes,
        indexBytes,
        toastBytes: Math.max(0, totalBytes - tableBytes - indexBytes),
        totalBytes,
      };
    }),
  };
}

/**
 * Runs, results, attempts and artifact bytes per UTC day over the last
 * `days` days, by the day each run started, with empty days filled in.
 * Counted per run through the `run_id` indexes, so the window costs what its
 * runs cost rather than a scan of every result.
 */
export async function ingestByDay(days: number, now: Date = new Date()): Promise<IngestDay[]> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 86_400_000);
  const rows = await db.execute<{ day: string; runs: string; results: string; attempts: string; artifact_bytes: string }>(sql`
    select to_char(date_trunc('day', r.started_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
           count(*)::text as runs,
           coalesce(sum(tr.results), 0)::text as results,
           coalesce(sum(tr.attempts), 0)::text as attempts,
           coalesce(sum(a.bytes), 0)::text as artifact_bytes
      from ${runs} r
      left join lateral (
        select count(*) as results, coalesce(sum(attempt_count), 0) as attempts
          from ${testResults} where run_id = r.id
      ) tr on true
      left join lateral (
        select coalesce(sum(size_bytes), 0) as bytes from ${attachments} where run_id = r.id
      ) a on true
     where r.started_at >= ${since.toISOString()}
     group by 1
     order by 1
  `);
  return fillDays(
    rows.map((r) => ({
      day: r.day,
      runs: Number(r.runs),
      results: Number(r.results),
      attempts: Number(r.attempts),
      artifactBytes: Number(r.artifact_bytes),
    })),
    days,
    now,
  );
}

export interface HistoryTotals {
  runs: number;
  results: number;
  oldestRunAt: Date | null;
  /** Bytes the run-history tables take, divided by their results: what one more result costs, indexes included. */
  bytesPerResult: number;
}

export async function historyTotals(size: DatabaseSize): Promise<HistoryTotals> {
  const [[r], [t]] = await Promise.all([
    db.select({ runs: count(), oldest: sql<string | null>`(extract(epoch from min(${runs.startedAt})) * 1000)::bigint::text` }).from(runs),
    db.select({ results: count() }).from(testResults),
  ]);
  const historyBytes = size.tables
    .filter((x) => (RUN_HISTORY_TABLES as readonly string[]).includes(x.name))
    .reduce((sum, x) => sum + x.totalBytes, 0);
  return {
    runs: r?.runs ?? 0,
    results: t?.results ?? 0,
    oldestRunAt: r?.oldest ? new Date(Number(r.oldest)) : null,
    bytesPerResult: t?.results ? Math.round(historyBytes / t.results) : 0,
  };
}

export interface ProjectFootprint {
  projectId: string;
  projectName: string;
  projectSlug: string;
  teamName: string;
  teamSlug: string;
  runs: number;
  results: number;
  oldestRunAt: Date | null;
  /** Bytes of artifacts still in the store. */
  liveArtifactBytes: number;
}

/** The projects with the most results, which is where the rows are. */
export async function projectFootprints(limit = 10): Promise<ProjectFootprint[]> {
  const rows = await db.execute<{
    project_id: string;
    project_name: string;
    project_slug: string;
    team_name: string;
    team_slug: string;
    runs: string;
    results: string;
    oldest: string | null;
    live_bytes: string;
  }>(sql`
    select p.id as project_id, p.name as project_name, p.slug as project_slug, t.name as team_name, t.slug as team_slug,
           (select count(*) from ${runs} r where r.project_id = p.id)::text as runs,
           (select count(*) from ${testResults} tr where tr.project_id = p.id)::text as results,
           (select (extract(epoch from min(r.started_at)) * 1000)::bigint from ${runs} r where r.project_id = p.id)::text as oldest,
           (select coalesce(sum(a.size_bytes), 0) from ${attachments} a join ${runs} r on r.id = a.run_id
             where r.project_id = p.id and a.expired_at is null)::text as live_bytes
      from ${projects} p
      join ${teams} t on t.id = p.team_id
     order by 7 desc, 6 desc, p.name
     limit ${limit}
  `);
  return rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    projectSlug: r.project_slug,
    teamName: r.team_name,
    teamSlug: r.team_slug,
    runs: Number(r.runs),
    results: Number(r.results),
    oldestRunAt: r.oldest ? new Date(Number(r.oldest)) : null,
    liveArtifactBytes: Number(r.live_bytes),
  }));
}

export interface DuePreview {
  runs: number;
  results: number;
  /** Bytes of live artifacts that go with the due runs. */
  artifactBytes: number;
  events: number;
  /** `null` when the policy keeps the audit log forever. */
  audit: number | null;
  /** Expired sessions, verifications, OAuth codes and tokens and dead invitations; `null` with housekeeping off. */
  expired: number | null;
}

/** What the next sweep would delete under `policy`. */
export async function duePreview(policy: DataRetentionPolicy, now: Date = new Date()): Promise<DuePreview> {
  const cut = cutoffs(policy, now);
  const due = db.select({ id: runs.id }).from(runs).where(runsDueWhere(policy, getStorage().name, now));
  const grace = new Date(now.getTime() - EXPIRED_GRACE_DAYS * 86_400_000);

  const [[dueRuns], [dueResults], [dueBytes], [dueEvents], audit, expired] = await Promise.all([
    db.select({ n: count() }).from(runs).where(inArray(runs.id, due)),
    db.select({ n: count() }).from(testResults).where(inArray(testResults.runId, due)),
    db
      .select({ n: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)`.mapWith(Number) })
      .from(attachments)
      .where(and(inArray(attachments.runId, due), isNull(attachments.expiredAt))),
    db
      .select({ n: count() })
      .from(runEvents)
      .innerJoin(runs, eq(runs.id, runEvents.runId))
      .where(and(sql`${runs.status} <> 'running'`, sql`coalesce(${runs.finishedAt}, ${runs.startedAt}) < ${cut.events.toISOString()}`)),
    cut.audit ? db.select({ n: count() }).from(auditLogs).where(lt(auditLogs.createdAt, cut.audit)) : Promise.resolve(null),
    policy.housekeeping
      ? Promise.all([
          db.select({ n: count() }).from(sessions).where(lt(sessions.expiresAt, grace)),
          db.select({ n: count() }).from(verifications).where(lt(verifications.expiresAt, grace)),
          db.select({ n: count() }).from(oauthCodes).where(lt(oauthCodes.expiresAt, grace)),
          db.select({ n: count() }).from(oauthTokens).where(lt(oauthTokens.expiresAt, grace)),
          db
            .select({ n: count() })
            .from(teamInvitations)
            .where(and(isNull(teamInvitations.acceptedAt), or(lt(teamInvitations.expiresAt, grace), lt(teamInvitations.revokedAt, grace)))),
        ])
      : Promise.resolve(null),
  ]);

  return {
    runs: dueRuns?.n ?? 0,
    results: dueResults?.n ?? 0,
    artifactBytes: dueBytes?.n ?? 0,
    events: dueEvents?.n ?? 0,
    audit: audit ? (audit[0]?.n ?? 0) : null,
    expired: expired ? expired.reduce((sum, [row]) => sum + (row?.n ?? 0), 0) : null,
  };
}
