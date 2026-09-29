/**
 * Changing some captures of a storyboard's flows, keeping every flow and
 * checkpoint that holds none of them as the same object: the storyboard's
 * rows are memoised, so only the rows that show a changed image render again.
 */
import type { ReviewCaptureView, ReviewDecisionInput, ReviewDecisionView, ReviewFlowView } from '@miguelfranken/ui/lib/review';

export function patchCaptures(
  flows: readonly ReviewFlowView[],
  patch: (capture: ReviewCaptureView) => ReviewCaptureView | undefined,
): ReviewFlowView[] {
  let flowsChanged = false;
  const next = flows.map((flow) => {
    let flowChanged = false;
    const checkpoints = flow.checkpoints.map((checkpoint) => {
      let changed = false;
      const captures = checkpoint.captures.map((capture) => {
        const patched = patch(capture);
        if (!patched || patched === capture) return capture;
        changed = true;
        return patched;
      });
      if (!changed) return checkpoint;
      flowChanged = true;
      return { ...checkpoint, captures };
    });
    if (!flowChanged) return flow;
    flowsChanged = true;
    return { ...flow, checkpoints };
  });
  return flowsChanged ? next : (flows as ReviewFlowView[]);
}

/** The decided images with their new status, as the reviewer sees it before (and after) the server confirms it. */
export function applyDecision(flows: readonly ReviewFlowView[], input: ReviewDecisionInput, by = 'You'): ReviewFlowView[] {
  const ids = new Set(input.captureIds);
  const decision: ReviewDecisionView = { decision: input.decision, at: new Date().toISOString(), comment: input.comment ?? null, by };
  return patchCaptures(flows, (cap) => (ids.has(cap.id) ? { ...cap, status: input.decision, decision } : undefined));
}
