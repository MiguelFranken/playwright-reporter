'use client';

import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
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
import type { CommentEditInput, NewThreadInput, ReviewThreadView, ThreadReplyInput, ThreadStatusInput } from '@miguelfranken/ui/lib/review-threads';
import type { IgnoreRect } from '@miguelfranken/ui/views/review/ignore-regions-editor';
import { ReviewStoryboard, STORYBOARD_SIZE, type ReviewSelection } from '@miguelfranken/ui/views/review/review-storyboard';
import { useShallowSearch } from '@/components/filters/url-filters';
import {
  createReviewThread,
  decideReview,
  deleteReviewComment,
  editReviewComment,
  replyToReviewThread,
  saveIgnoreRegions,
  setReviewThreadStatus,
} from '@/app/(app)/teams/[team]/projects/[project]/review/actions';
import { captureDiffQuery } from '@/lib/rpc/queries';

/** What changes at once, before the revalidated page confirms it. */
type Change =
  | { type: 'decide'; input: ReviewDecisionInput }
  | { type: 'create'; input: NewThreadInput; tempId: string }
  | { type: 'reply'; input: ThreadReplyInput; tempId: string }
  | { type: 'status'; input: ThreadStatusInput }
  | { type: 'edit'; input: CommentEditInput }
  | { type: 'delete'; input: { commentId: string; threadId: string } };

const mapCaptures = (flows: ReviewFlowView[], fn: (cap: ReviewFlowView['checkpoints'][number]['captures'][number]) => ReviewFlowView['checkpoints'][number]['captures'][number]) =>
  flows.map((f) => ({ ...f, checkpoints: f.checkpoints.map((c) => ({ ...c, captures: c.captures.map(fn) })) }));

const mapThreads = (flows: ReviewFlowView[], fn: (t: ReviewThreadView) => ReviewThreadView | null) =>
  mapCaptures(flows, (cap) => (cap.threads?.length ? { ...cap, threads: cap.threads.map(fn).filter((t): t is ReviewThreadView => t !== null) } : cap));

function applyChange(flows: ReviewFlowView[], change: Change): ReviewFlowView[] {
  const now = new Date().toISOString();
  const you = { name: 'You', image: null };
  switch (change.type) {
    case 'decide': {
      const { input } = change;
      const ids = new Set(input.captureIds);
      return mapCaptures(flows, (cap) =>
        ids.has(cap.id)
          ? {
              ...cap,
              status: input.decision,
              decision: { decision: input.decision, at: now, comment: input.comment ?? null, by: 'You' },
              threads: input.resolveThreads ? cap.threads?.map((t) => (t.status === 'open' ? { ...t, status: 'resolved' as const, resolvedAt: now } : t)) : cap.threads,
            }
          : cap,
      );
    }
    case 'create': {
      const { input, tempId } = change;
      return mapCaptures(flows, (cap) => {
        if (cap.id !== input.captureId) return cap;
        const next = Math.max(0, ...(cap.threads ?? []).map((t) => t.number)) + 1;
        const thread: ReviewThreadView = {
          id: tempId,
          number: next,
          status: 'open',
          anchor: input.anchor,
          placement: 'exact',
          createdAt: now,
          pending: true,
          comments: [{ id: `${tempId}-c`, kind: 'comment', body: input.body, author: you, source: 'app', at: now, pending: true }],
        };
        return { ...cap, threads: [...(cap.threads ?? []), thread] };
      });
    }
    case 'reply':
      return mapThreads(flows, (t) =>
        t.id === change.input.threadId ? { ...t, comments: [...t.comments, { id: change.tempId, kind: 'comment', body: change.input.body, author: you, source: 'app', at: now, pending: true }] } : t,
      );
    case 'status':
      return mapThreads(flows, (t) =>
        t.id === change.input.threadId
          ? {
              ...t,
              status: change.input.status,
              resolvedAt: change.input.status === 'resolved' ? now : null,
              comments: [...t.comments, { id: `${t.id}-${change.input.status}`, kind: change.input.status === 'resolved' ? 'resolved' : 'reopened', body: '', author: you, source: 'app', at: now, pending: true }],
            }
          : t,
      );
    case 'edit':
      return mapThreads(flows, (t) => ({ ...t, comments: t.comments.map((c) => (c.id === change.input.commentId ? { ...c, body: change.input.body, editedAt: now } : c)) }));
    case 'delete':
      return mapThreads(flows, (t) => {
        if (t.id !== change.input.threadId) return t;
        const opening = t.comments.find((c) => c.kind === 'comment');
        return opening?.id === change.input.commentId ? null : { ...t, comments: t.comments.filter((c) => c.id !== change.input.commentId) };
      });
  }
}

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
  const results = useQueries({ queries: targets.map((t) => captureDiffQuery(ref, t.id, t.compareId)) });
  const live = new Map<string, LiveCapture>();
  results.forEach((r, i) => {
    if (r.data) live.set(targets[i].id, r.data);
  });
  return live;
}

function withLive(flows: ReviewFlowView[], live: ReadonlyMap<string, LiveCapture>): ReviewFlowView[] {
  if (live.size === 0) return flows;
  return flows.map((f) => ({
    ...f,
    checkpoints: f.checkpoints.map((c) => ({
      ...c,
      captures: c.captures.map((cap) => {
        const l = live.get(cap.id);
        if (!l) return cap;
        // A library comparison carries no review status of its own.
        return cap.compare ? { ...cap, diff: l.diff ?? cap.diff } : { ...cap, diff: l.diff ?? cap.diff, status: l.status, decision: l.decision ?? cap.decision };
      }),
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
  emptyDescription,
  defaultFilter,
  mode,
  canComment = false,
  canModerate = false,
  viewerId = null,
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
  /** May pin comments, reply and resolve. */
  canComment?: boolean;
  /** May delete anybody's comment. */
  canModerate?: boolean;
  /** The signed-in user, whose own comments can be edited. */
  viewerId?: string | null;
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
  const selection = syncUrl ? (cp ? { checkpointId: cp, variant: params.get('v') } : null) : local;
  const sortParam = params.get('sort');
  const sort = (REVIEW_SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as ReviewSort) : undefined;
  const live = useLiveDiffs({ team, project }, flows, selection, mode === 'library');
  const [optimistic, addChange] = useOptimistic(withLive(flows, live), applyChange);
  const [localThread, setLocalThread] = useState<number | null>(null);

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

  const ref = { team, project };
  const onDecide = (input: ReviewDecisionInput) => {
    setPendingIds((ids) => [...ids, ...input.captureIds]);
    startTransition(async () => {
      addChange({ type: 'decide', input });
      const res = await decideReview(ref, input);
      setPendingIds((ids) => ids.filter((id) => !input.captureIds.includes(id)));
      if (!res.ok) toast.error(res.message);
      else if (input.captureIds.length > 1) toast.success(`${res.decided} images ${input.decision === 'approved' ? 'approved' : 'marked for changes'}.`);
      else if (res.resolvedThreads) toast.success(`Approved; ${res.resolvedThreads} ${res.resolvedThreads === 1 ? 'comment' : 'comments'} resolved.`);
    });
  };

  /** Runs a comment action with its optimistic change; a failure shows why, and the page stays as the server has it. */
  const commentAction = (change: Change, run: () => Promise<{ ok: true } | { ok: false; message: string }>, done?: () => void) =>
    startTransition(async () => {
      addChange(change);
      const res = await run();
      if (!res.ok) toast.error(res.message);
      else done?.();
    });
  const temp = () => `pending-${crypto.randomUUID()}`;
  const comments = {
    canComment,
    canModerate,
    viewerId,
    openThread: syncUrl ? (Number(params.get('thread')) || null) : localThread,
    onOpenThreadChange: (n: number | null) => (syncUrl ? set({ thread: n ? String(n) : null }) : setLocalThread(n)),
    onCreateThread: (input: NewThreadInput) => commentAction({ type: 'create', input, tempId: temp() }, () => createReviewThread(ref, input)),
    onReply: (input: ThreadReplyInput) => commentAction({ type: 'reply', input, tempId: temp() }, () => replyToReviewThread(ref, input)),
    onSetThreadStatus: (input: ThreadStatusInput) =>
      commentAction({ type: 'status', input }, () => setReviewThreadStatus(ref, input), () => {
        if (input.status === 'resolved') toast.success('Comment resolved.', { action: { label: 'Undo', onClick: () => comments.onSetThreadStatus({ ...input, status: 'open' }) } });
      }),
    onEditComment: (input: CommentEditInput) => commentAction({ type: 'edit', input }, () => editReviewComment(ref, input)),
    onDeleteComment: (input: { commentId: string; threadId: string }) => {
      if (!window.confirm('Delete this comment? The first comment of a thread takes the whole thread with it.')) return;
      commentAction({ type: 'delete', input }, () => deleteReviewComment(ref, { commentId: input.commentId }));
    },
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
      onSelectionChange={(next) => {
        // Another image: thread numbers count per image, so the open one was the last image's.
        const elsewhere = next?.checkpointId !== selection?.checkpointId || next?.variant !== selection?.variant;
        if (syncUrl) set({ cp: next?.checkpointId ?? null, v: next?.variant ?? null, ...(elsewhere ? { thread: null } : {}) });
        else {
          setLocal(next);
          if (elsewhere) setLocalThread(null);
        }
      }}
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
      comments={comments}
    />
  );
}
