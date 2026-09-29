/**
 * Reading review checkpoints: a run's storyboard, the status of each image,
 * what it is compared against, and the project-wide views (the review queue,
 * the screen catalogue).
 *
 * An image's status comes from `review_decisions`: the newest decision about
 * its exact pixels (same checkpoint, variant and hash) if there is one;
 * otherwise `changed` when the checkpoint has an approved baseline, `new` when
 * nobody approved it yet. Only a result's final attempt is reviewed — a retry
 * captures the journey again, and the last capture is the one that counts.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ReviewDecision, ReviewStatus } from '@miguelfranken/ui/lib/review';
import { db } from '@/lib/db/drizzle';
import {
  attachments,
  reviewCaptures,
  reviewCheckpoints,
  reviewDecisions,
  runs,
  testAttempts,
  testResults,
  tests,
  users,
  type Attachment,
} from '@/lib/db/schema';

const thumbs = alias(attachments, 'thumb_attachments');

/** The newest attempt of the checkpoint's result: the one a reviewer looks at. */
const isFinalAttempt = sql`${testAttempts.retry} = (select max(ta2.retry) from ${testAttempts} ta2 where ta2.test_result_id = ${testAttempts.testResultId})`;

export type AttachmentState = Pick<Attachment, 'id' | 'status'>;

export interface CaptureRecord {
  id: string;
  checkpointId: string;
  runId: string;
  testId: string;
  checkpointName: string;
  variant: string;
  sha256: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  deviceScaleFactor: number | null;
  isMobile: boolean | null;
  fullPage: boolean | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
  attachment: AttachmentState;
  thumbnail: AttachmentState | null;
}

export interface DecisionRecord {
  id: string;
  testId: string;
  checkpointName: string;
  variant: string;
  sha256: string | null;
  captureId: string | null;
  decision: ReviewDecision;
  comment: string | null;
  createdAt: Date;
  by: string | null;
  runNumber: number | null;
}

export interface ComparedCapture extends CaptureRecord {
  status: ReviewStatus;
  decision: DecisionRecord | null;
  baseline: { decision: DecisionRecord; capture: CaptureRecord | null } | null;
  previous: { capture: CaptureRecord; runNumber: number } | null;
}

export interface CheckpointRecord {
  id: string;
  runId: string;
  testResultId: string;
  attemptId: string;
  testId: string;
  name: string;
  title: string | null;
  description: string | null;
  sequence: number;
  kind: string | null;
  flow: string | null;
  stepPath: string[];
  url: string | null;
  pageTitle: string | null;
  tags: string[];
  offsetMs: number | null;
  capturedAt: Date | null;
  captures: ComparedCapture[];
}

const captureColumns = {
  id: reviewCaptures.id,
  checkpointId: reviewCaptures.checkpointId,
  runId: reviewCaptures.runId,
  testId: reviewCaptures.testId,
  checkpointName: reviewCaptures.checkpointName,
  variant: reviewCaptures.variant,
  sha256: reviewCaptures.sha256,
  viewportWidth: reviewCaptures.viewportWidth,
  viewportHeight: reviewCaptures.viewportHeight,
  deviceScaleFactor: reviewCaptures.deviceScaleFactor,
  isMobile: reviewCaptures.isMobile,
  fullPage: reviewCaptures.fullPage,
  width: reviewCaptures.width,
  height: reviewCaptures.height,
  createdAt: reviewCaptures.createdAt,
  attachmentId: attachments.id,
  attachmentStatus: attachments.status,
  thumbId: thumbs.id,
  thumbStatus: thumbs.status,
};

type CaptureRow = { [K in keyof typeof captureColumns]: unknown } & Record<string, unknown>;

function toCapture(r: CaptureRow): CaptureRecord {
  return {
    id: r.id as string,
    checkpointId: r.checkpointId as string,
    runId: r.runId as string,
    testId: r.testId as string,
    checkpointName: r.checkpointName as string,
    variant: r.variant as string,
    sha256: (r.sha256 as string | null) ?? null,
    viewportWidth: r.viewportWidth as number | null,
    viewportHeight: r.viewportHeight as number | null,
    deviceScaleFactor: r.deviceScaleFactor as number | null,
    isMobile: r.isMobile as boolean | null,
    fullPage: r.fullPage as boolean | null,
    width: r.width as number | null,
    height: r.height as number | null,
    createdAt: r.createdAt as Date,
    attachment: { id: r.attachmentId as string, status: r.attachmentStatus as Attachment['status'] },
    thumbnail: r.thumbId ? { id: r.thumbId as string, status: r.thumbStatus as Attachment['status'] } : null,
  };
}

async function selectCaptures(where: SQL, orderBy: SQL[] = [sql`${reviewCaptures.createdAt}`]) {
  const rows = await db
    .select(captureColumns)
    .from(reviewCaptures)
    .innerJoin(attachments, eq(attachments.id, reviewCaptures.attachmentId))
    .leftJoin(thumbs, eq(thumbs.id, reviewCaptures.thumbnailAttachmentId))
    .where(where)
    .orderBy(...orderBy);
  return rows.map((r) => toCapture(r as CaptureRow));
}

const identityKey = (c: { testId: string; checkpointName: string; variant: string }) => `${c.testId}\u0000${c.checkpointName}\u0000${c.variant}`;

function identityTuples(captures: readonly { testId: string; checkpointName: string; variant: string }[]) {
  const unique = new Map(captures.map((c) => [identityKey(c), c]));
  return [...unique.values()].map((c) => sql`(${c.testId}::uuid, ${c.checkpointName}, ${c.variant})`);
}

/** Every decision about the captures' checkpoints and variants, newest first. */
async function decisionsFor(captures: readonly CaptureRecord[]): Promise<Map<string, DecisionRecord[]>> {
  const out = new Map<string, DecisionRecord[]>();
  if (captures.length === 0) return out;
  const tuples = identityTuples(captures);
  const rows = await db
    .select({
      id: reviewDecisions.id,
      testId: reviewDecisions.testId,
      checkpointName: reviewDecisions.checkpointName,
      variant: reviewDecisions.variant,
      sha256: reviewDecisions.sha256,
      captureId: reviewDecisions.captureId,
      decision: reviewDecisions.decision,
      comment: reviewDecisions.comment,
      createdAt: reviewDecisions.createdAt,
      by: users.name,
      runNumber: runs.number,
    })
    .from(reviewDecisions)
    .leftJoin(users, eq(users.id, reviewDecisions.userId))
    .leftJoin(runs, eq(runs.id, reviewDecisions.runId))
    .where(sql`(${reviewDecisions.testId}, ${reviewDecisions.checkpointName}, ${reviewDecisions.variant}) in (${sql.join(tuples, sql`, `)})`)
    .orderBy(desc(reviewDecisions.createdAt), desc(reviewDecisions.id));
  for (const r of rows) {
    const key = identityKey(r);
    const list = out.get(key) ?? [];
    list.push(r);
    out.set(key, list);
  }
  return out;
}

/**
 * The newest capture of each checkpoint and variant from a run that started
 * before `before`: the image a reviewer compares with when nothing is approved.
 */
async function previousCaptures(captures: readonly CaptureRecord[], runId: string, before: Date) {
  const out = new Map<string, { capture: CaptureRecord; runNumber: number }>();
  if (captures.length === 0) return out;
  const tuples = identityTuples(captures);
  const rows = await db
    .selectDistinctOn([reviewCaptures.testId, reviewCaptures.checkpointName, reviewCaptures.variant], { ...captureColumns, runNumber: runs.number })
    .from(reviewCaptures)
    .innerJoin(attachments, eq(attachments.id, reviewCaptures.attachmentId))
    .leftJoin(thumbs, eq(thumbs.id, reviewCaptures.thumbnailAttachmentId))
    .innerJoin(runs, eq(runs.id, reviewCaptures.runId))
    .innerJoin(reviewCheckpoints, eq(reviewCheckpoints.id, reviewCaptures.checkpointId))
    .innerJoin(testAttempts, eq(testAttempts.id, reviewCheckpoints.attemptId))
    .where(
      and(
        sql`(${reviewCaptures.testId}, ${reviewCaptures.checkpointName}, ${reviewCaptures.variant}) in (${sql.join(tuples, sql`, `)})`,
        sql`${reviewCaptures.runId} <> ${runId}`,
        sql`${runs.startedAt} < ${before.toISOString()}`,
        isFinalAttempt,
      ),
    )
    .orderBy(reviewCaptures.testId, reviewCaptures.checkpointName, reviewCaptures.variant, desc(runs.startedAt));
  for (const r of rows) out.set(identityKey(r as never), { capture: toCapture(r as CaptureRow), runNumber: r.runNumber });
  return out;
}

/** Status, decision and comparison images for each capture. */
export async function compareCaptures(
  captures: readonly CaptureRecord[],
  context?: { runId: string; runStartedAt: Date },
): Promise<ComparedCapture[]> {
  const decisions = await decisionsFor(captures);
  const baselineIds = new Set<string>();
  const baselines = new Map<string, DecisionRecord>();
  for (const [key, list] of decisions) {
    const approved = list.find((d) => d.decision === 'approved');
    if (approved) {
      baselines.set(key, approved);
      if (approved.captureId) baselineIds.add(approved.captureId);
    }
  }
  const [baselineCaptures, previous] = await Promise.all([
    baselineIds.size ? selectCaptures(inArray(reviewCaptures.id, [...baselineIds])) : Promise.resolve([]),
    context ? previousCaptures(captures, context.runId, context.runStartedAt) : Promise.resolve(new Map<string, { capture: CaptureRecord; runNumber: number }>()),
  ]);
  const baselineById = new Map(baselineCaptures.map((c) => [c.id, c]));

  return captures.map((c) => {
    const key = identityKey(c);
    const list = decisions.get(key) ?? [];
    const exact = list.find((d) => (c.sha256 ? d.sha256 === c.sha256 : d.captureId === c.id)) ?? null;
    const approved = baselines.get(key) ?? null;
    const status: ReviewStatus = exact ? exact.decision : approved ? 'changed' : 'new';
    return {
      ...c,
      status,
      decision: exact,
      baseline: approved ? { decision: approved, capture: approved.captureId ? (baselineById.get(approved.captureId) ?? null) : null } : null,
      previous: previous.get(key) ?? null,
    };
  });
}

/** The checkpoints of some results' final attempts, in order, with their compared captures. */
async function checkpointsWhere(where: SQL, context?: { runId: string; runStartedAt: Date }): Promise<CheckpointRecord[]> {
  const cps = await db
    .select({
      id: reviewCheckpoints.id,
      runId: reviewCheckpoints.runId,
      testResultId: reviewCheckpoints.testResultId,
      attemptId: reviewCheckpoints.attemptId,
      testId: reviewCheckpoints.testId,
      name: reviewCheckpoints.name,
      title: reviewCheckpoints.title,
      description: reviewCheckpoints.description,
      sequence: reviewCheckpoints.sequence,
      kind: reviewCheckpoints.kind,
      flow: reviewCheckpoints.flow,
      stepPath: reviewCheckpoints.stepPath,
      url: reviewCheckpoints.url,
      pageTitle: reviewCheckpoints.pageTitle,
      tags: reviewCheckpoints.tags,
      offsetMs: reviewCheckpoints.offsetMs,
      capturedAt: reviewCheckpoints.capturedAt,
    })
    .from(reviewCheckpoints)
    .innerJoin(testAttempts, eq(testAttempts.id, reviewCheckpoints.attemptId))
    .where(and(where, isFinalAttempt))
    .orderBy(reviewCheckpoints.testResultId, reviewCheckpoints.sequence);
  if (cps.length === 0) return [];
  const raw = await selectCaptures(
    inArray(
      reviewCaptures.checkpointId,
      cps.map((c) => c.id),
    ),
  );
  const compared = await compareCaptures(raw, context);
  const byCheckpoint = new Map<string, ComparedCapture[]>();
  for (const c of compared) {
    const list = byCheckpoint.get(c.checkpointId) ?? [];
    list.push(c);
    byCheckpoint.set(c.checkpointId, list);
  }
  return cps.map((cp) => ({ ...cp, captures: byCheckpoint.get(cp.id) ?? [] }));
}

// ---------------------------------------------------------------- a run

export interface ReviewFlowRecord {
  resultId: string;
  testId: string;
  title: string;
  titlePath: string[];
  file: string;
  line: number;
  project: string;
  outcome: string;
  attemptId: string;
  /** The attempt's video and trace, and Playwright's failure screenshot. */
  video: AttachmentState | null;
  trace: AttachmentState | null;
  failureScreenshot: AttachmentState | null;
  checkpoints: CheckpointRecord[];
}

/**
 * A run's review storyboard: every test with checkpoints, in the order the
 * run summary lists them (file, then title path), each with its checkpoints
 * in capture order.
 */
export async function runReview(run: { id: string; startedAt: Date | string }, filter: { resultId?: string } = {}): Promise<ReviewFlowRecord[]> {
  const where = filter.resultId
    ? and(eq(reviewCheckpoints.runId, run.id), eq(reviewCheckpoints.testResultId, filter.resultId))!
    : eq(reviewCheckpoints.runId, run.id);
  const checkpoints = await checkpointsWhere(where, { runId: run.id, runStartedAt: new Date(run.startedAt) });
  if (checkpoints.length === 0) return [];

  const resultIds = [...new Set(checkpoints.map((c) => c.testResultId))];
  const attemptIds = [...new Set(checkpoints.map((c) => c.attemptId))];
  const [results, media] = await Promise.all([
    db
      .select({
        resultId: testResults.id,
        testId: tests.id,
        title: tests.title,
        titlePath: tests.titlePath,
        file: tests.file,
        line: testResults.line,
        project: tests.pwProject,
        outcome: testResults.outcome,
      })
      .from(testResults)
      .innerJoin(tests, eq(tests.id, testResults.testId))
      .where(inArray(testResults.id, resultIds)),
    db
      .select({ id: attachments.id, status: attachments.status, attemptId: attachments.attemptId, kind: attachments.kind, name: attachments.name })
      .from(attachments)
      .where(and(inArray(attachments.attemptId, attemptIds), inArray(attachments.kind, ['video', 'trace', 'screenshot'])))
      .orderBy(attachments.createdAt, sql`${attachments.ordinal} asc nulls last`),
  ]);

  const byResult = new Map<string, CheckpointRecord[]>();
  for (const c of checkpoints) byResult.set(c.testResultId, [...(byResult.get(c.testResultId) ?? []), c]);

  return results
    .map((r) => {
      const cps = byResult.get(r.resultId) ?? [];
      const attemptId = cps[0].attemptId;
      const own = media.filter((m) => m.attemptId === attemptId);
      const pick = (kind: string) => own.find((m) => m.kind === kind) ?? null;
      return {
        ...r,
        attemptId,
        video: pick('video'),
        trace: pick('trace'),
        // Playwright names its automatic screenshots `screenshot`; review images are `review:…`.
        failureScreenshot: own.find((m) => m.kind === 'screenshot' && m.name === 'screenshot') ?? null,
        checkpoints: cps,
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file) || a.titlePath.join('\u0000').localeCompare(b.titlePath.join('\u0000')) || a.project.localeCompare(b.project));
}

/** Per-status image counts of a run's final attempts, for badges and the queue. */
export async function runReviewCounts(runIds: readonly string[]): Promise<Record<string, Record<ReviewStatus, number>>> {
  const out: Record<string, Record<ReviewStatus, number>> = {};
  if (runIds.length === 0) return out;
  const rows = await db.execute<{ run_id: string; status: ReviewStatus; n: string }>(sql`
    select c.run_id, ${statusSql} as status, count(*)::text as n
    from ${reviewCaptures} c
    join ${reviewCheckpoints} cp on cp.id = c.checkpoint_id
    join ${testAttempts} ta on ta.id = cp.attempt_id
    where c.run_id in (${sql.join(
      runIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      and ta.retry = (select max(ta2.retry) from ${testAttempts} ta2 where ta2.test_result_id = ta.test_result_id)
    group by 1, 2
  `);
  for (const r of rows) {
    const counts = (out[r.run_id] ??= { approved: 0, changes_requested: 0, changed: 0, new: 0 });
    counts[r.status] = Number(r.n);
  }
  return out;
}

/** An image's status in SQL, over a capture aliased `c`: the same rule as `compareCaptures`. */
const statusSql = sql`coalesce(
  (select d.decision::text from ${reviewDecisions} d
    where d.test_id = c.test_id and d.checkpoint_name = c.checkpoint_name and d.variant = c.variant
      and ((c.sha256 is not null and d.sha256 = c.sha256) or (c.sha256 is null and d.capture_id = c.id))
    order by d.created_at desc, d.id desc limit 1),
  case when exists (
    select 1 from ${reviewDecisions} d
    where d.test_id = c.test_id and d.checkpoint_name = c.checkpoint_name and d.variant = c.variant and d.decision = 'approved'
  ) then 'changed' else 'new' end
)`;

// ---------------------------------------------------------------- the project

export interface ReviewQueueRow {
  runId: string;
  number: number;
  status: string;
  branch: string | null;
  commit: string | null;
  commitMessage: string | null;
  prNumber: number | null;
  startedAt: Date;
  counts: Record<ReviewStatus, number>;
}

/** The project's recent runs that carry review checkpoints, newest first, with their counts. */
export async function reviewQueue(projectId: string, { limit = 30, branch }: { limit?: number; branch?: string } = {}): Promise<ReviewQueueRow[]> {
  const recent = await db
    .select({
      runId: runs.id,
      number: runs.number,
      status: runs.status,
      branch: runs.gitBranch,
      commit: runs.gitShortSha,
      commitMessage: runs.gitMessage,
      prNumber: runs.prNumber,
      startedAt: runs.startedAt,
    })
    .from(runs)
    .where(
      and(
        eq(runs.projectId, projectId),
        branch ? eq(runs.gitBranch, branch) : undefined,
        sql`exists (select 1 from ${reviewCaptures} rc where rc.run_id = ${runs.id})`,
      ),
    )
    .orderBy(desc(runs.startedAt))
    .limit(limit);
  const counts = await runReviewCounts(recent.map((r) => r.runId));
  return recent.map((r) => ({ ...r, counts: counts[r.runId] ?? { approved: 0, changes_requested: 0, changed: 0, new: 0 } }));
}

export interface ScreenRecord {
  testId: string;
  title: string;
  titlePath: string[];
  file: string;
  project: string;
  checkpointName: string;
  checkpointTitle: string | null;
  sequence: number;
  variant: string;
  capture: CaptureRecord;
  runNumber: number;
  /** True when a reviewer approved the image; false when it is only the latest one on the default branch. */
  approved: boolean;
  approvedAt: Date | null;
  approvedBy: string | null;
}

/**
 * The product as the suite sees it: for every checkpoint and variant, the
 * newest approved image — or, for a checkpoint nobody approved yet, its newest
 * capture on the default branch.
 */
export async function screenCatalogue(projectId: string, defaultBranch: string, filter: { testIds?: readonly string[] } = {}): Promise<ScreenRecord[]> {
  if (filter.testIds && filter.testIds.length === 0) return [];
  const forTests = filter.testIds ? inArray(reviewDecisions.testId, [...filter.testIds]) : undefined;
  const capturesForTests = filter.testIds ? inArray(reviewCaptures.testId, [...filter.testIds]) : undefined;
  const approved = await db
    .selectDistinctOn([reviewDecisions.testId, reviewDecisions.checkpointName, reviewDecisions.variant], {
      captureId: reviewDecisions.captureId,
      createdAt: reviewDecisions.createdAt,
      by: users.name,
    })
    .from(reviewDecisions)
    .leftJoin(users, eq(users.id, reviewDecisions.userId))
    .where(and(eq(reviewDecisions.projectId, projectId), eq(reviewDecisions.decision, 'approved'), sql`${reviewDecisions.captureId} is not null`, forTests))
    .orderBy(reviewDecisions.testId, reviewDecisions.checkpointName, reviewDecisions.variant, desc(reviewDecisions.createdAt));
  const latestOnDefault = await db
    .selectDistinctOn([reviewCaptures.testId, reviewCaptures.checkpointName, reviewCaptures.variant], { id: reviewCaptures.id })
    .from(reviewCaptures)
    .innerJoin(runs, eq(runs.id, reviewCaptures.runId))
    .where(and(eq(reviewCaptures.projectId, projectId), eq(runs.gitBranch, defaultBranch), capturesForTests))
    .orderBy(reviewCaptures.testId, reviewCaptures.checkpointName, reviewCaptures.variant, desc(runs.startedAt));

  const approvedIds = new Map(approved.map((a) => [a.captureId!, a]));
  const ids = [...new Set([...approvedIds.keys(), ...latestOnDefault.map((l) => l.id)])];
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      ...captureColumns,
      title: tests.title,
      titlePath: tests.titlePath,
      file: tests.file,
      project: tests.pwProject,
      checkpointTitle: reviewCheckpoints.title,
      sequence: reviewCheckpoints.sequence,
      runNumber: runs.number,
    })
    .from(reviewCaptures)
    .innerJoin(attachments, eq(attachments.id, reviewCaptures.attachmentId))
    .leftJoin(thumbs, eq(thumbs.id, reviewCaptures.thumbnailAttachmentId))
    .innerJoin(reviewCheckpoints, eq(reviewCheckpoints.id, reviewCaptures.checkpointId))
    .innerJoin(tests, eq(tests.id, reviewCaptures.testId))
    .innerJoin(runs, eq(runs.id, reviewCaptures.runId))
    .where(inArray(reviewCaptures.id, ids));

  const byIdentity = new Map<string, ScreenRecord>();
  for (const r of rows) {
    const capture = toCapture(r as CaptureRow);
    const decision = approvedIds.get(capture.id);
    const record: ScreenRecord = {
      testId: capture.testId,
      title: r.title,
      titlePath: r.titlePath,
      file: r.file,
      project: r.project,
      checkpointName: capture.checkpointName,
      checkpointTitle: r.checkpointTitle,
      sequence: r.sequence,
      variant: capture.variant,
      capture,
      runNumber: r.runNumber,
      approved: Boolean(decision),
      approvedAt: decision?.createdAt ?? null,
      approvedBy: decision?.by ?? null,
    };
    const key = identityKey(capture);
    const existing = byIdentity.get(key);
    // An approval wins over the default branch's newest capture.
    if (!existing || (!existing.approved && record.approved)) byIdentity.set(key, record);
  }
  return [...byIdentity.values()].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.titlePath.join('\u0000').localeCompare(b.titlePath.join('\u0000')) ||
      a.project.localeCompare(b.project) ||
      a.sequence - b.sequence ||
      a.checkpointName.localeCompare(b.checkpointName) ||
      a.variant.localeCompare(b.variant),
  );
}

/** The captures of one checkpoint and variant across runs, newest first. */
export async function captureHistory(projectId: string, testId: string, checkpointName: string, variant: string, limit = 20) {
  const rows = await db
    .select({ ...captureColumns, runNumber: runs.number, branch: runs.gitBranch, startedAt: runs.startedAt })
    .from(reviewCaptures)
    .innerJoin(attachments, eq(attachments.id, reviewCaptures.attachmentId))
    .leftJoin(thumbs, eq(thumbs.id, reviewCaptures.thumbnailAttachmentId))
    .innerJoin(runs, eq(runs.id, reviewCaptures.runId))
    .where(
      and(
        eq(reviewCaptures.projectId, projectId),
        eq(reviewCaptures.testId, testId),
        eq(reviewCaptures.checkpointName, checkpointName),
        eq(reviewCaptures.variant, variant),
      ),
    )
    .orderBy(desc(runs.startedAt))
    .limit(limit);
  const compared = await compareCaptures(rows.map((r) => toCapture(r as CaptureRow)));
  return compared.map((c, i) => ({ ...c, runNumber: rows[i].runNumber, branch: rows[i].branch, startedAt: rows[i].startedAt }));
}

// ---------------------------------------------------------------- decisions

export class ReviewError extends Error {}

export const MAX_DECISION_CAPTURES = 2000;

/**
 * Records a decision about each capture's image. The captures must belong to
 * the project; ids that do not are ignored, so a forged id decides nothing.
 */
export async function decide(input: {
  projectId: string;
  captureIds: readonly string[];
  decision: ReviewDecision;
  comment?: string | null;
  userId: string | null;
}): Promise<{ decided: number }> {
  const ids = [...new Set(input.captureIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) throw new ReviewError('Nothing to decide about.');
  if (ids.length > MAX_DECISION_CAPTURES) throw new ReviewError(`At most ${MAX_DECISION_CAPTURES} images per decision.`);
  const comment = input.comment?.trim().slice(0, 4000) || null;
  const captures = await db
    .select({
      id: reviewCaptures.id,
      testId: reviewCaptures.testId,
      checkpointName: reviewCaptures.checkpointName,
      variant: reviewCaptures.variant,
      sha256: reviewCaptures.sha256,
      runId: reviewCaptures.runId,
    })
    .from(reviewCaptures)
    .where(and(eq(reviewCaptures.projectId, input.projectId), inArray(reviewCaptures.id, ids)));
  if (captures.length === 0) throw new ReviewError('Those images are not in this project.');
  await db.insert(reviewDecisions).values(
    captures.map((c) => ({
      id: randomUUID(),
      projectId: input.projectId,
      testId: c.testId,
      checkpointName: c.checkpointName,
      variant: c.variant,
      sha256: c.sha256,
      captureId: c.id,
      runId: c.runId,
      decision: input.decision,
      comment,
      userId: input.userId,
    })),
  );
  return { decided: captures.length };
}

/** A capture of the project, with its run and test: what the MCP tools and the API address. */
export async function captureInProject(projectId: string, captureId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(captureId)) return null;
  const [row] = await selectCaptures(and(eq(reviewCaptures.projectId, projectId), eq(reviewCaptures.id, captureId))!);
  if (!row) return null;
  const [compared] = await compareCaptures([row]);
  const [meta] = await db
    .select({ runNumber: runs.number, testResultId: reviewCheckpoints.testResultId, checkpointTitle: reviewCheckpoints.title, testTitle: tests.title })
    .from(reviewCheckpoints)
    .innerJoin(runs, eq(runs.id, reviewCheckpoints.runId))
    .innerJoin(tests, eq(tests.id, reviewCheckpoints.testId))
    .where(eq(reviewCheckpoints.id, row.checkpointId));
  return { capture: compared, ...meta };
}
