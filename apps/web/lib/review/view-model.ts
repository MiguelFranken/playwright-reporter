/**
 * Review records onto the storyboard's view model (`@miguelfranken/ui/lib/review`):
 * artifact URLs, availability, and one row per journey.
 *
 * A suite that captures each checkpoint once per Playwright project (a
 * desktop and a mobile device) records one test per project. Those rows are
 * merged when their variants do not collide, so the storyboard shows the two
 * devices side by side, as it does for resized variants of one test.
 */
import type { ReviewCaseRef, ReviewCaptureView, ReviewCheckpointView, ReviewFlowView, ReviewImage, ReviewStatus } from '@miguelfranken/ui/lib/review';
import type { ReviewCommentView, ReviewThreadView } from '@miguelfranken/ui/lib/review-threads';
import { displayableAvatar } from '@/lib/avatars';
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
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    anchor: t.position,
    placement: t.placement,
    originRunNumber: t.originRunNumber,
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    resolvedBy: t.resolvedBy,
    comments: t.comments.map(toCommentView),
  };
}

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
      ? { decision: c.decision.decision, by: c.decision.by, at: c.decision.createdAt.toISOString(), comment: c.decision.comment, runNumber: c.decision.runNumber }
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
    threads: c.threads.map(toThreadView),
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
      flow: r.checkpoints.find((c) => c.flow)?.flow ?? null,
      resultHref: resultHref(r.resultId),
      videoUrl: media(r.video),
      traceUrl: r.trace?.status === 'uploaded' ? traceViewerUrl(artifactUrl(r.trace.id)) : null,
      failureImage: r.failureScreenshot
        ? { url: artifactUrl(r.failureScreenshot.id), available: r.failureScreenshot.status === 'uploaded', unavailableReason: r.failureScreenshot.status === 'uploaded' ? null : r.failureScreenshot.status }
        : null,
      checkpoints: r.checkpoints.map(toCheckpointView),
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
    if (same) same.captures.push(...cp.captures);
    else merged.push({ ...cp, sequence: merged.length });
  }
  return merged;
}

/** Flows from several runs (the library's): each links to the result of its own run. */
export function flowViewsAcrossRuns(records: readonly ReviewFlowRecord[], hrefs: { result: (runNumber: number, resultId: string) => string }, links?: CaseLinks): ReviewFlowView[] {
  const runOf = new Map(records.map((r) => [r.resultId, r.runNumber]));
  return toFlowViews(records, (resultId) => hrefs.result(runOf.get(resultId)!, resultId), links);
}
