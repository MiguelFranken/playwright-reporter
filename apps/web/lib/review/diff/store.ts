/**
 * Measuring comparisons: planning which pairs of images a run needs measured,
 * measuring one (reading both images from the attachment store), and
 * approving the changes the project's tolerance calls noise.
 *
 * Every step is idempotent, so a workflow step that is retried, two workers
 * that race, or a run planned twice do no harm:
 * - planning inserts a pair once (`image_diffs_pair_idx`) and answers the
 *   pending ones;
 * - measuring claims a pending row before reading anything, and a claim
 *   left by a worker that died expires;
 * - approving only touches images that are still `changed`.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { attachments, imageDiffs, reviewCaptures, reviewCheckpoints, reviewDecisions, runs } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { checkpointsWhere, type AttachmentState, type ComparedCapture } from '../queries';
import { diffImages, DiffTooLargeError } from './engine';
import { diffSettingsFor, pairOf, type DiffPair, type Rect } from './lookup';
import { toleranceComment } from './settings';

/** A claim older than this belongs to a worker that died; the row is free again. */
export const CLAIM_TTL_MS = 5 * 60_000;
/** A measurement that failed this often is recorded as failed instead of retried. */
export const MAX_ATTEMPTS = 3;
/** Neither image a comparison reads may be larger than this, compressed. */
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

/** `IMAGE_DIFF_MAX_PIXELS`: the most pixels one image may have to be measured (default 40 MP). */
export function maxDiffPixels(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.IMAGE_DIFF_MAX_PIXELS);
  return Number.isFinite(n) && n >= 1_000_000 ? Math.floor(n) : 40_000_000;
}

const claimExpired = () => sql`now() - make_interval(secs => ${CLAIM_TTL_MS / 1000})`;

export interface DiffPlan {
  /** Pending comparisons nobody is measuring: what to measure now. */
  ids: string[];
  /** Pairs whose images are still uploading: plan again later. */
  waiting: number;
}

/** The reference image a capture is measured against, as `compareCaptures` chose it. */
function referenceOf(c: ComparedCapture) {
  return c.diffAgainst === 'baseline' ? (c.baseline?.capture ?? null) : c.diffAgainst === 'previous' ? (c.previous?.capture ?? null) : null;
}

/** Plans the comparisons the captures need and answers the pending ones. */
export async function planCaptures(captures: readonly ComparedCapture[]): Promise<DiffPlan> {
  const settings = await diffSettingsFor(captures.map((c) => c.projectId));
  return planPairs(
    captures.flatMap((c) => {
      if (c.diff && c.diff.status !== 'pending') return [];
      const reference = referenceOf(c);
      const s = settings.get(c.projectId);
      const pair = s ? pairOf(c, reference, s, c.ignoreRegions) : null;
      return pair && reference ? [{ pair, head: c.attachment, base: reference.attachment }] : [];
    }),
  );
}

export interface PlannedPair {
  pair: DiffPair & { options: { threshold: number; ignore: Rect[] } };
  head: AttachmentState;
  base: AttachmentState;
}

/** Plans pairs of images (inserting each once) and answers the pending ones; pairs still uploading wait. */
export async function planPairs(pairs: readonly PlannedPair[]): Promise<DiffPlan> {
  const rows: (typeof imageDiffs.$inferInsert)[] = [];
  let waiting = 0;
  for (const { pair, head, base } of pairs) {
    const states = [head.status, base.status];
    if (states.some((st) => st === 'pending')) {
      waiting++;
      continue;
    }
    if (states.some((st) => st !== 'uploaded')) continue;
    rows.push({ id: randomUUID(), ...pair, baseAttachmentId: base.id, headAttachmentId: head.id });
  }
  if (rows.length === 0) return { ids: [], waiting };
  await db.insert(imageDiffs).values(rows).onConflictDoNothing();
  const tuples = rows.map((r) => sql`(${r.projectId}::uuid, ${r.baseSha256}, ${r.headSha256}, ${r.optionsKey})`);
  const pending = await db
    .select({ id: imageDiffs.id })
    .from(imageDiffs)
    .where(
      and(
        sql`(${imageDiffs.projectId}, ${imageDiffs.baseSha256}, ${imageDiffs.headSha256}, ${imageDiffs.optionsKey}) in (${sql.join(tuples, sql`, `)})`,
        eq(imageDiffs.status, 'pending'),
        or(isNull(imageDiffs.claimedAt), lt(imageDiffs.claimedAt, claimExpired())),
      ),
    );
  return { ids: pending.map((p) => p.id), waiting };
}

async function runContext(runId: string) {
  const [run] = await db.select({ id: runs.id, startedAt: runs.startedAt, projectId: runs.projectId }).from(runs).where(eq(runs.id, runId));
  return run ?? null;
}

/** The captures of a run's final attempts, compared as the review page compares them. */
export async function runCaptures(runId: string): Promise<ComparedCapture[]> {
  const run = await runContext(runId);
  if (!run) return [];
  const cps = await checkpointsWhere(eq(reviewCheckpoints.runId, run.id), { runId: run.id, runStartedAt: run.startedAt });
  return cps.flatMap((cp) => cp.captures);
}

export async function planRun(runId: string): Promise<DiffPlan> {
  return planCaptures(await runCaptures(runId));
}

/** Whether any capture wants a comparison nobody planned, or one a worker left behind. */
export function needsPlanning(captures: readonly ComparedCapture[], now = Date.now()): boolean {
  return captures.some((c) => {
    if (!c.diffAgainst || !c.sha256) return false;
    const reference = referenceOf(c);
    if (!reference?.sha256 || reference.sha256 === c.sha256) return false;
    if (!c.diff) return c.attachment.status !== 'expired' && reference.attachment.status !== 'expired';
    // A cached page may hand the dates back serialized.
    return c.diff.status === 'pending' && now - new Date(c.diff.claimedAt ?? c.diff.createdAt).getTime() > CLAIM_TTL_MS;
  });
}

/** The bytes of an image by its hash: the planned attachment, else any stored capture of the same pixels. */
async function readImage(projectId: string, attachmentId: string | null, sha256: string): Promise<Buffer | null> {
  const stored = attachmentId
    ? await db
        .select({ key: attachments.storageKey })
        .from(attachments)
        .where(and(eq(attachments.id, attachmentId), eq(attachments.status, 'uploaded')))
    : [];
  const keys = stored.map((s) => s.key);
  if (keys.length === 0) {
    const other = await db
      .select({ key: attachments.storageKey })
      .from(reviewCaptures)
      .innerJoin(attachments, eq(attachments.id, reviewCaptures.attachmentId))
      .where(and(eq(reviewCaptures.projectId, projectId), eq(reviewCaptures.sha256, sha256), eq(attachments.status, 'uploaded')))
      .limit(3);
    keys.push(...other.map((o) => o.key));
  }
  const storage = getStorage();
  for (const key of keys) {
    const object = await storage.get(key);
    if (!object) continue;
    if (object.size > MAX_IMAGE_BYTES) throw new Error('The image is larger than 100 MB.');
    return Buffer.from(await new Response(object.stream).arrayBuffer());
  }
  return null;
}

export const overlayKey = (projectId: string, diffId: string) => `projects/${projectId}/diffs/${diffId}.png`;

export type MeasureOutcome = 'done' | 'failed' | 'too_large' | 'busy' | 'gone';

/**
 * Measures one planned comparison. `busy`: another worker holds it, or it
 * is measured already; `gone`: the row was deleted. A failure is retried by
 * the caller (the workflow step) up to `MAX_ATTEMPTS`, then recorded.
 */
export async function measureDiff(diffId: string): Promise<MeasureOutcome> {
  const [row] = await db
    .update(imageDiffs)
    .set({ claimedAt: sql`now()`, attempts: sql`${imageDiffs.attempts} + 1` })
    .where(and(eq(imageDiffs.id, diffId), eq(imageDiffs.status, 'pending'), or(isNull(imageDiffs.claimedAt), lt(imageDiffs.claimedAt, claimExpired()))))
    .returning();
  if (!row) {
    const [exists] = await db.select({ id: imageDiffs.id }).from(imageDiffs).where(eq(imageDiffs.id, diffId));
    return exists ? 'busy' : 'gone';
  }
  const started = performance.now();
  const finish = (values: Partial<typeof imageDiffs.$inferInsert>) =>
    db
      .update(imageDiffs)
      .set({ ...values, claimedAt: null, computedAt: sql`now()`, durationMs: Math.round(performance.now() - started) })
      .where(eq(imageDiffs.id, diffId));
  try {
    const [base, head] = await Promise.all([readImage(row.projectId, row.baseAttachmentId, row.baseSha256), readImage(row.projectId, row.headAttachmentId, row.headSha256)]);
    if (!base || !head) {
      await finish({ status: 'failed', error: 'An image is no longer stored.' });
      return 'failed';
    }
    const result = await diffImages(base, head, { threshold: row.options.threshold, ignore: row.options.ignore, maxPixels: maxDiffPixels() });
    let key: string | null = null;
    if (result.overlay) {
      key = overlayKey(row.projectId, row.id);
      await getStorage().put(key, result.overlay, { contentType: 'image/png' });
    }
    await finish({
      status: 'done',
      error: null,
      changedPixels: result.changedPixels,
      totalPixels: result.totalPixels,
      ratio: result.ratio,
      baseWidth: result.base.width,
      baseHeight: result.base.height,
      headWidth: result.head.width,
      headHeight: result.head.height,
      regions: result.regions,
      regionsTruncated: result.regionsTruncated,
      shift: result.shift,
      overlayKey: key,
      overlaySize: result.overlay?.length ?? null,
    });
    return 'done';
  } catch (error) {
    if (error instanceof DiffTooLargeError) {
      await finish({ status: 'too_large', error: error.message, baseWidth: error.base.width, baseHeight: error.base.height, headWidth: error.head.width, headHeight: error.head.height });
      return 'too_large';
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await finish({ status: 'failed', error: (error as Error).message.slice(0, 500) });
      return 'failed';
    }
    // Free the row for the retry at once, instead of after the claim expires.
    await db.update(imageDiffs).set({ claimedAt: null }).where(eq(imageDiffs.id, diffId));
    throw error;
  }
}

/**
 * Approves, for the reviewer, the run's changed images whose measured change
 * against the approved baseline is within the project's tolerance. The
 * decision holds for the exact pixels, like a reviewer's, and says why; the
 * baseline stays the reviewer's image.
 */
export async function approveWithinTolerance(runId: string, captures?: readonly ComparedCapture[]): Promise<number> {
  const list = captures ?? (await runCaptures(runId));
  const settings = await diffSettingsFor(list.map((c) => c.projectId));
  const due = list.filter((c) => c.status === 'changed' && c.withinTolerance && c.sha256 && c.diff && settings.get(c.projectId)?.autoApprove);
  if (due.length === 0) return 0;
  // The same pixels may be due twice in a run (two results of one test); one decision each.
  const unique = new Map(due.map((c) => [`${c.testId}\u0000${c.checkpointName}\u0000${c.variant}\u0000${c.sha256}`, c]));
  await db.insert(reviewDecisions).values(
    [...unique.values()].map((c) => ({
      id: randomUUID(),
      projectId: c.projectId,
      testId: c.testId,
      checkpointName: c.checkpointName,
      variant: c.variant,
      sha256: c.sha256,
      captureId: c.id,
      runId: c.runId,
      decision: 'approved' as const,
      source: 'tolerance' as const,
      comment: toleranceComment({ changedPixels: c.diff!.changedPixels ?? 0, ratio: c.diff!.ratio ?? 0 }, c.baseline?.decision.runNumber ?? null),
      userId: null,
    })),
  );
  return unique.size;
}

/**
 * Deletes comparisons that can no longer be shown — an image they compared
 * was deleted or expired — with their overlays. Run by the retention sweeps.
 */
export async function sweepDiffs({ limit = 500 }: { limit?: number } = {}): Promise<number> {
  const stale = await db
    .select({ id: imageDiffs.id, overlayKey: imageDiffs.overlayKey })
    .from(imageDiffs)
    .leftJoin(sql`${attachments} as base_att`, sql`base_att.id = ${imageDiffs.baseAttachmentId}`)
    .leftJoin(sql`${attachments} as head_att`, sql`head_att.id = ${imageDiffs.headAttachmentId}`)
    .where(
      and(
        sql`${imageDiffs.status} <> 'pending'`,
        sql`(base_att.id is null or head_att.id is null or base_att.status = 'expired' or head_att.status = 'expired')`,
        // Another stored capture of the same pixels keeps the comparison meaningful.
        sql`(not exists (
          select 1 from ${reviewCaptures} rc join ${attachments} a on a.id = rc.attachment_id
          where rc.project_id = ${imageDiffs.projectId} and rc.sha256 = ${imageDiffs.headSha256} and a.status = 'uploaded'
        ) or not exists (
          select 1 from ${reviewCaptures} rc join ${attachments} a on a.id = rc.attachment_id
          where rc.project_id = ${imageDiffs.projectId} and rc.sha256 = ${imageDiffs.baseSha256} and a.status = 'uploaded'
        ))`,
      ),
    )
    .limit(limit);
  if (stale.length === 0) return 0;
  const keys = stale.flatMap((s) => (s.overlayKey ? [s.overlayKey] : []));
  if (keys.length) await getStorage().delete(keys);
  await db.delete(imageDiffs).where(inArray(imageDiffs.id, stale.map((s) => s.id)));
  return stale.length;
}
