'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  BUILT_IN_VIEWS,
  DEFAULT_LIBRARY_VIEW,
  LIBRARY_VIEW_PARAMS,
  viewConfigFromParams,
  viewConfigToParams,
  type LibraryViewConfig,
  type LibraryViewDef,
} from '@miguelfranken/ui/lib/library-views';
import { parseFeedbackScope } from '@miguelfranken/ui/lib/feedback-queue';
import type { ReviewFlowView } from '@miguelfranken/ui/lib/review';
import { LibraryBrowser } from '@miguelfranken/ui/views/library/library-browser';
import type { ReviewSelection } from '@miguelfranken/ui/views/review/review-storyboard';
import { useShallowSearch } from '@/components/filters/url-filters';
import { useReviewActions, useViewSettings } from '@/components/review/url-review-storyboard';
import { deleteLibraryView, saveLibraryView } from '@/app/(app)/teams/[team]/projects/[project]/library/actions';

/**
 * The library bound to the URL — the view (`view`), what differs from it
 * (`state`, `priority`, `group`, `sort`, `variant`), the search, the folder,
 * the open checkpoint and thread (`cp`, `v`, `thread`), and going through the
 * feedback (`resolve`), so any of it can be linked to — and to the actions: comments, deciding about screens (a
 * folder's from the tree, one in the viewer) and the areas they leave out, and the person's own views.
 */
export function UrlLibraryBrowser({
  team,
  project,
  flows,
  savedViews,
  canComment,
  canModerate,
  canDecide,
  viewerId,
  emptyTitle,
  emptyDescription,
}: {
  team: string;
  project: string;
  flows: ReviewFlowView[];
  savedViews: LibraryViewDef[];
  canComment: boolean;
  canModerate: boolean;
  /** May approve a folder's screens from the tree. */
  canDecide: boolean;
  viewerId: string | null;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
}) {
  const { params, set } = useShallowSearch();
  const [view, setView] = useViewSettings();
  const [pendingView, setPendingView] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const ref = { team, project };

  const views = useMemo(() => [...BUILT_IN_VIEWS, ...savedViews], [savedViews]);
  const viewId = params.get('view') ?? 'all';
  const activeView = views.find((v) => v.id === viewId) ?? BUILT_IN_VIEWS[0];
  const base = activeView.config ?? DEFAULT_LIBRARY_VIEW;
  const config = viewConfigFromParams((name) => params.get(name), base);

  const cp = params.get('cp');
  const v = params.get('v');
  const selection = useMemo<ReviewSelection | null>(() => (cp ? { checkpointId: cp, variant: v } : null), [cp, v]);
  const { flows: optimistic, comments, onDecide, pendingIds, onIgnoreRegionsChange, ignorePendingId } = useReviewActions({
    team,
    project,
    flows,
    selection,
    canComment,
    canModerate,
    viewerId,
    openThread: Number(params.get('thread')) || null,
    onOpenThreadChange: (n) => set({ thread: n ? String(n) : null }),
  });

  const clearedView = Object.fromEntries(LIBRARY_VIEW_PARAMS.map((k) => [k, null]));
  // A view's link carries only what differs from it: the filters carried over from the view left behind.
  const showView = (next: LibraryViewDef, nextConfig: LibraryViewConfig) =>
    set({ ...clearedView, ...viewConfigToParams(nextConfig, next.config), view: next.id === 'all' ? null : next.id, folder: null });
  const setConfig = (next: LibraryViewConfig) => set({ ...viewConfigToParams(next, base), view: activeView.id === 'all' ? null : activeView.id });

  const saveView = (input: { name: string; config: LibraryViewConfig }) => {
    setPendingView('new');
    startTransition(async () => {
      const res = await saveLibraryView(ref, input);
      setPendingView(null);
      if (!res.ok) return void toast.error(res.message);
      toast.success(`Saved the view “${res.view.name}”.`);
      set({ ...clearedView, view: res.view.id });
    });
  };
  const updateView = (input: { id: string; config?: LibraryViewConfig; name?: string }) => {
    setPendingView(input.id);
    startTransition(async () => {
      const res = await saveLibraryView(ref, input);
      setPendingView(null);
      if (!res.ok) return void toast.error(res.message);
      if (input.config) {
        toast.success(`Saved to “${res.view.name}”.`);
        set({ ...clearedView, view: res.view.id });
      }
    });
  };
  const removeView = (target: LibraryViewDef) => {
    if (!window.confirm(`Delete the view “${target.name}”? Only you have it; the flows stay as they are.`)) return;
    setPendingView(target.id);
    startTransition(async () => {
      const res = await deleteLibraryView(ref, target.id);
      setPendingView(null);
      if (!res.ok) return void toast.error(res.message);
      toast.success(`Deleted the view “${target.name}”.`);
      if (target.id === activeView.id) set({ ...clearedView });
    });
  };

  return (
    <LibraryBrowser
      flows={optimistic}
      views={views}
      activeViewId={activeView.id}
      onActiveViewChange={showView}
      config={config}
      onConfigChange={setConfig}
      onSaveView={saveView}
      onUpdateView={updateView}
      onDeleteView={removeView}
      viewPendingId={pendingView}
      query={params.get('q') ?? ''}
      onQueryChange={(q) => set({ q: q || null })}
      folder={params.get('folder')}
      onFolderChange={(folder) => set({ folder })}
      selection={selection}
      onSelectionChange={(next) => {
        const elsewhere = next?.checkpointId !== selection?.checkpointId || next?.variant !== selection?.variant;
        set({ cp: next?.checkpointId ?? null, v: next?.variant ?? null, ...(elsewhere ? { thread: null } : {}) });
      }}
      onOpenThread={(next, thread) => set({ cp: next.checkpointId, v: next.variant, thread: String(thread) })}
      resolving={parseFeedbackScope(params.get('resolve'))}
      onResolvingChange={(scope) => set({ resolve: scope })}
      size={view?.size}
      onSizeChange={(size) => setView({ size })}
      frame={view?.frame}
      onFrameChange={(frame) => setView({ frame })}
      comments={comments}
      onDecide={canDecide ? onDecide : undefined}
      pendingIds={pendingIds}
      onIgnoreRegionsChange={canDecide ? onIgnoreRegionsChange : undefined}
      ignorePendingId={ignorePendingId}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    />
  );
}
