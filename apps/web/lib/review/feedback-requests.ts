/**
 * Every open request for a visual change, one record each — what a
 * developer (or an assistant) fixing the product works through, and has to
 * account for at the end.
 *
 * Two kinds, because people ask in two ways:
 * - a comment thread: a pin on a spot or an area, or a comment about the
 *   whole image (a change request with a comment is one of those);
 * - a change request without a comment: "changes requested" on an image and
 *   nothing more. It has no thread, so without this record it would vanish
 *   from every list the moment a new run replaced the image it was about.
 *
 * Each record says where it stands: `waiting` (the image is still the one it
 * was made on: not fixed yet) or `verify` (the image changed since: look
 * whether the change asked for was made). A changed image is evidence to
 * check, never proof that the request was met — a person resolves.
 */
import { checkpointLabel } from '@miguelfranken/ui/lib/review';
import type { CaptureThread } from './threads';
import type { ComparedCapture, ReviewFlowRecord } from './queries';

export type FeedbackStage = 'waiting' | 'verify';

export interface FeedbackTest {
  testId: string;
  title: string;
  titlePath: string[];
  file: string;
  /** Where the reported run found the test: a clue for a changed checkout, not a selector to trust. */
  line: number;
  /** The Playwright project (browser) it ran in. */
  browser: string;
}

export interface FeedbackRequest {
  /** Stable across runs: `thread:<id>` or `capture:<decision id>`. */
  requestId: string;
  kind: 'thread' | 'capture';
  stage: FeedbackStage;
  test: FeedbackTest;
  checkpoint: { key: string; title: string; order: number };
  variant: string;
  /** The image as it is now, and the run it comes from. */
  current: { captureId: string; checkpointId: string; run: number; status: ComparedCapture['status'] };
  /** The image the request was made on, when it is another one. */
  original: { captureId: string; run: number | null } | null;
  thread: CaptureThread | null;
  /** A change request without a comment: who asked, when. */
  decision: { id: string; by: string | null; at: Date; run: number | null } | null;
}

/** Where a capture of a flow comes from: its own run, or (in the library) the run that last captured it. */
function runOf(flow: ReviewFlowRecord, testResultId: string, capture: ComparedCapture) {
  return capture.runNumber ?? flow.origins?.[testResultId]?.runNumber ?? flow.runNumber;
}

/**
 * The open requests of some flows, in the order a person reads them: by
 * file, test, checkpoint, variant, then thread number.
 */
export function feedbackRequests(flows: readonly ReviewFlowRecord[]): FeedbackRequest[] {
  const out: FeedbackRequest[] = [];
  const ordered = [...flows].sort((a, b) => a.file.localeCompare(b.file) || a.titlePath.join('\u0000').localeCompare(b.titlePath.join('\u0000')) || a.project.localeCompare(b.project));
  for (const flow of ordered) {
    const test: FeedbackTest = { testId: flow.testId, title: flow.titlePath.join(' › ') || flow.title, titlePath: flow.titlePath.length ? flow.titlePath : [flow.title], file: flow.file, line: flow.line, browser: flow.project };
    for (const cp of flow.checkpoints) {
      const checkpoint = { key: cp.name, title: checkpointLabel(cp.name, cp.title), order: cp.sequence + 1 };
      for (const capture of [...cp.captures].sort((a, b) => a.variant.localeCompare(b.variant))) {
        const current = { captureId: capture.id, checkpointId: capture.checkpointId, run: runOf(flow, cp.testResultId, capture), status: capture.status };
        const base = { test, checkpoint, variant: capture.variant, current };
        for (const t of [...capture.threads].sort((a, b) => a.number - b.number)) {
          if (t.status !== 'open') continue;
          out.push({
            ...base,
            requestId: `thread:${t.id}`,
            kind: 'thread',
            stage: t.placement === 'outdated' ? 'verify' : 'waiting',
            original: t.originCaptureId && t.originCaptureId !== capture.id ? { captureId: t.originCaptureId, run: t.originRunNumber } : null,
            thread: t,
            decision: null,
          });
        }
        // A request with a comment opened a thread about the whole image: it is listed as that thread.
        const r = capture.request;
        if (r && !r.comment) {
          const same = r.captureId === capture.id || Boolean(r.sha256 && r.sha256 === capture.sha256);
          out.push({
            ...base,
            requestId: `capture:${r.id}`,
            kind: 'capture',
            stage: same ? 'waiting' : 'verify',
            original: !same && r.captureId ? { captureId: r.captureId, run: r.runNumber } : null,
            thread: null,
            decision: { id: r.id, by: r.by, at: r.createdAt, run: r.runNumber },
          });
        }
      }
    }
  }
  return out;
}

/** The distinct tests that produce the requests: what a narrow re-run has to select, no more. */
export function producingTests(requests: readonly FeedbackRequest[]) {
  const byTest = new Map<string, FeedbackTest & { requests: number; checkpoints: Set<string> }>();
  for (const r of requests) {
    const t = byTest.get(r.test.testId) ?? { ...r.test, requests: 0, checkpoints: new Set<string>() };
    t.requests++;
    t.checkpoints.add(r.checkpoint.key);
    byTest.set(r.test.testId, t);
  }
  return [...byTest.values()].map(({ checkpoints, ...t }) => ({ ...t, checkpoints: [...checkpoints] }));
}
