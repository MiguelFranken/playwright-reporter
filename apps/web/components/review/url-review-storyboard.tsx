'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { parseReviewFilter, type ReviewDecisionInput, type ReviewFilter, type ReviewFlowView } from '@miguelfranken/ui/lib/review';
import { ReviewStoryboard, type ReviewSelection } from '@miguelfranken/ui/views/review/review-storyboard';
import { useShallowSearch } from '@/components/filters/url-filters';
import { decideReview } from '@/app/(app)/teams/[team]/projects/[project]/review/actions';

/** Marks the decided images at once; the revalidated page confirms it. */
function applyDecision(flows: ReviewFlowView[], input: ReviewDecisionInput): ReviewFlowView[] {
  const ids = new Set(input.captureIds);
  return flows.map((f) => ({
    ...f,
    checkpoints: f.checkpoints.map((c) => ({
      ...c,
      captures: c.captures.map((cap) => (ids.has(cap.id) ? { ...cap, status: input.decision, decision: { decision: input.decision, at: new Date().toISOString(), comment: input.comment ?? null, by: 'You' } } : cap)),
    })),
  }));
}

/**
 * The storyboard bound to the URL (`status`, `variant`, `q`, and the open
 * checkpoint as `cp` and `v`, so a checkpoint can be linked to) and to the
 * decision action. Statuses change optimistically; the action's revalidation
 * brings the real ones.
 */
export function UrlReviewStoryboard({
  team,
  project,
  flows,
  canDecide,
  toolbar = true,
  syncUrl = true,
  emptyTitle,
  defaultFilter,
}: {
  team: string;
  project: string;
  flows: ReviewFlowView[];
  canDecide: boolean;
  toolbar?: boolean;
  /** Off where the storyboard is embedded in another page's URL. */
  syncUrl?: boolean;
  emptyTitle?: string;
  /** Without a `status` in the URL: what needs review (the default) or everything. */
  defaultFilter?: ReviewFilter;
}) {
  const { params, set } = useShallowSearch();
  const [local, setLocal] = useState<ReviewSelection | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [optimistic, addDecision] = useOptimistic(flows, applyDecision);
  const [, startTransition] = useTransition();

  const filter: ReviewFilter | undefined = syncUrl && params.get('status') ? parseReviewFilter(params.get('status')) : defaultFilter;
  const cp = params.get('cp');
  const selection = syncUrl ? (cp ? { checkpointId: cp, variant: params.get('v') } : null) : local;

  const onDecide = (input: ReviewDecisionInput) => {
    setPendingIds((ids) => [...ids, ...input.captureIds]);
    startTransition(async () => {
      addDecision(input);
      const res = await decideReview({ team, project }, input);
      setPendingIds((ids) => ids.filter((id) => !input.captureIds.includes(id)));
      if (!res.ok) toast.error(res.message);
      else if (input.captureIds.length > 1) toast.success(`${res.decided} images ${input.decision === 'approved' ? 'approved' : 'marked for changes'}.`);
    });
  };

  return (
    <ReviewStoryboard
      flows={optimistic}
      toolbar={toolbar}
      filter={filter}
      onFilterChange={syncUrl ? (next) => set({ status: next }) : undefined}
      variant={syncUrl ? params.get('variant') : undefined}
      onVariantChange={syncUrl ? (next) => set({ variant: next }) : undefined}
      query={syncUrl ? (params.get('q') ?? '') : undefined}
      onQueryChange={syncUrl ? (next) => set({ q: next || null }) : undefined}
      selection={selection}
      onSelectionChange={(next) => (syncUrl ? set({ cp: next?.checkpointId ?? null, v: next?.variant ?? null }) : setLocal(next))}
      onDecide={canDecide ? onDecide : undefined}
      pendingIds={pendingIds}
      canDecide={canDecide}
      emptyTitle={emptyTitle}
    />
  );
}
