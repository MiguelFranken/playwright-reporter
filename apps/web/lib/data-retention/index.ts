/**
 * Data retention: the policy a superadmin saves, and the sweep that applies it
 * to this database. Artifact bytes have their own policy and sweep
 * (`lib/storage/retention`); the two are configured and run apart.
 *
 * A sweep, in order, each step batched and stopping at the time budget:
 *
 *   1. Finished runs older than the policy's run lifetime — except each
 *      project's newest few — are deleted. Their shards, results, attempts,
 *      attachment rows and events go with them by cascade; the bytes of their
 *      live artifacts are deleted from the store first, in the same
 *      transaction, so a failing store rolls the batch back instead of
 *      leaving objects nobody can find any more.
 *   2. Tests no run refers to any more are dropped from the catalogue.
 *   3. The live event log of finished runs is cut back: it only feeds the live
 *      views while a run is in progress.
 *   4. Audit entries past their lifetime go, when the policy sets one.
 *   5. Housekeeping: expired sessions, verifications, OAuth codes and tokens,
 *      dead invitations, idle rate-limit rows, and old sweep logs.
 *
 * Triggers match the artifact sweep: a scheduler calling
 * `/api/cron/data-retention`, a run finishing when no data sweep ran for a
 * while, and the "Run now" button. Batches lock their runs with `skip
 * locked`, so overlapping sweeps never work on the same run.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  artifactSweeps,
  attachments,
  auditLogs,
  dataSweeps,
  instanceSettings,
  oauthCodes,
  oauthTokens,
  rateLimits,
  runEvents,
  runs,
  sessions,
  teamInvitations,
  testAttempts,
  testResults,
  tests,
  verifications,
  type DataSweep,
} from '@/lib/db/schema';
import { getStorage, type StorageAdapter } from '@/lib/storage';
import { EXPIRED_GRACE_DAYS, INGEST_SWEEP_INTERVAL_MS, RATE_LIMIT_MAX_AGE_MS, SWEEP_LOG_DAYS, ingestSweepEnabled } from './config';
import { cutoffs, environmentPolicy, normalizePolicy, type DataRetentionPolicy, type PolicySource } from './policy';

export * from './config';
export * from './policy';

export const POLICY_KEY = 'dataRetention';

/** Runs per batch. A run can carry thousands of results, so batches stay small. */
const RUN_BATCH = 20;
/** Rows per batch for the flat deletes (events, tests, audit entries). */
const ROW_BATCH = 5000;
/** Keys per store delete call. */
const STORE_BATCH = 100;

const DAY_MS = 86_400_000;

export interface LoadedPolicy {
  policy: DataRetentionPolicy;
  source: PolicySource;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export async function getDataRetentionPolicy(): Promise<LoadedPolicy> {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.key, POLICY_KEY));
  const saved = row ? normalizePolicy(row.value) : null;
  if (saved) return { policy: saved, source: 'saved', updatedAt: row!.updatedAt, updatedBy: row!.updatedBy };
  return { ...environmentPolicy(), updatedAt: null, updatedBy: null };
}

export async function saveDataRetentionPolicy(policy: DataRetentionPolicy, actorId: string) {
  const value = { ...policy } as Record<string, unknown>;
  await db
    .insert(instanceSettings)
    .values({ key: POLICY_KEY, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: instanceSettings.key, set: { value, updatedBy: actorId, updatedAt: sql`now()` } });
}

export async function listDataSweeps(limit = 10): Promise<DataSweep[]> {
  return db.select().from(dataSweeps).orderBy(desc(dataSweeps.startedAt), desc(dataSweeps.id)).limit(limit);
}

// ---------------------------------------------------------------- which runs

/**
 * Runs that may be deleted at all: finished, and holding no live artifact of
 * another store — this instance could not delete those bytes, and dropping
 * the rows would lose track of objects that are still being paid for.
 */
function deletable(driver: string): SQL {
  return sql`${runs.status} <> 'running' and not exists (
    select 1 from ${attachments}
    where ${attachments.runId} = ${runs.id} and ${attachments.expiredAt} is null and ${attachments.storageDriver} <> ${driver}
  )`;
}

/** Runs the policy says have run out, over Drizzle-qualified columns. */
export function runsDueWhere(policy: DataRetentionPolicy, driver: string, now: Date = new Date()): SQL {
  const { runs: before } = cutoffs(policy, now);
  const due = and(deletable(driver), lt(runs.startedAt, before))!;
  if (policy.keepLatestRuns === 0) return due;
  // Older than the project's Nth newest run. A project with fewer runs than
  // that has no Nth, the comparison is null, and nothing of it is due.
  return and(
    due,
    sql`${runs.number} < (
      select r2.number from ${runs} r2 where r2.project_id = ${runs.projectId}
      order by r2.number desc limit 1 offset ${policy.keepLatestRuns - 1}
    )`,
  )!;
}

// ---------------------------------------------------------------- sweep

export interface DataSweepCounts {
  runs: number;
  results: number;
  attempts: number;
  attachments: number;
  events: number;
  tests: number;
  audit: number;
  /** Expired sessions, verifications, OAuth codes and tokens, invitations and rate-limit rows. */
  auth: number;
  /** Rows of both sweep logs past `SWEEP_LOG_DAYS`. */
  sweepLogs: number;
}

export const EMPTY_COUNTS: DataSweepCounts = {
  runs: 0,
  results: 0,
  attempts: 0,
  attachments: 0,
  events: 0,
  tests: 0,
  audit: 0,
  auth: 0,
  sweepLogs: 0,
};

export type SweepTrigger = DataSweep['trigger'];

export interface DataSweepDone {
  status: 'done';
  sweepId: number;
  deleted: DataSweepCounts;
  artifactBytes: number;
  hasMore: boolean;
  error: string | null;
}

export type DataSweepResult = { status: 'disabled' } | DataSweepDone;

export interface SweepOptions {
  trigger: SweepTrigger;
  /** Stop starting new batches after this long; the next sweep continues. */
  budgetMs?: number;
  now?: () => Date;
  storage?: StorageAdapter;
  batchSize?: number;
}

/** What one sweep is doing, shared by its steps. */
class Sweep {
  deleted: DataSweepCounts = { ...EMPTY_COUNTS };
  artifactBytes = 0;
  hasMore = false;
  private readonly deadline: number;

  constructor(
    readonly storage: StorageAdapter,
    budgetMs: number,
    readonly batchSize: number,
  ) {
    this.deadline = Date.now() + budgetMs;
  }

  /** True once the budget is spent: the step stops, and the sweep says more may be due. */
  outOfTime() {
    if (Date.now() < this.deadline) return false;
    this.hasMore = true;
    return true;
  }

  /** Deletes runs matching `where` in batches until none are left or time is up. */
  async deleteRuns(where: SQL) {
    for (;;) {
      if (this.outOfTime()) return;
      const n = await this.deleteRunBatch(where);
      if (n < this.batchSize) return;
    }
  }

  private async deleteRunBatch(where: SQL): Promise<number> {
    const batch = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: runs.id })
        .from(runs)
        .where(where)
        .orderBy(asc(runs.startedAt))
        .limit(this.batchSize)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return null;
      const ids = rows.map((r) => r.id);

      const [counts] = await tx
        .select({
          results: sql<number>`count(distinct ${testResults.id})`.mapWith(Number),
          attempts: sql<number>`count(${testAttempts.id})`.mapWith(Number),
        })
        .from(testResults)
        .leftJoin(testAttempts, eq(testAttempts.testResultId, testResults.id))
        .where(inArray(testResults.runId, ids));
      const [events] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(runEvents)
        .where(inArray(runEvents.runId, ids));
      const files = await tx
        .select({ key: attachments.storageKey, size: attachments.sizeBytes, expiredAt: attachments.expiredAt })
        .from(attachments)
        .where(inArray(attachments.runId, ids));

      // `deletable` guarantees every live artifact here is in this store.
      const live = files.filter((f) => f.expiredAt === null);
      for (let i = 0; i < live.length; i += STORE_BATCH) {
        await this.storage.delete(live.slice(i, i + STORE_BATCH).map((f) => f.key));
      }
      await tx.delete(runs).where(inArray(runs.id, ids));
      return {
        runs: ids.length,
        results: counts?.results ?? 0,
        attempts: counts?.attempts ?? 0,
        events: events?.n ?? 0,
        attachments: files.length,
        bytes: live.reduce((sum, f) => sum + (f.size ?? 0), 0),
      };
    });
    if (!batch) return 0;
    // Counted once the transaction committed, so a rolled-back batch counts for nothing.
    this.deleted.runs += batch.runs;
    this.deleted.results += batch.results;
    this.deleted.attempts += batch.attempts;
    this.deleted.events += batch.events;
    this.deleted.attachments += batch.attachments;
    this.artifactBytes += batch.bytes;
    return batch.runs;
  }

  /** Repeats a bounded delete until it takes less than a full batch, or time is up. */
  async drain(key: keyof DataSweepCounts, step: () => Promise<number>) {
    for (;;) {
      if (this.outOfTime()) return;
      const n = await step();
      this.deleted[key] += n;
      if (n < ROW_BATCH) return;
    }
  }
}

/**
 * Tests no result refers to any more. A test row may be written just ahead of
 * its first result, so one seen within the last hour stays.
 */
async function deleteOrphanTests(now: Date) {
  const before = new Date(now.getTime() - 3_600_000);
  const orphans = db
    .select({ id: tests.id })
    .from(tests)
    .where(
      and(
        lt(tests.lastSeenAt, before),
        sql`not exists (select 1 from ${testResults} where ${testResults.testId} = ${tests.id})`,
      ),
    )
    .limit(ROW_BATCH);
  const gone = await db.delete(tests).where(inArray(tests.id, orphans)).returning({ id: tests.id });
  return gone.length;
}

/** Events of runs that finished before `before`. */
async function deleteFinishedRunEvents(before: Date) {
  const old = db
    .select({ id: runEvents.id })
    .from(runEvents)
    .innerJoin(runs, eq(runs.id, runEvents.runId))
    .where(and(sql`${runs.status} <> 'running'`, sql`coalesce(${runs.finishedAt}, ${runs.startedAt}) < ${before.toISOString()}`))
    .limit(ROW_BATCH);
  const gone = await db.delete(runEvents).where(inArray(runEvents.id, old)).returning({ id: runEvents.id });
  return gone.length;
}

async function deleteAuditBefore(before: Date) {
  const old = db.select({ id: auditLogs.id }).from(auditLogs).where(lt(auditLogs.createdAt, before)).limit(ROW_BATCH);
  const gone = await db.delete(auditLogs).where(inArray(auditLogs.id, old)).returning({ id: auditLogs.id });
  return gone.length;
}

/** What has already expired. Small tables, one statement each. */
async function housekeeping(now: Date): Promise<{ auth: number; sweepLogs: number }> {
  const grace = new Date(now.getTime() - EXPIRED_GRACE_DAYS * DAY_MS);
  const logs = new Date(now.getTime() - SWEEP_LOG_DAYS * DAY_MS);
  const counts = await Promise.all([
    db.delete(sessions).where(lt(sessions.expiresAt, grace)).returning({ id: sessions.id }),
    db.delete(verifications).where(lt(verifications.expiresAt, grace)).returning({ id: verifications.id }),
    db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, grace)).returning({ id: oauthCodes.codeHash }),
    db.delete(oauthTokens).where(lt(oauthTokens.expiresAt, grace)).returning({ id: oauthTokens.id }),
    db.delete(rateLimits).where(lt(rateLimits.lastRequest, now.getTime() - RATE_LIMIT_MAX_AGE_MS)).returning({ id: rateLimits.id }),
    // An accepted invitation records who brought a member in; it stays.
    db
      .delete(teamInvitations)
      .where(
        and(isNull(teamInvitations.acceptedAt), or(lt(teamInvitations.expiresAt, grace), lt(teamInvitations.revokedAt, grace))),
      )
      .returning({ id: teamInvitations.id }),
  ]);
  const sweepLogs = await Promise.all([
    db.delete(artifactSweeps).where(lt(artifactSweeps.startedAt, logs)).returning({ id: artifactSweeps.id }),
    db.delete(dataSweeps).where(lt(dataSweeps.startedAt, logs)).returning({ id: dataSweeps.id }),
  ]);
  return {
    auth: counts.reduce((sum, rows) => sum + rows.length, 0),
    sweepLogs: sweepLogs.reduce((sum, rows) => sum + rows.length, 0),
  };
}

async function recorded(trigger: SweepTrigger, work: (sweep: Sweep) => Promise<void>, sweep: Sweep): Promise<DataSweepDone> {
  const [row] = await db.insert(dataSweeps).values({ trigger }).returning({ id: dataSweeps.id });
  let error: string | null = null;
  try {
    await work(sweep);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    sweep.hasMore = true;
    console.error(`[data-retention] ${trigger} sweep failed`, err);
  }
  const deleted = { ...sweep.deleted };
  await db
    .update(dataSweeps)
    .set({ finishedAt: sql`now()`, deleted: { ...deleted }, artifactBytes: sweep.artifactBytes, hasMore: sweep.hasMore, error })
    .where(eq(dataSweeps.id, row.id));
  return { status: 'done', sweepId: row.id, deleted, artifactBytes: sweep.artifactBytes, hasMore: sweep.hasMore, error };
}

/**
 * Applies the saved policy, oldest first, until nothing is left or the
 * budget is spent. A batch whose store delete fails rolls back, so its runs
 * stay and the next sweep tries them again; deleting an object twice is
 * harmless.
 */
export async function sweepExpiredData(options: SweepOptions): Promise<DataSweepResult> {
  const { policy } = await getDataRetentionPolicy();
  if (!policy.enabled) return { status: 'disabled' };

  const storage = options.storage ?? getStorage();
  const clock = options.now ?? (() => new Date());
  const sweep = new Sweep(storage, options.budgetMs ?? 60_000, options.batchSize ?? RUN_BATCH);

  return recorded(
    options.trigger,
    async (s) => {
      await s.deleteRuns(runsDueWhere(policy, storage.name, clock()));
      const cut = cutoffs(policy, clock());
      await s.drain('tests', () => deleteOrphanTests(clock()));
      await s.drain('events', () => deleteFinishedRunEvents(cut.events));
      if (cut.audit) {
        const before = cut.audit;
        await s.drain('audit', () => deleteAuditBefore(before));
      }
      if (policy.housekeeping && !s.outOfTime()) {
        const done = await housekeeping(clock());
        s.deleted.auth += done.auth;
        s.deleted.sweepLogs += done.sweepLogs;
      }
    },
    sweep,
  );
}

/**
 * "Purge history": deletes every finished run of the instance — results,
 * attempts, events and artifacts, bytes included — whatever the policy says
 * and whether or not it is on. Teams, projects, members and tokens stay, and
 * run numbers keep counting up. Logged as a `force` sweep, batched and
 * budgeted like any other.
 */
export async function purgeRunHistory(options: Omit<SweepOptions, 'trigger'> = {}): Promise<DataSweepDone> {
  const storage = options.storage ?? getStorage();
  const clock = options.now ?? (() => new Date());
  const sweep = new Sweep(storage, options.budgetMs ?? 60_000, options.batchSize ?? RUN_BATCH);
  return recorded(
    'force',
    async (s) => {
      await s.deleteRuns(deletable(storage.name));
      await s.drain('tests', () => deleteOrphanTests(clock()));
    },
    sweep,
  );
}

// ---------------------------------------------------------------- triggers

/**
 * Called after a run finishes: sweeps, briefly, when the policy is on and no
 * data sweep of any trigger started within `INGEST_SWEEP_INTERVAL_MS`.
 */
export async function sweepDataAfterIngest(options: Omit<SweepOptions, 'trigger'> = {}): Promise<DataSweepResult | { status: 'skipped' }> {
  if (!ingestSweepEnabled()) return { status: 'skipped' };
  const since = new Date(Date.now() - INGEST_SWEEP_INTERVAL_MS);
  const [recent] = await db.select({ id: dataSweeps.id }).from(dataSweeps).where(gte(dataSweeps.startedAt, since)).limit(1);
  if (recent) return { status: 'skipped' };
  return sweepExpiredData({ budgetMs: 20_000, ...options, trigger: 'ingest' });
}
