'use client';

import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  DEFAULT_FRAME,
  parseReviewFilter,
  REVIEW_GROUPINGS,
  REVIEW_SORTS,
  type FrameSettings,
  type ReviewCaptureView,
  type ReviewDecisionInput,
  type ReviewDecisionView,
  type ReviewDiffView,
  type ReviewFilter,
  type ReviewFlowView,
  type ReviewGrouping,
  type ReviewSort,
  type ReviewStatus,
  type StoryboardMode,
} from '@miguelfranken/ui/lib/review';
import type { IgnoreRect } from '@miguelfranken/ui/views/review/ignore-regions-editor';
import { ReviewStoryboard, STORYBOARD_SIZE, type ReviewSelection } from '@miguelfranken/ui/views/review/review-storyboard';
import { useShallowSearch } from '@/components/filters/url-filters';
import { decideReview, saveIgnoreRegions } from '@/app/(app)/teams/[team]/projects/[project]/review/actions';
import { applyDecision, patchCaptures } from '@/lib/review/patch-flows';
import { captureDiffQuery } from '@/lib/rpc/queries';

/** A capture that differs from its reference and has no finished measurement: what the viewer waits for. */
function awaitsDiff(c: ReviewCaptureView) {
  if (c.diff && c.diff.state !== 'pending') return false;
  if (c.compare) return !c.compare.same;
  return c.baseline ? !c.baseline.same : Boolean(c.previous && !c.previous.same);
}

interface LiveCapture {
  diff: ReviewDiffView | null;
  status: ReviewStatus;
  decision: ReviewDecisionView | null;
}

/**
 * The open checkpoint's measurements, asked for while they are being made:
 * the viewer gets the numbers (and a tolerance approval) as soon as the
 * workflow has them, without reloading the page.
 */
function useLiveDiffs(ref: { team: string; project: string }, flows: readonly ReviewFlowView[], selection: ReviewSelection | null, library: boolean) {
  const targets = useMemo(() => {
    if (!selection) return [];
    const cp = flows.flatMap((f) => f.checkpoints).find((c) => c.id === selection.checkpointId);
    return (cp?.captures ?? [])
      // The library has nothing to review; it only measures when it compares two lines of work.
      .filter((c) => (!selection.variant || c.variant === selection.variant) && (!library || c.compare) && awaitsDiff(c))
      .map((c) => ({ id: c.id, compareId: c.compare?.captureId }))
      .slice(0, 4);
  }, [flows, selection, library]);
  // One map per answer, not per render: the storyboard patches its flows only when a measurement arrives.
  const combine = useCallback(
    (results: { data?: LiveCapture }[]) => {
      const live = new Map<string, LiveCapture>();
      results.forEach((r, i) => {
        if (r.data) live.set(targets[i].id, r.data);
      });
      return live;
    },
    [targets],
  );
  return useQueries({ queries: targets.map((t) => captureDiffQuery(ref, t.id, t.compareId)), combine });
}

function withLive(flows: ReviewFlowView[], live: ReadonlyMap<string, LiveCapture>): ReviewFlowView[] {
  if (live.size === 0) return flows;
  return patchCaptures(flows, (cap) => {
    const l = live.get(cap.id);
    if (!l) return undefined;
    // A library comparison carries no review status of its own.
    return cap.compare ? { ...cap, diff: l.diff ?? cap.diff } : { ...cap, diff: l.diff ?? cap.diff, status: l.status, decision: l.decision ?? cap.decision };
  });
}

const SETTINGS_KEY = 'pwr.review.view';

interface ViewSettings {
  size: number;
  frame: FrameSettings;
}

/** The reviewer's screen size and viewer frame, kept in this browser; nothing breaks without storage. */
function useViewSettings(): [ViewSettings | null, (next: Partial<ViewSettings>) => void] {
  const [settings, setSettings] = useState<ViewSettings | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<ViewSettings> | null;
      const size = typeof saved?.size === 'number' ? Math.min(STORYBOARD_SIZE.max, Math.max(STORYBOARD_SIZE.min, saved.size)) : STORYBOARD_SIZE.default;
      setSettings({ size, frame: { ...DEFAULT_FRAME, ...(saved?.frame ?? {}) } });
    } catch {
      setSettings({ size: STORYBOARD_SIZE.default, frame: DEFAULT_FRAME });
    }
  }, []);
  const update = (patch: Partial<ViewSettings>) =>
    setSettings((current) => {
      const next = { size: STORYBOARD_SIZE.default, frame: DEFAULT_FRAME, ...current, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Private windows and blocked storage: the setting lasts for the page.
      }
      return next;
    });
  return [settings, update];
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
  tree,
  syncUrl = true,
  emptyTitle,
  emptyDescription,
  defaultFilter,
  mode,
  decide,
}: {
  team: string;
  project: string;
  flows: ReviewFlowView[];
  canDecide: boolean;
  toolbar?: boolean;
  /** The folder tree; with the toolbar by default. */
  tree?: boolean;
  /** Off where the storyboard is embedded in another page's URL. */
  syncUrl?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  /** Without a `status` in the URL: what needs review (the default) or everything. */
  defaultFilter?: ReviewFilter;
  /** `library`: documentation, nothing to decide. */
  mode?: StoryboardMode;
  /**
   * Records a decision; the server action by default, which renders the page
   * again. A storyboard fed by a query passes its mutation, which changes the
   * cache instead.
   */
  decide?: (input: ReviewDecisionInput) => Promise<{ ok: true; decided: number } | { ok: false; message: string }>;
}) {
  const { params, set } = useShallowSearch();
  const [local, setLocal] = useState<ReviewSelection | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [ignorePendingId, setIgnorePendingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [view, setView] = useViewSettings();
  const [localFolder, setLocalFolder] = useState<string | null>(null);
  const groupParam = params.get('group');
  const grouping = (REVIEW_GROUPINGS as readonly string[]).includes(groupParam ?? '') ? (groupParam as ReviewGrouping) : undefined;

  const filter: ReviewFilter | undefined = syncUrl && params.get('status') ? parseReviewFilter(params.get('status')) : defaultFilter;
  const cp = params.get('cp');
  const v = params.get('v');
  const urlSelection = useMemo(() => (cp ? { checkpointId: cp, variant: v } : null), [cp, v]);
  const selection = syncUrl ? urlSelection : local;
  const sortParam = params.get('sort');
  const sort = (REVIEW_SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as ReviewSort) : undefined;
  const live = useLiveDiffs({ team, project }, flows, selection, mode === 'library');
  const withLiveFlows = useMemo(() => withLive(flows, live), [flows, live]);
  const [optimistic, addDecision] = useOptimistic(withLiveFlows, (current: ReviewFlowView[], input: ReviewDecisionInput) => applyDecision(current, input));

  const onIgnoreRegionsChange = (input: { captureId: string; regions: IgnoreRect[] }) => {
    setIgnorePendingId(input.captureId);
    startTransition(async () => {
      const res = await saveIgnoreRegions({ team, project }, input);
      setIgnorePendingId(null);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      // The old measurement no longer applies; the viewer asks for the new one.
      queryClient.removeQueries({ queryKey: captureDiffQuery({ team, project }, input.captureId).queryKey });
      toast.success(input.regions.length ? 'Areas saved. Measuring again…' : 'Nothing is left out any more. Measuring again…');
    });
  };

  const onDecide = (input: ReviewDecisionInput) => {
    setPendingIds((ids) => [...ids, ...input.captureIds]);
    startTransition(async () => {
      addDecision(input);
      const res = await (decide ? decide(input) : decideReview({ team, project }, input));
      setPendingIds((ids) => ids.filter((id) => !input.captureIds.includes(id)));
      if (!res.ok) toast.error(res.message);
      else if (input.captureIds.length > 1) toast.success(`${res.decided} images ${input.decision === 'approved' ? 'approved' : 'marked for changes'}.`);
    });
  };

  return (
    <ReviewStoryboard
      flows={optimistic}
      toolbar={toolbar}
      tree={tree}
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
      grouping={syncUrl ? grouping : undefined}
      onGroupingChange={syncUrl ? (next) => set({ group: next, folder: null }) : undefined}
      folder={syncUrl ? params.get('folder') : localFolder}
      onFolderChange={(next) => (syncUrl ? set({ folder: next }) : setLocalFolder(next))}
      size={view?.size}
      onSizeChange={(size) => setView({ size })}
      frame={view?.frame}
      onFrameChange={(frame) => setView({ frame })}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      mode={mode}
      sort={syncUrl ? sort : undefined}
      onSortChange={syncUrl ? (next) => set({ sort: next === 'sequence' ? null : next }) : undefined}
      onIgnoreRegionsChange={canDecide && mode !== 'library' ? onIgnoreRegionsChange : undefined}
      ignorePendingId={ignorePendingId}
    />
  );
}
