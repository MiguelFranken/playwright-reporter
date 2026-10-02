/**
 * Reading review checkpoints: a run's storyboard, the status of each image,
 * what it is compared against, and the review queue.
 *
 * An image's status comes from `review_decisions`: the newest decision about
 * its exact pixels (same checkpoint, variant and hash) if there is one;
 * otherwise `changed` when the checkpoint has an approved baseline, `new` when
 * nobody approved it yet. Only a result's final attempt is reviewed — a retry
 * captures the journey again, and the last capture is the one that counts.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DecisionSource, ReviewDecision, ReviewStatus } from '@miguelfranken/ui/lib/review';
import type { CommentSource } from '@miguelfranken/ui/lib/review-threads';
import { db } from '@/lib/db/drizzle';
import {
  attachments,
  reviewCaptures,
  reviewCheckpoints,
  reviewDecisions,
  reviewThreads,
  runs,
  testAttempts,
  testResults,
  tests,
  users,
  type Attachment,
} from '@/lib/db/schema';
import { diffSettingsFor, diffsFor, identityKey, ignoreRegionsFor, pairKey, pairOf, type DiffRecord, type Rect } from './diff/lookup';
import { withinTolerance } from './diff/settings';
import { createThread, resolveThreadsOf, threadsForCaptures, type CaptureThread } from './threads';

const thumbs = alias(attachments, 'thumb_attachments');

/** The newest attempt of the checkpoint's result: the one a reviewer looks at. */
export const isFinalAttempt = sql`${testAttempts.retry} = (select max(ta2.retry) from ${testAttempts} ta2 where ta2.test_result_id = ${testAttempts.testResultId})`;

export type AttachmentState = Pick<Attachment, 'id' | 'status'>;

export interface CaptureRecord {
  id: string;
  projectId: string;
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
  source: DecisionSource;
  comment: string | null;
  createdAt: Date;
  by: string | null;
  runNumber: number | null;
}

export interface ComparedCapture extends CaptureRecord {
  status: ReviewStatus;
  decision: DecisionRecord | null;
  /** The newest approval a reviewer made; a tolerance approval never becomes the baseline. */
  baseline: { decision: DecisionRecord; capture: CaptureRecord | null } | null;
  previous: { capture: CaptureRecord; runNumber: number } | null;
  /**
   * A change request that still stands on the checkpoint and variant: the
   * newest decision a person made about it asked for changes. It may be about
   * these pixels (still waiting) or an earlier image (changed since: to
   * verify). Kept here because a request without a comment has no thread, and
   * would otherwise vanish once a new image replaces the one it was about.
   */
  request: DecisionRecord | null;
  /** The measured comparison with the reference the viewer shows (the baseline, else the run before). */
  diff: DiffRecord | null;
  diffAgainst: 'baseline' | 'previous' | null;
  /** Measured, against the baseline, and under the project's tolerance. */
  withinTolerance: boolean;
  ignoreRegions: Rect[];
  /** The comment threads the image shows (see `threads.ts`). */
  threads: CaptureThread[];
  /** The run it was captured in, where images of several runs are shown together (the library). */
  runNumber?: number;
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
  projectId: reviewCaptures.projectId,
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
    projectId: r.projectId as string,
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
      source: reviewDecisions.source,
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
    const approved = list.find((d) => d.decision === 'approved' && d.source === 'human');
    if (approved) {
      baselines.set(key, approved);
      if (approved.captureId) baselineIds.add(approved.captureId);
    }
  }
  const [baselineCaptures, previous, threads] = await Promise.all([
    baselineIds.size ? selectCaptures(inArray(reviewCaptures.id, [...baselineIds])) : Promise.resolve([]),
    context ? previousCaptures(captures, context.runId, context.runStartedAt) : Promise.resolve(new Map<string, { capture: CaptureRecord; runNumber: number }>()),
    threadsForCaptures(captures),
  ]);
  const baselineById = new Map(baselineCaptures.map((c) => [c.id, c]));

  const [settings, ignores] = await Promise.all([diffSettingsFor(captures.map((c) => c.projectId)), ignoreRegionsFor(captures)]);
  const compared = captures.map((c) => {
    const key = identityKey(c);
    const list = decisions.get(key) ?? [];
    const exact = list.find((d) => (c.sha256 ? d.sha256 === c.sha256 : d.captureId === c.id)) ?? null;
    const approved = baselines.get(key) ?? null;
    const status: ReviewStatus = exact ? exact.decision : approved ? 'changed' : 'new';
    const lastHuman = list.find((d) => d.source === 'human') ?? null;
    const request = lastHuman?.decision === 'changes_requested' ? lastHuman : null;
    const baseline = approved ? { decision: approved, capture: approved.captureId ? (baselineById.get(approved.captureId) ?? null) : null } : null;
    const prev = previous.get(key) ?? null;
    // As the viewer compares: the approved image while it still exists, else the run before.
    const reference = baseline?.capture ?? prev?.capture ?? null;
    const ignoreRegions = ignores.get(key) ?? [];
    const pair = settings.has(c.projectId) ? pairOf(c, reference, settings.get(c.projectId)!, ignoreRegions) : null;
    return {
      compared: { ...c, status, decision: exact, baseline, previous: prev, request, diff: null, diffAgainst: baseline?.capture ? 'baseline' : prev ? 'previous' : null, withinTolerance: false, ignoreRegions, threads: threads.get(c.id) ?? [] } as ComparedCapture,
      pair,
    };
  });
  const diffs = await diffsFor(compared.flatMap((x) => (x.pair ? [x.pair] : [])));
  return compared.map(({ compared: c, pair }) => {
    if (!pair) return c;
    const diff = diffs.get(pairKey(pair.projectId, pair.baseSha256, pair.headSha256, pair.optionsKey)) ?? null;
    const done = diff?.status === 'done' && diff.changedPixels !== null && diff.ratio !== null;
    const sizeChanged = done && (diff.baseWidth !== diff.headWidth || diff.baseHeight !== diff.headHeight);
    const tolerated = done && c.diffAgainst === 'baseline' && withinTolerance({ changedPixels: diff.changedPixels!, ratio: diff.ratio!, sizeChanged }, settings.get(c.projectId)!);
    return { ...c, diff, withinTolerance: tolerated };
  });
}

export const checkpointColumns = {
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
};

/** Checkpoint rows without their captures. */
export async function selectCheckpoints(where: SQL): Promise<Omit<CheckpointRecord, 'captures'>[]> {
  return db
    .select(checkpointColumns)
    .from(reviewCheckpoints)
    .innerJoin(testAttempts, eq(testAttempts.id, reviewCheckpoints.attemptId))
    .where(and(where, isFinalAttempt))
    .orderBy(reviewCheckpoints.testResultId, reviewCheckpoints.sequence);
}

/** Captures by id, without their comparison. */
export const capturesById = (ids: readonly string[]) => (ids.length ? selectCaptures(inArray(reviewCaptures.id, [...ids])) : Promise.resolve([]));

/** The checkpoints of some results' final attempts, in order, with their compared captures. */
export async function checkpointsWhere(where: SQL, context?: { runId: string; runStartedAt: Date }): Promise<CheckpointRecord[]> {
  const cps = await selectCheckpoints(where);
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
  /** The run the result belongs to: one run for a run's review, several in the library. */
  runNumber: number;
  runStartedAt: Date;
  attemptId: string;
  /** The attempt's video and trace, and Playwright's failure screenshot. */
  video: AttachmentState | null;
  trace: AttachmentState | null;
  failureScreenshot: AttachmentState | null;
  checkpoints: CheckpointRecord[];
  /**
   * The library's flows gather each checkpoint from the newest run that
   * captured it: the other results their checkpoints come from, by result id.
   */
  origins?: Record<string, FlowOrigin>;
}

/** A result some of a library flow's checkpoints come from, when it is not the flow's own. */
export interface FlowOrigin {
  runNumber: number;
  runStartedAt: Date;
  outcome: string;
  video: AttachmentState | null;
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
  return assembleFlows(checkpoints);
}

/**
 * Checkpoints as flows: one per result, with the test, its outcome, the
 * attempt's video, trace and failure screenshot, in the order the run
 * summary lists them (file, then title path).
 *
 * `byTest` makes one flow per test instead, for checkpoints gathered from
 * several runs (the library's): the flow is the newest result's, in the
 * order given, and `origins` says where the older checkpoints come from.
 */
export async function assembleFlows(checkpoints: readonly CheckpointRecord[], { byTest = false }: { byTest?: boolean } = {}): Promise<ReviewFlowRecord[]> {
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
        runNumber: runs.number,
        runStartedAt: runs.startedAt,
      })
      .from(testResults)
      .innerJoin(tests, eq(tests.id, testResults.testId))
      .innerJoin(runs, eq(runs.id, testResults.runId))
      .where(inArray(testResults.id, resultIds)),
    db
      .select({ id: attachments.id, status: attachments.status, attemptId: attachments.attemptId, kind: attachments.kind, name: attachments.name })
      .from(attachments)
      .where(and(inArray(attachments.attemptId, attemptIds), inArray(attachments.kind, ['video', 'trace', 'screenshot'])))
      .orderBy(attachments.createdAt, sql`${attachments.ordinal} asc nulls last`),
  ]);

  const mediaOf = (attemptId: string) => {
    const own = media.filter((m) => m.attemptId === attemptId);
    const pick = (kind: string) => own.find((m) => m.kind === kind) ?? null;
    // Playwright names its automatic screenshots `screenshot`; review images are `review:…`.
    return { video: pick('video'), trace: pick('trace'), failureScreenshot: own.find((m) => m.kind === 'screenshot' && m.name === 'screenshot') ?? null };
  };
  const order = (a: { file: string; titlePath: string[]; project: string }, b: typeof a) =>
    a.file.localeCompare(b.file) || a.titlePath.join('\u0000').localeCompare(b.titlePath.join('\u0000')) || a.project.localeCompare(b.project);

  const groupOf = (c: CheckpointRecord) => (byTest ? c.testId : c.testResultId);
  const groups = new Map<string, CheckpointRecord[]>();
  for (const c of checkpoints) groups.set(groupOf(c), [...(groups.get(groupOf(c)) ?? []), c]);
  const resultById = new Map(results.map((r) => [r.resultId, r]));
  const newestFirst = (a: (typeof results)[number], b: (typeof results)[number]) => +new Date(b.runStartedAt) - +new Date(a.runStartedAt) || b.runNumber - a.runNumber;

  const flows: ReviewFlowRecord[] = [];
  for (const cps of groups.values()) {
    const own = [...new Set(cps.map((c) => c.testResultId))].flatMap((id) => resultById.get(id) ?? []).sort(newestFirst);
    const head = own[0];
    if (!head) continue;
    const attemptId = cps.find((c) => c.testResultId === head.resultId)!.attemptId;
    const origins: Record<string, FlowOrigin> = {};
    for (const r of own.slice(1)) {
      const attempt = cps.find((c) => c.testResultId === r.resultId)!.attemptId;
      origins[r.resultId] = { runNumber: r.runNumber, runStartedAt: r.runStartedAt, outcome: r.outcome, video: mediaOf(attempt).video };
    }
    flows.push({ ...head, attemptId, ...mediaOf(attemptId), checkpoints: cps, ...(own.length > 1 ? { origins } : {}) });
  }
  return flows.sort(order);
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
    where d.test_id = c.test_id and d.checkpoint_name = c.checkpoint_name and d.variant = c.variant and d.decision = 'approved' and d.source = 'human'
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
  prTitle: string | null;
  startedAt: Date;
  counts: Record<ReviewStatus, number>;
}

/**
 * The project's recent runs that carry review checkpoints, newest first, with
 * their counts. The queue shows one row per pull request or branch, so it
 * reads enough runs to find the newest of each.
 */
export async function reviewQueue(projectId: string, { limit = 200, branch }: { limit?: number; branch?: string } = {}): Promise<ReviewQueueRow[]> {
  const recent = await db
    .select({
      runId: runs.id,
      number: runs.number,
      status: runs.status,
      branch: runs.gitBranch,
      commit: runs.gitShortSha,
      commitMessage: runs.gitMessage,
      prNumber: runs.prNumber,
      prTitle: sql<string | null>`${runs.git}->>'prTitle'`,
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

/** Another run's capture of a screen, offered to compare an image with. */
export interface CompareTargetRecord {
  capture: CaptureRecord;
  runNumber: number;
  branch: string | null;
  startedAt: Date;
  /** Open threads placed on this capture. */
  openThreads: number;
}

/**
 * What an image can be compared with besides its baseline: the newest
 * `limit` other runs that captured the same screen (checkpoint and variant),
 * plus every earlier capture of it that still has open comment threads,
 * however old. One capture per run, newest run first; the image's own run is
 * left out. `null` when the capture is not in the project.
 */
export async function compareTargetsOf(projectId: string, captureId: string, limit = 10): Promise<{ sha256: string | null; targets: CompareTargetRecord[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(captureId)) return null;
  const [self] = await db
    .select({ testId: reviewCaptures.testId, checkpointName: reviewCaptures.checkpointName, variant: reviewCaptures.variant, sha256: reviewCaptures.sha256, runId: reviewCaptures.runId })
    .from(reviewCaptures)
    .where(and(eq(reviewCaptures.projectId, projectId), eq(reviewCaptures.id, captureId)));
  if (!self) return null;
  const open = await db
    .select({ captureId: reviewThreads.originCaptureId, count: sql<number>`count(*)::int` })
    .from(reviewThreads)
    .where(
      and(
        eq(reviewThreads.projectId, projectId),
        eq(reviewThreads.testId, self.testId),
        eq(reviewThreads.checkpointName, self.checkpointName),
        eq(reviewThreads.variant, self.variant),
        eq(reviewThreads.status, 'open'),
        isNotNull(reviewThreads.originCaptureId),
      ),
    )
    .groupBy(reviewThreads.originCaptureId);
  const openBy = new Map(open.map((r) => [r.captureId!, Number(r.count)]));
  const sameScreen = and(
    eq(reviewCaptures.projectId, projectId),
    eq(reviewCaptures.testId, self.testId),
    eq(reviewCaptures.checkpointName, self.checkpointName),
    eq(reviewCaptures.variant, self.variant),
    ne(reviewCaptures.runId, self.runId),
  )!;
  const select = (where: SQL, max: number) =>
    db
      .select({ ...captureColumns, runNumber: runs.number, branch: runs.gitBranch, startedAt: runs.startedAt })
      .from(reviewCaptures)
      .innerJoin(attachments, eq(attachments.id, reviewCaptures.attachmentId))
      .leftJoin(thumbs, eq(thumbs.id, reviewCaptures.thumbnailAttachmentId))
      .innerJoin(runs, eq(runs.id, reviewCaptures.runId))
      .innerJoin(reviewCheckpoints, eq(reviewCheckpoints.id, reviewCaptures.checkpointId))
      .innerJoin(testAttempts, eq(testAttempts.id, reviewCheckpoints.attemptId))
      .where(where)
      .orderBy(desc(runs.startedAt), desc(reviewCaptures.createdAt))
      .limit(max);
  const [recent, commented] = await Promise.all([
    // A run can capture a screen once per attempt; the final one is what was reviewed.
    select(and(sameScreen, isFinalAttempt)!, limit * 2),
    openBy.size ? select(and(sameScreen, inArray(reviewCaptures.id, [...openBy.keys()]))!, 100) : Promise.resolve([]),
  ]);
  const byRun = new Map<string, CompareTargetRecord>();
  const add = (r: (typeof recent)[number]) => {
    const record: CompareTargetRecord = { capture: toCapture(r as CaptureRow), runNumber: r.runNumber, branch: r.branch, startedAt: r.startedAt, openThreads: openBy.get(r.id) ?? 0 };
    const existing = byRun.get(record.capture.runId);
    // One per run: the one with comments wins, since that is why it is listed.
    if (!existing || record.openThreads > existing.openThreads) byRun.set(record.capture.runId, record);
  };
  const recentRuns = new Set<string>();
  for (const r of recent) {
    if (!recentRuns.has(r.runId) && recentRuns.size >= limit) continue;
    recentRuns.add(r.runId);
    add(r);
  }
  for (const r of commented) add(r);
  const targets = [...byRun.values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.runNumber - a.runNumber);
  return { sha256: self.sha256, targets };
}

// ---------------------------------------------------------------- decisions

export class ReviewError extends Error {}

export const MAX_DECISION_CAPTURES = 2000;

/**
 * Records a decision about each capture's image. The captures must belong to
 * the project; ids that do not are ignored, so a forged id decides nothing.
 *
 * A change request's comment also opens a whole-image thread on each image,
 * where the conversation about it continues. An approval with
 * `resolveThreads` resolves the images' open threads.
 */
export async function decide(input: {
  projectId: string;
  captureIds: readonly string[];
  decision: ReviewDecision;
  comment?: string | null;
  userId: string | null;
  resolveThreads?: boolean;
  /** Where the change request's comment was written, for its thread. */
  commentSource?: CommentSource;
  /** The AI agent deciding for `userId`, named on the comments it writes. */
  agentName?: string | null;
}): Promise<{ decided: number; resolvedThreads: number }> {
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
  const author = { userId: input.userId, source: input.commentSource ?? 'app', agentName: input.agentName ?? null };
  if (input.decision === 'changes_requested' && comment) {
    const seen = new Set<string>();
    for (const c of captures) {
      const key = `${c.testId}\u0000${c.checkpointName}\u0000${c.variant}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await createThread({ projectId: input.projectId, captureId: c.id, anchor: { kind: 'image', x: 0, y: 0 }, body: comment, author });
    }
  }
  const { resolved } =
    input.decision === 'approved' && input.resolveThreads ? await resolveThreadsOf({ projectId: input.projectId, captureIds: captures.map((c) => c.id), author }) : { resolved: 0 };
  return { decided: captures.length, resolvedThreads: resolved };
}

/** A capture of the project, with its run and test: what the MCP tools and the API address. */
export async function captureInProject(projectId: string, captureId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(captureId)) return null;
  const [row] = await selectCaptures(and(eq(reviewCaptures.projectId, projectId), eq(reviewCaptures.id, captureId))!);
  if (!row) return null;
  const [run] = await db.select({ startedAt: runs.startedAt }).from(runs).where(eq(runs.id, row.runId));
  const [compared] = await compareCaptures([row], run ? { runId: row.runId, runStartedAt: run.startedAt } : undefined);
  const [meta] = await db
    .select({ runNumber: runs.number, testResultId: reviewCheckpoints.testResultId, checkpointTitle: reviewCheckpoints.title, testTitle: tests.title })
    .from(reviewCheckpoints)
    .innerJoin(runs, eq(runs.id, reviewCheckpoints.runId))
    .innerJoin(tests, eq(tests.id, reviewCheckpoints.testId))
    .where(eq(reviewCheckpoints.id, row.checkpointId));
  return { capture: compared, ...meta };
}
