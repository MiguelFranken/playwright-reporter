/**
 * Artifact retention: the policy a superadmin saves, and the sweep that
 * applies it. The sweep deletes expired objects from the store (unless the
 * store expires them itself, see `RetentionOwner`) and marks their rows
 * `expired` — the rows stay, so an old run still lists what it had and says
 * why it is gone instead of showing a broken link.
 *
 * Triggers, so it works on every deployment: a scheduler calling
 * `/api/cron/artifact-retention` (Vercel Cron, or any cron with
 * `CRON_SECRET`), a run finishing when no sweep ran for a while (see
 * `sweepAfterIngest`), and the "Run now" button in the admin UI. Sweeps may
 * overlap: each batch locks its rows with `skip locked`, so two never work on
 * the same artifact.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { artifactSweeps, attachments, instanceSettings, type ArtifactSweep } from '@/lib/db/schema';
import { getStorage, type StorageAdapter } from '@/lib/storage';
import { INGEST_SWEEP_INTERVAL_MS, ingestSweepEnabled } from './config';
import { cutoffs, environmentPolicy, normalizePolicy, type PolicySource, type RetentionPolicy } from './policy';

export * from './config';
export * from './policy';

export const POLICY_KEY = 'artifactRetention';

/** Rows per batch: one store delete call and one update each. */
const BATCH_SIZE = 100;

export interface LoadedPolicy {
  policy: RetentionPolicy;
  source: PolicySource;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export async function getRetentionPolicy(): Promise<LoadedPolicy> {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.key, POLICY_KEY));
  const saved = row ? normalizePolicy(row.value) : null;
  if (saved) return { policy: saved, source: 'saved', updatedAt: row!.updatedAt, updatedBy: row!.updatedBy };
  return { ...environmentPolicy(), updatedAt: null, updatedBy: null };
}

/**
 * Saves the policy. A store that manages lifetimes itself and can be
 * configured from here is updated first, so a failure leaves both as they were.
 */
export async function saveRetentionPolicy(policy: RetentionPolicy, actorId: string, storage: StorageAdapter = getStorage()) {
  if (storage.applyRetentionPolicy) await storage.applyRetentionPolicy(policy);
  const value = { ...policy } as Record<string, unknown>;
  await db
    .insert(instanceSettings)
    .values({ key: POLICY_KEY, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: instanceSettings.key, set: { value, updatedBy: actorId, updatedAt: sql`now()` } });
}

/** Live artifacts the policy says have expired, over Drizzle-qualified columns. */
export function dueWhere(policy: RetentionPolicy, now: Date = new Date()): SQL {
  const groups = cutoffs(policy, now).map((c) => and(inArray(attachments.kind, c.kinds), lt(attachments.createdAt, c.before))!);
  return and(isNull(attachments.expiredAt), or(...groups))!;
}

// ---------------------------------------------------------------- stats

export interface KindUsage {
  kind: string;
  liveCount: number;
  liveBytes: number;
  expiredCount: number;
  expiredBytes: number;
  /** Live artifacts the saved policy's lifetimes have run out for: what the next sweep takes. */
  dueCount: number;
  dueBytes: number;
}

/** Per-kind usage. `due` is counted even while the policy is off, as a preview. */
export async function retentionStats(policy: RetentionPolicy, now: Date = new Date()): Promise<KindUsage[]> {
  const due = dueWhere(policy, now);
  const rows = await db
    .select({
      kind: attachments.kind,
      liveCount: sql<number>`count(*) filter (where ${attachments.expiredAt} is null)`.mapWith(Number),
      liveBytes: sql<number>`coalesce(sum(${attachments.sizeBytes}) filter (where ${attachments.expiredAt} is null), 0)`.mapWith(Number),
      expiredCount: sql<number>`count(*) filter (where ${attachments.expiredAt} is not null)`.mapWith(Number),
      expiredBytes: sql<number>`coalesce(sum(${attachments.sizeBytes}) filter (where ${attachments.expiredAt} is not null), 0)`.mapWith(Number),
      dueCount: sql<number>`count(*) filter (where ${due})`.mapWith(Number),
      dueBytes: sql<number>`coalesce(sum(${attachments.sizeBytes}) filter (where ${due}), 0)`.mapWith(Number),
    })
    .from(attachments)
    .groupBy(attachments.kind)
    .orderBy(asc(attachments.kind));
  return rows;
}

export async function listSweeps(limit = 10): Promise<ArtifactSweep[]> {
  return db.select().from(artifactSweeps).orderBy(desc(artifactSweeps.startedAt), desc(artifactSweeps.id)).limit(limit);
}

// ---------------------------------------------------------------- sweep

export type SweepTrigger = ArtifactSweep['trigger'];

export type SweepResult =
  | { status: 'disabled' }
  | { status: 'done'; sweepId: number; expiredCount: number; expiredBytes: number; hasMore: boolean; error: string | null };

export interface SweepOptions {
  trigger: SweepTrigger;
  /** Stop starting new batches after this long; the next sweep continues. */
  budgetMs?: number;
  now?: () => Date;
  storage?: StorageAdapter;
  batchSize?: number;
}

/**
 * Expires what the policy says has run out, in batches, oldest first, until
 * nothing is left or the budget is spent. A batch whose store delete fails
 * rolls back, so its rows stay live and the next sweep tries them again;
 * deleting an object twice is harmless.
 *
 * Only rows written by the active driver are touched: a row from another
 * store cannot be deleted from here, and marking it would hide bytes that are
 * still being paid for.
 */
export async function sweepExpiredArtifacts(options: SweepOptions): Promise<SweepResult> {
  const { policy } = await getRetentionPolicy();
  if (!policy.enabled) return { status: 'disabled' };

  const storage = options.storage ?? getStorage();
  const clock = options.now ?? (() => new Date());
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const deadline = Date.now() + (options.budgetMs ?? 60_000);

  const [sweep] = await db
    .insert(artifactSweeps)
    .values({ trigger: options.trigger, storageDriver: storage.name })
    .returning({ id: artifactSweeps.id });

  let expiredCount = 0;
  let expiredBytes = 0;
  let hasMore = false;
  let error: string | null = null;

  try {
    for (;;) {
      if (Date.now() >= deadline) {
        hasMore = await anyDue(policy, storage, clock());
        break;
      }
      const batch = await db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: attachments.id, storageKey: attachments.storageKey, sizeBytes: attachments.sizeBytes })
          .from(attachments)
          .where(and(eq(attachments.storageDriver, storage.name), dueWhere(policy, clock())))
          .orderBy(asc(attachments.createdAt))
          .limit(batchSize)
          .for('update', { skipLocked: true });
        if (rows.length === 0) return rows;
        if (storage.retention === 'app') await storage.delete(rows.map((r) => r.storageKey));
        await tx
          .update(attachments)
          .set({ status: 'expired', expiredAt: sql`now()` })
          .where(
            inArray(
              attachments.id,
              rows.map((r) => r.id),
            ),
          );
        return rows;
      });
      expiredCount += batch.length;
      expiredBytes += batch.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);
      if (batch.length < batchSize) break;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    hasMore = true;
    console.error('[retention] sweep failed', err);
  }

  await db
    .update(artifactSweeps)
    .set({ finishedAt: sql`now()`, expiredCount, expiredBytes, hasMore, error })
    .where(eq(artifactSweeps.id, sweep.id));
  return { status: 'done', sweepId: sweep.id, expiredCount, expiredBytes, hasMore, error };
}

/**
 * "Force delete": expires every live artifact of the active driver, whatever
 * the policy says and whether or not it is on. The objects are deleted from
 * the store even when the store expires objects itself, since nothing would
 * otherwise take them before their lifecycle rule does. Logged as a `force`
 * sweep, batched and budgeted like any other; rows from another driver are
 * left alone for the same reason.
 */
export async function evictAllArtifacts(
  options: Omit<SweepOptions, 'trigger' | 'now'> = {},
): Promise<Extract<SweepResult, { status: 'done' }>> {
  const storage = options.storage ?? getStorage();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const deadline = Date.now() + (options.budgetMs ?? 60_000);
  const live = and(eq(attachments.storageDriver, storage.name), isNull(attachments.expiredAt))!;

  const [sweep] = await db
    .insert(artifactSweeps)
    .values({ trigger: 'force', storageDriver: storage.name })
    .returning({ id: artifactSweeps.id });

  let expiredCount = 0;
  let expiredBytes = 0;
  let hasMore = false;
  let error: string | null = null;

  try {
    for (;;) {
      if (Date.now() >= deadline) {
        const [row] = await db.select({ id: attachments.id }).from(attachments).where(live).limit(1);
        hasMore = Boolean(row);
        break;
      }
      const batch = await db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: attachments.id, storageKey: attachments.storageKey, sizeBytes: attachments.sizeBytes })
          .from(attachments)
          .where(live)
          .orderBy(asc(attachments.createdAt))
          .limit(batchSize)
          .for('update', { skipLocked: true });
        if (rows.length === 0) return rows;
        await storage.delete(rows.map((r) => r.storageKey));
        await tx
          .update(attachments)
          .set({ status: 'expired', expiredAt: sql`now()` })
          .where(
            inArray(
              attachments.id,
              rows.map((r) => r.id),
            ),
          );
        return rows;
      });
      expiredCount += batch.length;
      expiredBytes += batch.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);
      if (batch.length < batchSize) break;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    hasMore = true;
    console.error('[retention] force eviction failed', err);
  }

  await db
    .update(artifactSweeps)
    .set({ finishedAt: sql`now()`, expiredCount, expiredBytes, hasMore, error })
    .where(eq(artifactSweeps.id, sweep.id));
  return { status: 'done', sweepId: sweep.id, expiredCount, expiredBytes, hasMore, error };
}

async function anyDue(policy: RetentionPolicy, storage: StorageAdapter, now: Date) {
  const [row] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.storageDriver, storage.name), dueWhere(policy, now)))
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------- triggers

/**
 * Called after a run finishes: sweeps, briefly, when the policy is on and no
 * sweep of any trigger started within `INGEST_SWEEP_INTERVAL_MS`. Two runs
 * finishing together may both sweep, which the row locks make harmless.
 */
export async function sweepAfterIngest(options: Omit<SweepOptions, 'trigger'> = {}): Promise<SweepResult | { status: 'skipped' }> {
  if (!ingestSweepEnabled()) return { status: 'skipped' };
  const since = new Date(Date.now() - INGEST_SWEEP_INTERVAL_MS);
  const [recent] = await db.select({ id: artifactSweeps.id }).from(artifactSweeps).where(gte(artifactSweeps.startedAt, since)).limit(1);
  if (recent) return { status: 'skipped' };
  return sweepExpiredArtifacts({ budgetMs: 20_000, ...options, trigger: 'ingest' });
}

/**
 * For a store that expires objects itself: a live row whose object is gone
 * was taken by the store's lifecycle rule, so it is recorded as expired the
 * first time somebody asks for it. With `app` retention a missing object is a
 * fault, not an expiry, and stays visible as one.
 */
export async function markMissingExpired(attachmentId: string, storage: StorageAdapter = getStorage()): Promise<boolean> {
  if (storage.retention !== 'provider') return false;
  const updated = await db
    .update(attachments)
    .set({ status: 'expired', expiredAt: sql`now()` })
    .where(and(eq(attachments.id, attachmentId), eq(attachments.status, 'uploaded'), isNull(attachments.expiredAt)))
    .returning({ id: attachments.id });
  return updated.length > 0;
}
