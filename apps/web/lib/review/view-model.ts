/**
 * Review records onto the storyboard's view model (`@miguelfranken/ui/lib/review`):
 * artifact URLs, availability, and one row per journey.
 *
 * A suite that captures each checkpoint once per Playwright project (a
 * desktop and a mobile device) records one test per project. Those rows are
 * merged when their variants do not collide, so the storyboard shows the two
 * devices side by side, as it does for resized variants of one test.
 */
import type { CompareTargetView, ReviewCaseRef, RunCompareTargetView, ReviewCaptureView, ReviewCheckpointView, ReviewDiffView, ReviewFlowView, ReviewImage, ReviewStatus } from '@miguelfranken/ui/lib/review';
import { projectAnchor, type ReviewCommentView, type ReviewThreadView } from '@miguelfranken/ui/lib/review-threads';
import { projectMarkup, type ReviewDrawingView } from '@miguelfranken/ui/lib/review-markup';
import { displayableAvatar } from '@/lib/avatars';
import type { DiffRecord } from './diff/lookup';
import { traceViewerUrl } from '@/lib/trace-viewer/url';
import type { AttachmentState, CaptureRecord, CheckpointRecord, ComparedCapture, CompareTargetRecord, ReviewFlowRecord, RunCompareTargetRecord } from './queries';
import type { CaptureThread, CommentRecord } from './threads';
import type { CaptureDrawing } from './drawings';

export const artifactUrl = (id: string) => `/api/artifacts/${id}`;

export function toReviewImage(capture: Pick<CaptureRecord, 'attachment' | 'thumbnail' | 'width' | 'height'>): ReviewImage {
  const available = capture.attachment.status === 'uploaded';
  return {
    url: artifactUrl(capture.attachment.id),
    thumbnailUrl: capture.thumbnail?.status === 'uploaded' ? artifactUrl(capture.thumbnail.id) : null,
    width: capture.width,
    height: capture.height,
    available,
    unavailableReason: available ? null : capture.attachment.status,
  };
}

export function toCommentView(c: CommentRecord): ReviewCommentView {
  return {
    id: c.id,
    kind: c.kind,
    body: c.body,
    author: c.authorName ? { name: c.authorName, image: displayableAvatar(c.authorImage) } : null,
    authorId: c.userId,
    agent: c.agentName ? { name: c.agentName } : null,
    source: c.source,
    at: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
  };
}

export function toThreadView(t: CaptureThread): ReviewThreadView {
  // An outdated pin is compared with the image it was placed on, while that image is stored.
  const origin =
    t.placement === 'outdated' && t.originImage && t.originCaptureId
      ? {
          captureId: t.originCaptureId,
          checkpointId: t.originImage.checkpointId,
          image: toReviewImage({ attachment: t.originImage.attachment, thumbnail: null, width: t.origin.width > 1 ? t.origin.width : null, height: t.origin.height > 1 ? t.origin.height : null }),
          anchor: projectAnchor(t.anchor, t.origin, t.origin),
          markup: t.markup ? projectMarkup(t.markup, t.origin, t.origin) : null,
        }
      : null;
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    anchor: t.position,
    markup: t.positionMarkup,
    placement: t.placement,
    originRunNumber: t.originRunNumber,
    origin,
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    resolvedBy: t.resolvedBy,
    comments: t.comments.map(toCommentView),
  };
}

export function toDrawingView(d: CaptureDrawing): ReviewDrawingView {
  return { id: d.id, ...d.position, authorId: d.createdBy, authorName: d.authorName, createdAt: d.createdAt.toISOString() };
}

export const diffOverlayUrl = (id: string) => `/api/diffs/${id}/overlay`;

/** A measured (or pending) comparison as the viewer shows it. */
export function toDiffView(diff: DiffRecord, against: ReviewDiffView['against'], withinTolerance = false): ReviewDiffView {
  const base = diff.baseWidth && diff.baseHeight ? { width: diff.baseWidth, height: diff.baseHeight } : null;
  const head = diff.headWidth && diff.headHeight ? { width: diff.headWidth, height: diff.headHeight } : null;
  return {
    id: diff.id,
    state: diff.status,
    against,
    changedPixels: diff.changedPixels ?? 0,
    totalPixels: diff.totalPixels ?? 0,
    ratio: diff.ratio ?? 0,
    sizeChanged: Boolean(base && head && (base.width !== head.width || base.height !== head.height)),
    base,
    head,
    regions: diff.regions ?? [],
    regionsTruncated: diff.regionsTruncated,
    overlayUrl: diff.status === 'done' && diff.overlayKey ? diffOverlayUrl(diff.id) : null,
    shift: diff.shift,
    withinTolerance,
    error: diff.status === 'failed' || diff.status === 'too_large' ? diff.error : null,
  };
}

/** The raw measurement beside the effective one, when the rules changed what counts. */
function withRaw(view: ReviewDiffView, raw: DiffRecord | null): ReviewDiffView {
  if (!raw) return view;
  return { ...view, raw: { state: raw.status, changedPixels: raw.changedPixels ?? 0, ratio: raw.ratio ?? 0, regions: raw.regions ?? [], overlayUrl: raw.status === 'done' && raw.overlayKey ? diffOverlayUrl(raw.id) : null } };
}

/** A comparison planned (or about to be) and not measured yet. */
export const pendingDiff = (against: ReviewDiffView['against'], id = ''): ReviewDiffView => ({ id, state: 'pending', against, changedPixels: 0, totalPixels: 0, ratio: 0, sizeChanged: false, regions: [] });

export function toCaptureView(c: ComparedCapture): ReviewCaptureView {
  return {
    id: c.id,
    variant: c.variant,
    status: c.status,
    image: toReviewImage(c),
    viewport: c.viewportWidth && c.viewportHeight ? { width: c.viewportWidth, height: c.viewportHeight } : null,
    deviceScaleFactor: c.deviceScaleFactor,
    isMobile: c.isMobile,
    fullPage: c.fullPage,
    decision: c.decision
      ? { decision: c.decision.decision, by: c.decision.by, at: c.decision.createdAt.toISOString(), comment: c.decision.comment, runNumber: c.decision.runNumber, source: c.decision.source }
      : null,
    baseline: c.baseline?.capture
      ? {
          captureId: c.baseline.capture.id,
          image: toReviewImage(c.baseline.capture),
          runNumber: c.baseline.decision.runNumber,
          same: Boolean(c.sha256 && c.baseline.capture.sha256 === c.sha256),
          approvedAt: c.baseline.decision.createdAt.toISOString(),
          approvedBy: c.baseline.decision.by,
        }
      : null,
    previous: c.previous
      ? { captureId: c.previous.capture.id, image: toReviewImage(c.previous.capture), runNumber: c.previous.runNumber, same: Boolean(c.sha256 && c.previous.capture.sha256 === c.sha256) }
      : null,
    request:
      c.request && !c.request.comment
        ? {
            by: c.request.by,
            at: c.request.createdAt.toISOString(),
            runNumber: c.request.runNumber,
            captureId: c.request.captureId,
            onThisImage: c.request.captureId === c.id || Boolean(c.request.sha256 && c.request.sha256 === c.sha256),
          }
        : null,
    diff: c.diff && c.diffAgainst ? withRaw(toDiffView(c.diff, c.diffAgainst, c.withinTolerance), c.rawDiff) : null,
    ignoreRegions: c.ignoreRegions.length ? c.ignoreRegions.map((r) => ({ ...r, pixels: 0 })) : undefined,
    ignore: c.ignore.ever ? { ...c.ignore } : null,
    staleTolerance: c.staleTolerance
      ? { decision: c.staleTolerance.decision, by: c.staleTolerance.by, at: c.staleTolerance.createdAt.toISOString(), comment: c.staleTolerance.comment, runNumber: c.staleTolerance.runNumber, source: c.staleTolerance.source }
      : null,
    threads: c.threads.map(toThreadView),
    drawings: c.drawings?.length ? c.drawings.map(toDrawingView) : undefined,
    runNumber: c.runNumber ?? null,
  };
}

/** Another run's capture of the screen, as the viewer's "Compare with" lists it; `sha256` is the image it would be compared with. */
export function toCompareTargetView(t: CompareTargetRecord, sha256: string | null): CompareTargetView {
  return {
    captureId: t.capture.id,
    runNumber: t.runNumber,
    image: toReviewImage(t.capture),
    same: Boolean(sha256 && t.capture.sha256 === sha256),
    branch: t.branch,
    at: t.startedAt.toISOString(),
    openThreads: t.openThreads,
  };
}

/** Another run, as the run review's "Compare with" lists it. */
export function toRunCompareTargetView(t: RunCompareTargetRecord): RunCompareTargetView {
  return { runNumber: t.runNumber, branch: t.branch, sha: t.sha, at: t.startedAt.toISOString(), screens: t.screens };
}

export function toCheckpointView(cp: CheckpointRecord): ReviewCheckpointView {
  return {
    id: cp.id,
    name: cp.name,
    title: cp.title,
    description: cp.description,
    sequence: cp.sequence,
    kind: cp.kind,
    stepPath: cp.stepPath,
    url: cp.url,
    pageTitle: cp.pageTitle,
    offsetMs: cp.offsetMs,
    tags: cp.tags,
    captures: cp.captures.map(toCaptureView),
  };
}

const media = (a: AttachmentState | null) => (a && a.status === 'uploaded' ? artifactUrl(a.id) : null);

/** Failure first: a merged row is as bad as its worst device. */
const OUTCOME_RANK = ['failed', 'timedout', 'interrupted', 'flaky', 'running', 'passed', 'skipped'];

/** Test cases by test id, as `casesOfTests` answers, and where a case's page is. */
export interface CaseLinks {
  byTest: Record<string, Omit<ReviewCaseRef, 'href'>[]>;
  href: (key: string) => string;
}

/** `TC-12` → the case's page. */
export const caseHref = (hrefs: { testCase: (n: number) => string }) => (key: string) => hrefs.testCase(Number(key.replace(/^TC-/, '')));

const casesOf = (testId: string, links?: CaseLinks): ReviewCaseRef[] =>
  (links?.byTest[testId] ?? []).map((c) => ({ ...c, href: links!.href(c.key) }));

export function toFlowViews(records: readonly ReviewFlowRecord[], resultHref: (resultId: string) => string, links?: CaseLinks): ReviewFlowView[] {
  const originOf = (r: ReviewFlowRecord, cp: CheckpointRecord) => {
    const o = cp.testResultId === r.resultId ? null : r.origins?.[cp.testResultId];
    return o ? { runNumber: o.runNumber, resultHref: resultHref(cp.testResultId), videoUrl: media(o.video) } : null;
  };
  const flows = records.map(
    (r): ReviewFlowView => ({
      resultId: r.resultId,
      testId: r.testId,
      cases: casesOf(r.testId, links),
      title: r.title,
      titlePath: r.titlePath,
      file: r.file,
      line: r.line,
      project: r.project || null,
      outcome: r.outcome,
      runNumber: r.runNumber,
      flow: r.checkpoints.find((c) => c.flow)?.flow ?? null,
      resultHref: resultHref(r.resultId),
      videoUrl: media(r.video),
      traceUrl: r.trace?.status === 'uploaded' ? traceViewerUrl(artifactUrl(r.trace.id)) : null,
      failureImage: r.failureScreenshot
        ? { url: artifactUrl(r.failureScreenshot.id), available: r.failureScreenshot.status === 'uploaded', unavailableReason: r.failureScreenshot.status === 'uploaded' ? null : r.failureScreenshot.status }
        : null,
      checkpoints: r.checkpoints.map((cp) => ({ ...toCheckpointView(cp), origin: originOf(r, cp) })),
    }),
  );
  return mergeProjects(flows);
}

/** Rows of the same test in several Playwright projects, as one row when their variants are distinct. */
export function mergeProjects(flows: readonly ReviewFlowView[]): ReviewFlowView[] {
  const out: ReviewFlowView[] = [];
  const byKey = new Map<string, ReviewFlowView>();
  for (const flow of flows) {
    const key = `${flow.file}\u0000${flow.titlePath.join('\u0000')}`;
    const existing = byKey.get(key);
    const variants = (f: ReviewFlowView) => new Set(f.checkpoints.flatMap((c) => c.captures.map((cap) => cap.variant)));
    if (existing && ![...variants(flow)].some((v) => variants(existing).has(v))) {
      const merged: ReviewFlowView = {
        ...existing,
        project: [existing.project, flow.project].filter(Boolean).join(', ') || null,
        outcome: OUTCOME_RANK.indexOf(flow.outcome) < OUTCOME_RANK.indexOf(existing.outcome) ? flow.outcome : existing.outcome,
        failureImage: existing.failureImage ?? flow.failureImage,
        videoUrl: existing.videoUrl ?? flow.videoUrl,
        traceUrl: existing.traceUrl ?? flow.traceUrl,
        runNumber: Math.max(existing.runNumber ?? 0, flow.runNumber ?? 0) || null,
        checkpoints: mergeCheckpoints(existing.checkpoints, flow.checkpoints),
        cases: [...(existing.cases ?? []), ...(flow.cases ?? []).filter((c) => !existing.cases?.some((e) => e.key === c.key))],
      };
      byKey.set(key, merged);
      out[out.indexOf(existing)] = merged;
      continue;
    }
    byKey.set(key, flow);
    out.push(flow);
  }
  return out;
}

function mergeCheckpoints(a: readonly ReviewCheckpointView[], b: readonly ReviewCheckpointView[]): ReviewCheckpointView[] {
  const merged = a.map((c) => ({ ...c, captures: [...c.captures] }));
  for (const cp of b) {
    const same = merged.find((m) => m.name === cp.name);
    if (same) {
      same.captures.push(...cp.captures);
      same.aliases = [...(same.aliases ?? []), cp.id, ...(cp.aliases ?? [])];
    }
    else merged.push({ ...cp, sequence: merged.length });
  }
  return merged;
}

/** Flows from several runs (the library's): each links to the result of its own run. */
export function flowViewsAcrossRuns(records: readonly ReviewFlowRecord[], hrefs: { result: (runNumber: number, resultId: string) => string }, links?: CaseLinks): ReviewFlowView[] {
  const runOf = new Map(records.flatMap((r) => [[r.resultId, r.runNumber] as const, ...Object.entries(r.origins ?? {}).map(([id, o]) => [id, o.runNumber] as const)]));
  return toFlowViews(records, (resultId) => hrefs.result(runOf.get(resultId)!, resultId), links);
}
