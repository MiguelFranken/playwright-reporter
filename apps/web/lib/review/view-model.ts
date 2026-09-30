/**
 * Review records onto the storyboard's view model (`@miguelfranken/ui/lib/review`):
 * artifact URLs, availability, and one row per journey.
 *
 * A suite that captures each checkpoint once per Playwright project (a
 * desktop and a mobile device) records one test per project. Those rows are
 * merged when their variants do not collide, so the storyboard shows the two
 * devices side by side, as it does for resized variants of one test.
 */
import type { ReviewCaseRef, ReviewCaptureView, ReviewCheckpointView, ReviewDiffView, ReviewFlowView, ReviewImage, ReviewStatus } from '@miguelfranken/ui/lib/review';
import { projectAnchor, type ReviewCommentView, type ReviewThreadView } from '@miguelfranken/ui/lib/review-threads';
import { displayableAvatar } from '@/lib/avatars';
import type { DiffRecord } from './diff/lookup';
import { traceViewerUrl } from '@/lib/trace-viewer/url';
import type { AttachmentState, CaptureRecord, CheckpointRecord, ComparedCapture, ReviewFlowRecord } from './queries';
import type { CaptureThread, CommentRecord } from './threads';

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
        }
      : null;
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    anchor: t.position,
    placement: t.placement,
    originRunNumber: t.originRunNumber,
    origin,
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    resolvedBy: t.resolvedBy,
    comments: t.comments.map(toCommentView),
  };
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
    diff: c.diff && c.diffAgainst ? toDiffView(c.diff, c.diffAgainst, c.withinTolerance) : null,
    ignoreRegions: c.ignoreRegions.length ? c.ignoreRegions.map((r) => ({ ...r, pixels: 0 })) : undefined,
    threads: c.threads.map(toThreadView),
    runNumber: c.runNumber ?? null,
  };
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
