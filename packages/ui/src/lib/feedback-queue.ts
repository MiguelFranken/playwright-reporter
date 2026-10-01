/**
 * Resolving feedback: every open comment and every change request without one,
 * one after the other, across the screens and flows of the library — the
 * reviewer's side of the loop after a fix and a (partial) run of the tests.
 *
 * An item is `verify` when the screen changed since the feedback was given
 * (compare the two, then resolve), `waiting` while it still shows the pixels
 * it was given on (nothing to verify yet: the fix has not been run, or did
 * not change the screen).
 *
 * Plain data and functions, read by the views and the app's URL parsing, so
 * no JSX and no directive (see AGENTS.md, trap 2).
 */
import { compareVariants, type ReviewFlowView } from './review';

/** Which feedback to go through. */
export const FEEDBACK_SCOPES = ['verify', 'waiting', 'all'] as const;
export type FeedbackScope = (typeof FEEDBACK_SCOPES)[number];

export const FEEDBACK_SCOPE_LABELS: Record<FeedbackScope, string> = { verify: 'To verify', waiting: 'Waiting', all: 'All open' };

export const FEEDBACK_SCOPE_HINTS: Record<FeedbackScope, string> = {
  verify: 'Feedback on screens that changed since: compare, then resolve.',
  waiting: 'Feedback on screens that still look as they did when it was given.',
  all: 'Every open comment and change request.',
};

export type FeedbackStage = 'verify' | 'waiting';

/** One piece of feedback to look at: a comment thread, or a change request nobody wrote a comment for. */
export interface FeedbackItem {
  /** `thread:<id>` or `request:<capture id>`. */
  key: string;
  kind: 'thread' | 'request';
  /** The flow's `resultId`. */
  flowId: string;
  checkpointId: string;
  variant: string;
  /** The capture the feedback is shown with: the screen as it is now. */
  captureId: string;
  threadId: string | null;
  /** The thread's number on its image. */
  number: number | null;
  stage: FeedbackStage;
}

/**
 * Every open piece of feedback of the flows, in the order of the journey:
 * flow, checkpoint, variant, then the threads by number. A change request
 * without a comment is an item only on a screen with no open thread — the
 * comments say what the request is about.
 */
export function feedbackItems(flows: readonly ReviewFlowView[]): FeedbackItem[] {
  const out: FeedbackItem[] = [];
  const seen = new Set<string>();
  for (const flow of flows)
    for (const cp of flow.checkpoints)
      for (const cap of [...cp.captures].sort((a, b) => compareVariants(a.variant, b.variant))) {
        const open = (cap.threads ?? []).filter((t) => t.status === 'open' && !t.pending).sort((a, b) => a.number - b.number);
        for (const t of open) {
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          out.push({
            key: `thread:${t.id}`,
            kind: 'thread',
            flowId: flow.resultId,
            checkpointId: cp.id,
            variant: cap.variant,
            captureId: cap.id,
            threadId: t.id,
            number: t.number,
            stage: t.placement === 'outdated' ? 'verify' : 'waiting',
          });
        }
        const request = cap.request ?? (cap.status === 'changes_requested' ? { onThisImage: true } : null);
        if (!open.length && request) {
          out.push({
            key: `request:${cap.id}`,
            kind: 'request',
            flowId: flow.resultId,
            checkpointId: cp.id,
            variant: cap.variant,
            captureId: cap.id,
            threadId: null,
            number: null,
            stage: request.onThisImage ? 'waiting' : 'verify',
          });
        }
      }
  return out;
}

export const inFeedbackScope = (item: Pick<FeedbackItem, 'stage'>, scope: FeedbackScope) => scope === 'all' || item.stage === scope;

/** The feedback to go through in a scope, in journey order. */
export function feedbackQueue(flows: readonly ReviewFlowView[], scope: FeedbackScope): FeedbackItem[] {
  return feedbackItems(flows).filter((i) => inFeedbackScope(i, scope));
}

/** How many items each scope holds. */
export function feedbackScopeCounts(flows: readonly ReviewFlowView[]): Record<FeedbackScope, number> {
  const items = feedbackItems(flows);
  const verify = items.filter((i) => i.stage === 'verify').length;
  return { verify, waiting: items.length - verify, all: items.length };
}

/** Where to start: what changed since the feedback, when anything did — the point of running the tests again. */
export function defaultFeedbackScope(counts: Record<FeedbackScope, number>): FeedbackScope {
  return counts.verify > 0 ? 'verify' : 'all';
}

export function parseFeedbackScope(raw: string | null | undefined): FeedbackScope | null {
  return (FEEDBACK_SCOPES as readonly string[]).includes(raw ?? '') ? (raw as FeedbackScope) : null;
}

/** The flows cut down to the checkpoints that carry an item: what the viewer steps through while resolving. */
export function flowsWithFeedback(flows: readonly ReviewFlowView[], items: readonly FeedbackItem[]): ReviewFlowView[] {
  const byFlow = new Map<string, Set<string>>();
  for (const i of items) byFlow.set(i.flowId, (byFlow.get(i.flowId) ?? new Set()).add(i.checkpointId));
  const out: ReviewFlowView[] = [];
  for (const f of flows) {
    const keep = byFlow.get(f.resultId);
    if (!keep) continue;
    const checkpoints = f.checkpoints.filter((c) => keep.has(c.id));
    if (checkpoints.length) out.push({ ...f, checkpoints });
  }
  return out;
}

/**
 * Whether an item has been dealt with, by the flows as they are now: its
 * thread resolved (or gone), its change request withdrawn or approved over.
 */
export function feedbackItemDone(item: FeedbackItem, flows: readonly ReviewFlowView[]): boolean {
  for (const f of flows) {
    if (f.resultId !== item.flowId) continue;
    for (const cp of f.checkpoints)
      for (const cap of cp.captures) {
        if (item.kind === 'thread') {
          const t = cap.threads?.find((x) => x.id === item.threadId);
          if (t) return t.status !== 'open';
        } else if (cap.id === item.captureId) return !(cap.request || cap.status === 'changes_requested') || cap.status === 'approved';
      }
  }
  return true;
}
