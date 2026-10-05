/**
 * Reading review checkpoints: a run's storyboard, the status of each image,
 * what it is compared against, and the review queue.
 *
 * An image's status comes from `review_decisions`: the newest decision about
 * its exact pixels (same checkpoint, variant and hash) if there is one;
 * otherwise `changed` when the checkpoint has an approved baseline; with
 * nothing approved, how it compares with the run before — `unchanged` for the
 * same bytes or a measured comparison with no visible change, `changed` for
 * others, `new` when no earlier run captured the screen (`reviewStatusOf`). Only a result's final attempt is reviewed — a retry
 * captures the journey again, and the last capture is the one that counts.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { emptyReviewCounts, reviewStatusOf, type DecisionSource, type ReviewDecision, type ReviewStatus } from '@miguelfranken/ui/lib/review';
import type { CommentSource } from '@miguelfranken/ui/lib/review-threads';
import { applicableRules, type IgnoreRule, type IgnoreSummary, type RuleValidity } from '@miguelfranken/ui/lib/visual-diff';
import { db } from '@/lib/db/drizzle';
import {
  attachments,
  imageDiffs,
  reviewCaptures,
  reviewCheckpoints,
  reviewDecisions,
  reviewIgnoreRegions,
  reviewThreads,
  runs,
  testAttempts,
  testResults,
  tests,
  users,
  type Attachment,
} from '@/lib/db/schema';
import { EMPTY_RULES, rulesFor } from './diff/ignore';
import { diffSettingsFor, diffsFor, identityKey, measuredChangeOf, pairKey, pairOf, type DiffRecord, type Rect } from './diff/lookup';
import { withinTolerance } from './diff/settings';
import { createThread, resolveThreadsOf, threadsForCaptures, type CaptureThread } from './threads';
import { drawingsForCaptures, type CaptureDrawing } from './drawings';

const thumbs = alias(attachments, 'thumb_attachments');

/** The newest attempt of the checkpoint's result: the one a reviewer looks at. */
export const isFinalAttempt = sql`${testAttempts.retry} = (select max(ta2.retry) from ${testAttempts} ta2 where ta2.test_result_id = ${testAttempts.testResultId})`;

/**
 * The capture's image is still stored, or on its way: the retention sweep
 * has not deleted it and its upload did not fail. Another run's image is
 * offered as a reference only while it holds.
 */
const imageKept = notInArray(attachments.status, ['expired', 'failed']);

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
  /** A tolerance approval's measurement; null on a person's decision and on approvals made before it was recorded. */
  provenance?: { diffId: string; optionsKey: string; ignoreRevision: number } | null;
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
  /** The active rules that fit this image: what the comparison leaves out. */
  ignoreRegions: Rect[];
  /** The checkpoint's rules and what they did here. */
  ignore: IgnoreSummary & { rules: IgnoreRule[]; suspendedRules: { rule: IgnoreRule; validity: RuleValidity }[] };
  /** The same comparison measured before any rule left areas out, when rules apply and it is measured. */
  rawDiff: DiffRecord | null;
  /** A tolerance approval that rested on another rule revision: the image is reviewed again, the decision kept as history. */
  staleTolerance: DecisionRecord | null;
  /** The comment threads the image shows (see `threads.ts`). */
  threads: CaptureThread[];
  /** The drawings on its pixels, on their own (see `drawings.ts`). */
  drawings: CaptureDrawing[];
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
      provenance: reviewDecisions.provenance,
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
 * before `before` and still has its image: what a reviewer compares with when
 * nothing is approved.
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
        imageKept,
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
  // Everything but the baseline images reads from the captures alone: one round trip, with the baselines chained onto the decisions.
  const baselines = new Map<string, DecisionRecord>();
  const decisionsAndBaselines = decisionsFor(captures).then(async (decisions) => {
    const baselineIds = new Set<string>();
    for (const [key, list] of decisions) {
      const approved = list.find((d) => d.decision === 'approved' && d.source === 'human');
      if (approved) {
        baselines.set(key, approved);
        if (approved.captureId) baselineIds.add(approved.captureId);
      }
    }
    const baselineCaptures = baselineIds.size ? await selectCaptures(inArray(reviewCaptures.id, [...baselineIds])) : [];
    return { decisions, baselineCaptures };
  });
  const [{ decisions, baselineCaptures }, previous, threads, drawings, settings, ruleSets] = await Promise.all([
    decisionsAndBaselines,
    context ? previousCaptures(captures, context.runId, context.runStartedAt) : Promise.resolve(new Map<string, { capture: CaptureRecord; runNumber: number }>()),
    threadsForCaptures(captures),
    drawingsForCaptures(captures),
    diffSettingsFor(captures.map((c) => c.projectId)),
    rulesFor(captures),
  ]);
  const baselineById = new Map(baselineCaptures.map((c) => [c.id, c]));

  const compared = captures.map((c) => {
    const key = identityKey(c);
    const list = decisions.get(key) ?? [];
    const approved = baselines.get(key) ?? null;
    const lastHuman = list.find((d) => d.source === 'human') ?? null;
    const request = lastHuman?.decision === 'changes_requested' ? lastHuman : null;
    const baseline = approved ? { decision: approved, capture: approved.captureId ? (baselineById.get(approved.captureId) ?? null) : null } : null;
    const prev = previous.get(key) ?? null;
    // As the viewer compares: the approved image while it still exists, else the run before.
    const reference = baseline?.capture ?? prev?.capture ?? null;
    const set = ruleSets.get(key) ?? EMPTY_RULES;
    const { applied, suspended } = applicableRules(
      set.rules.filter((r) => r.active),
      { width: c.width, height: c.height },
    );
    const ignoreRegions: Rect[] = applied.map(({ x, y, width, height }) => ({ x, y, width, height }));
    const s = settings.get(c.projectId);
    const pair = s ? pairOf(c, reference, s, ignoreRegions) : null;
    const rawPair = s && applied.length ? pairOf(c, reference, s, []) : null;
    // A tolerance approval rests on a measurement; made under other rules or settings, it no longer applies and the image is looked at again.
    const matching = list.filter((d) => (c.sha256 ? d.sha256 === c.sha256 : d.captureId === c.id));
    const applies = (d: DecisionRecord) => d.source !== 'tolerance' || !d.provenance || !pair || d.provenance.optionsKey === pair.optionsKey;
    const exact = matching.find(applies) ?? null;
    const staleTolerance = matching.find((d) => !applies(d)) ?? null;
    // Before the measurement is read: the decision, a new screen, or the same file.
    const status = reviewStatusOf({ decision: exact?.decision, sha256: c.sha256, reference: approved ?? prev?.capture });
    const ignore: ComparedCapture['ignore'] = {
      active: set.rules.filter((r) => r.active).length,
      ever: set.ever,
      applied: applied.length,
      suspended: suspended.length,
      revision: set.revision,
      rawChangedPixels: null,
      suppressedPixels: null,
      rules: set.rules,
      suspendedRules: suspended,
    };
    return {
      compared: {
        ...c,
        status,
        decision: exact,
        baseline,
        previous: prev,
        request,
        diff: null,
        diffAgainst: baseline?.capture ? 'baseline' : prev ? 'previous' : null,
        withinTolerance: false,
        ignoreRegions,
        ignore,
        rawDiff: null,
        staleTolerance,
        threads: threads.get(c.id) ?? [],
        drawings: drawings.get(c.id) ?? [],
      } as ComparedCapture,
      pair,
      rawPair,
    };
  });
  const diffs = await diffsFor(compared.flatMap((x) => [x.pair, x.rawPair].filter((p): p is NonNullable<typeof p> => Boolean(p))));
  return compared.map(({ compared: c, pair, rawPair }) => {
    // Nothing to measure (the same file, no reference, or images without a hash): the status stands as it is.
    if (!pair) return c;
    const diff = diffs.get(pairKey(pair.projectId, pair.baseSha256, pair.headSha256, pair.optionsKey)) ?? null;
    const rawDiff = rawPair ? (diffs.get(pairKey(rawPair.projectId, rawPair.baseSha256, rawPair.headSha256, rawPair.optionsKey)) ?? null) : null;
    const done = diff?.status === 'done' && diff.changedPixels !== null && diff.ratio !== null;
    const sizeChanged = done && (diff.baseWidth !== diff.headWidth || diff.baseHeight !== diff.headHeight);
    const tolerated = done && c.diffAgainst === 'baseline' && withinTolerance({ changedPixels: diff.changedPixels!, ratio: diff.ratio!, sizeChanged }, settings.get(c.projectId)!);
    const rawChanged = rawPair ? (rawDiff?.status === 'done' ? rawDiff.changedPixels : null) : done ? diff.changedPixels : null;
    const suppressed = rawChanged !== null && done ? Math.max(0, rawChanged - diff.changedPixels!) : rawPair ? null : 0;
    // The pixels decide: measured against the reference the status is about — the approved image, else the run before.
    const aboutBaseline = Boolean(c.baseline);
    const measured = (aboutBaseline ? c.diffAgainst === 'baseline' : c.diffAgainst === 'previous') ? measuredChangeOf(diff) : null;
    const status = reviewStatusOf({ decision: c.decision?.decision, sha256: c.sha256, reference: c.baseline?.decision ?? c.previous?.capture, measured });
    return { ...c, status, diff, rawDiff, withinTolerance: tolerated, ignore: { ...c.ignore, rawChangedPixels: rawChanged, suppressedPixels: suppressed } };
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

/** The captures of a run's final attempts, without their comparison: what a run-to-run comparison pairs up. */
export async function capturesOfRun(runId: string): Promise<(CaptureRecord & { checkpoint: Omit<CheckpointRecord, 'captures'> })[]> {
  const cps = await selectCheckpoints(eq(reviewCheckpoints.runId, runId));
  if (cps.length === 0) return [];
  const byId = new Map(cps.map((c) => [c.id, c]));
  const raw = await selectCaptures(
    inArray(
      reviewCaptures.checkpointId,
      cps.map((c) => c.id),
    ),
  );
  return raw.flatMap((c) => (byId.has(c.checkpointId) ? [{ ...c, checkpoint: byId.get(c.checkpointId)! }] : []));
}

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
    const counts = (out[r.run_id] ??= emptyReviewCounts());
    counts[r.status] = Number(r.n);
  }
  return out;
}

/**
 * An image's status in SQL, over a capture aliased `c`: the same rule as
 * `compareCaptures` (`reviewStatusOf`). The decision about its exact pixels;
 * else its reference — the newest approval a person made, else the same
 * screen in the run before, as `previousCaptures` finds it — and the newest
 * measurement of the pair: being measured, no changed pixel, or a change.
 */
const statusSql = sql`coalesce(
  (select d.decision::text from ${reviewDecisions} d
    where d.test_id = c.test_id and d.checkpoint_name = c.checkpoint_name and d.variant = c.variant
      and ((c.sha256 is not null and d.sha256 = c.sha256) or (c.sha256 is null and d.capture_id = c.id))
      -- a tolerance approval made under another rule revision no longer applies
      and (d.source <> 'tolerance' or d.provenance is null
        or (d.provenance->>'ignoreRevision')::int = coalesce((select r.revision from ${reviewIgnoreRegions} r where r.test_id = c.test_id and r.checkpoint_name = c.checkpoint_name and r.variant = c.variant), 0))
    order by d.created_at desc, d.id desc limit 1),
  (select case
      when not ref.found then 'new'
      when c.sha256 is not null and ref.sha256 = c.sha256 then 'unchanged'
      else coalesce(
        (select case
            when m.status = 'pending' then 'measuring'
            when m.status = 'done' and m.changed_pixels = 0 and m.base_width = m.head_width and m.base_height = m.head_height then 'unchanged'
            else 'changed' end
          from ${imageDiffs} m
          where m.project_id = c.project_id and m.base_sha256 = ref.sha256 and m.head_sha256 = c.sha256
          order by m.created_at desc limit 1),
        'changed')
      end
    from (
      select
        coalesce(b.found, p.found, false) as found,
        case when b.found then b.sha256 else p.sha256 end as sha256
      from (
        select true as found, d.sha256 from ${reviewDecisions} d
        where d.test_id = c.test_id and d.checkpoint_name = c.checkpoint_name and d.variant = c.variant and d.decision = 'approved' and d.source = 'human'
        order by d.created_at desc, d.id desc limit 1
      ) b
      full join (
        select true as found, pc.sha256 from ${reviewCaptures} pc
        join ${runs} pr on pr.id = pc.run_id
        join ${attachments} pa on pa.id = pc.attachment_id
        join ${reviewCheckpoints} pcp on pcp.id = pc.checkpoint_id
        join ${testAttempts} pta on pta.id = pcp.attempt_id
        where pc.test_id = c.test_id and pc.checkpoint_name = c.checkpoint_name and pc.variant = c.variant
          and pc.run_id <> c.run_id
          and pr.started_at < (select cr.started_at from ${runs} cr where cr.id = c.run_id)
          and pta.retry = (select max(pta2.retry) from ${testAttempts} pta2 where pta2.test_result_id = pta.test_result_id)
          and pa.status not in ('expired', 'failed')
        order by pr.started_at desc
        limit 1
      ) p on true
    ) ref),
  'new'
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
  return recent.map((r) => ({ ...r, counts: counts[r.runId] ?? emptyReviewCounts() }));
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
 * however old. Only images still stored count: one the retention policy
 * deleted cannot be compared with, so its run is not offered (and does not
 * use up the limit). One capture per run, newest run first; the image's own
 * run is left out. `null` when the capture is not in the project.
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
    imageKept,
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

/** A whole run another run's review can be compared with. */
export interface RunCompareTargetRecord {
  runNumber: number;
  branch: string | null;
  sha: string | null;
  startedAt: Date;
  /** Screens (checkpoint and variant of a test) both runs captured, with the other run's image still stored. */
  screens: number;
}

/**
 * The runs a run's review can be compared with as a whole: the newest
 * `limit` other runs of the project that captured at least one of its
 * screens and still have the image, newest first, each with how many of the
 * run's screens it holds.
 */
export async function runCompareTargetsOf(projectId: string, runId: string, limit = 25): Promise<RunCompareTargetRecord[]> {
  const rows = await db.execute<{ number: number; git_branch: string | null; git_short_sha: string | null; started_at: Date | string; screens: string }>(sql`
    select r.number, r.git_branch, r.git_short_sha, r.started_at, count(distinct (o.test_id, o.checkpoint_name, o.variant)) as screens
    from ${reviewCaptures} o
    join ${runs} r on r.id = o.run_id
    join ${attachments} a on a.id = o.attachment_id
    where o.project_id = ${projectId}
      and o.run_id <> ${runId}
      and a.status not in ('expired', 'failed')
      and exists (
        select 1 from ${reviewCaptures} m
        where m.run_id = ${runId} and m.test_id = o.test_id and m.checkpoint_name = o.checkpoint_name and m.variant = o.variant
      )
    group by r.id
    order by r.started_at desc, r.number desc
    limit ${limit}
  `);
  return rows.map((r) => ({ runNumber: Number(r.number), branch: r.git_branch, sha: r.git_short_sha, startedAt: new Date(r.started_at), screens: Number(r.screens) }));
}

/**
 * Every screen a run captured, by `identityKey`, as its final attempt shows
 * it and only where the image is still stored: what another run's review is
 * compared with. `null` when the project has no such run.
 */
export async function runCapturesByScreen(projectId: string, runNumber: number): Promise<{ runNumber: number; captures: Map<string, CaptureRecord> } | null> {
  const [run] = await db.select({ id: runs.id }).from(runs).where(and(eq(runs.projectId, projectId), eq(runs.number, runNumber))).limit(1);
  if (!run) return null;
  const rows = await db
    .select(captureColumns)
    .from(reviewCaptures)
    .innerJoin(attachments, eq(attachments.id, reviewCaptures.attachmentId))
    .leftJoin(thumbs, eq(thumbs.id, reviewCaptures.thumbnailAttachmentId))
    .innerJoin(reviewCheckpoints, eq(reviewCheckpoints.id, reviewCaptures.checkpointId))
    .innerJoin(testAttempts, eq(testAttempts.id, reviewCheckpoints.attemptId))
    .where(and(eq(reviewCaptures.projectId, projectId), eq(reviewCaptures.runId, run.id), isFinalAttempt, imageKept))
    .orderBy(reviewCaptures.createdAt);
  const captures = new Map<string, CaptureRecord>();
  // The newest capture of a screen wins, as in the run's own review.
  for (const r of rows) captures.set(identityKey(r as never), toCapture(r as CaptureRow));
  return { runNumber, captures };
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
