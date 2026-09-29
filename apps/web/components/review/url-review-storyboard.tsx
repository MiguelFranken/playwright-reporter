'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DEFAULT_FRAME, parseReviewFilter, REVIEW_GROUPINGS, type FrameSettings, type ReviewDecisionInput, type ReviewFilter, type ReviewFlowView, type ReviewGrouping } from '@miguelfranken/ui/lib/review';
import { ReviewStoryboard, STORYBOARD_SIZE, type ReviewSelection } from '@miguelfranken/ui/views/review/review-storyboard';
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
  defaultFilter,
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
  /** Without a `status` in the URL: what needs review (the default) or everything. */
  defaultFilter?: ReviewFilter;
}) {
  const { params, set } = useShallowSearch();
  const [local, setLocal] = useState<ReviewSelection | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [optimistic, addDecision] = useOptimistic(flows, applyDecision);
  const [, startTransition] = useTransition();
  const [view, setView] = useViewSettings();
  const [localFolder, setLocalFolder] = useState<string | null>(null);
  const groupParam = params.get('group');
  const grouping = (REVIEW_GROUPINGS as readonly string[]).includes(groupParam ?? '') ? (groupParam as ReviewGrouping) : undefined;

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
    />
  );
}
