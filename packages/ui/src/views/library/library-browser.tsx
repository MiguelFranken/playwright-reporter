'use client';

import { Bookmark, CircleDashed, Images, Layers, ListChecks, ListFilter, MessageSquare, PanelLeft, Search, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { EmptyState } from '../../patterns/empty-state';
import { ScrollToTop } from '../../patterns/scroll-to-top';
import {
  BUILT_IN_VIEWS,
  captureStates,
  describeViewConfig,
  feedbackCounts,
  groupLibraryFlows,
  LIBRARY_FOLDERS_LABELS,
  libraryCounts,
  matchesLibraryFilters,
  matchingCheckpointIds,
  sameViewConfig,
  sortLibraryFlows,
  type LibraryViewConfig,
  type LibraryViewDef,
} from '../../lib/library-views';
import { defaultFeedbackScope, feedbackQueue, feedbackScopeCounts, flowsWithFeedback, type FeedbackItem, type FeedbackScope } from '../../lib/feedback-queue';
import { buildReviewTree, DEFAULT_FRAME, folderId, folderPathOf, inFolder, variantsOf, type FrameSettings, type ReviewDecisionInput, type ReviewFlowView, type ReviewGrouping } from '../../lib/review';
import { CheckpointViewer, type ReviewCommentsProps, type ReviewSelection } from '../review/checkpoint-viewer';
import type { IgnoreRect } from '../review/ignore-regions-editor';
import { filterFlows } from '../review/review-storyboard';
import { approveFolderAction, ReviewTree, type FolderAction, type FolderMenuTarget } from '../review/review-tree';
import { SCREEN_ZOOM_VAR } from '../review/screen-frame';
import { SizeControl, STORYBOARD_SIZE } from '../review/size-control';
import { StoryboardRows } from '../review/storyboard-rows';
import { FeedbackInbox, FeedbackInboxButton, type InboxItem } from './feedback-inbox';
import { BUILT_IN_ICONS, LibraryViewList } from './library-rail';
import { LibraryDisplayMenu, LibraryFilterChips, LibraryFilterMenu, ViewSaveControls } from './library-toolbar';
import { LibraryViewEditor } from './library-view-editor';

/** Uncontrolled unless the host passes the value: stories drive it, the app binds it to the URL. */
function useControlled<T>(value: T | undefined, onChange: ((v: T) => void) | undefined, initial: T): [T, (v: T) => void] {
  const [own, setOwn] = useState(initial);
  return value === undefined ? [own, (v) => (setOwn(v), onChange?.(v))] : [value, (v) => onChange?.(v)];
}

/** Nothing is being decided in the library. */
const NOTHING_PENDING: ReadonlySet<string> = new Set();

/** Open comments below every folder of the tree, by folder id; `''` is everything. */
function attentionByFolder(flows: readonly ReviewFlowView[], grouping: ReviewGrouping): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of flows) {
    const n = feedbackCounts(f.checkpoints.flatMap((c) => c.captures)).open;
    if (!n) continue;
    const path = folderPathOf(f, grouping);
    out.set('', (out.get('') ?? 0) + n);
    for (let i = 1; i <= path.length; i++) out.set(folderId(path.slice(0, i)), (out.get(folderId(path.slice(0, i))) ?? 0) + n);
  }
  return out;
}

export interface LibraryBrowserProps {
  flows: readonly ReviewFlowView[];
  /** Every view to list: the built-in ones (`BUILT_IN_VIEWS`) and the person's own. */
  views?: readonly LibraryViewDef[];
  /** The view the settings came from. */
  activeViewId?: string | null;
  onActiveViewChange?: (view: LibraryViewDef) => void;
  /** What is on screen: filters, grouping, order and variant. */
  config?: LibraryViewConfig;
  onConfigChange?: (next: LibraryViewConfig) => void;
  /** Saving is offered when the host can: a new view, or the changes into the saved view on screen. */
  onSaveView?: (input: { name: string; config: LibraryViewConfig }) => void;
  onUpdateView?: (input: { id: string; config?: LibraryViewConfig; name?: string }) => void;
  onDeleteView?: (view: LibraryViewDef) => void;
  /** A view being saved, renamed or deleted. */
  viewPendingId?: string | null;
  query?: string;
  onQueryChange?: (next: string) => void;
  folder?: string | null;
  onFolderChange?: (next: string | null) => void;
  selection?: ReviewSelection | null;
  onSelectionChange?: (next: ReviewSelection | null) => void;
  /** Opens the viewer at a thread (from the inbox); by default the selection and then the thread. */
  onOpenThread?: (selection: ReviewSelection, thread: number) => void;
  size?: number;
  onSizeChange?: (next: number) => void;
  frame?: FrameSettings;
  onFrameChange?: (next: FrameSettings) => void;
  comments?: ReviewCommentsProps;
  /**
   * Deciding about screens — a folder's from its menu in the tree, one in the
   * viewer — as in the review of the run that captured them; absent for who
   * may not decide.
   */
  onDecide?: (input: ReviewDecisionInput) => void;
  /** Screens being decided about. */
  pendingIds?: readonly string[];
  /** Saves the areas a screen leaves out of comparisons, in the viewer. */
  onIgnoreRegionsChange?: (input: { captureId: string; regions: IgnoreRect[] }) => void;
  ignorePendingId?: string | null;
  /**
   * Going through the open feedback one item after another (`verify`,
   * `waiting` or `all` of it), or `null`; uncontrolled when absent. The
   * viewer shows the items, so the selection follows them.
   */
  resolving?: FeedbackScope | null;
  onResolvingChange?: (next: FeedbackScope | null) => void;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
}

/** The screens of these flows that need review and have no open comment (those wait for their thread). */
function needsReviewCaptureIds(flows: readonly ReviewFlowView[]): string[] {
  return flows.flatMap((f) => f.checkpoints.flatMap((c) => c.captures.filter((cap) => captureStates(cap).has('needs-review')).map((cap) => cap.id)));
}

/**
 * The library: every flow a branch shows, screen by screen, and where each
 * stands in the review loop. On the left, the views (built in, and the
 * person's own) and the folders, both staying in reach while the flows
 * scroll; above the flows, the filters, how they are grouped and ordered,
 * and four counts that take you straight to what waits for you. A flow that
 * passes the filters shows its whole journey, with the screens that match
 * in front. The inbox lists every open comment; the viewer compares a
 * comment's version with the screen as it is now.
 */
export function LibraryBrowser({
  flows,
  views = BUILT_IN_VIEWS,
  activeViewId: activeViewIdProp,
  onActiveViewChange,
  config: configProp,
  onConfigChange,
  onSaveView,
  onUpdateView,
  onDeleteView,
  viewPendingId,
  query: queryProp,
  onQueryChange,
  folder: folderProp,
  onFolderChange,
  selection: selectionProp,
  onSelectionChange,
  onOpenThread,
  size: sizeProp,
  onSizeChange,
  frame,
  onFrameChange,
  comments = {},
  onDecide,
  pendingIds,
  onIgnoreRegionsChange,
  ignorePendingId,
  resolving: resolvingProp,
  onResolvingChange,
  emptyTitle = 'No screens yet',
  emptyDescription,
}: LibraryBrowserProps) {
  const [activeViewId, setActiveViewId] = useControlled<string | null>(activeViewIdProp, undefined, 'all');
  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const [config, setConfig] = useControlled<LibraryViewConfig>(configProp, onConfigChange, activeView?.config ?? BUILT_IN_VIEWS[0].config);
  const [query, setQuery] = useControlled<string>(queryProp, onQueryChange, '');
  const [folder, setFolder] = useControlled<string | null>(folderProp, onFolderChange, null);
  const [selection, setSelectionState] = useControlled<ReviewSelection | null>(selectionProp, onSelectionChange, null);
  const [size, setSize] = useControlled<number>(sizeProp, onSizeChange, STORYBOARD_SIZE.default);
  const [inbox, setInbox] = useState(false);
  const [resolving, setResolving] = useControlled<FeedbackScope | null>(resolvingProp, onResolvingChange, null);
  // The feedback being gone through, kept as it was when it started: resolving an item does not take it off the count.
  const [queue, setQueue] = useState<FeedbackItem[] | null>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; id?: string; name: string; config: LibraryViewConfig } | null>(null);
  // Below the wide layout the rail folds away, so the flows are not a screen of lists down.
  const [railOpen, setRailOpen] = useState(false);
  const modified = Boolean(activeView && !sameViewConfig(config, activeView.config));

  const rootRef = useRef<HTMLDivElement>(null);
  const setLiveSize = (v: number) => rootRef.current?.style.setProperty(SCREEN_ZOOM_VAR, String(v));

  const selectView = (view: LibraryViewDef) => {
    if (activeViewIdProp === undefined) setActiveViewId(view.id);
    onActiveViewChange?.(view);
    if (configProp === undefined) setConfig(view.config);
  };

  // The view decides the folders: the tree and, grouped by folder, the sections.
  const treeGrouping: ReviewGrouping = config.folders;
  const variants = useMemo(() => variantsOf(flows), [flows]);
  const variant = config.variant && variants.includes(config.variant) ? config.variant : null;
  const byVariant = useMemo(() => filterFlows(flows, 'all', variant, ''), [flows, variant]);
  const searched = useMemo(() => filterFlows(byVariant, 'all', null, query), [byVariant, query]);
  const folders = useMemo(() => buildReviewTree(searched, treeGrouping), [searched, treeGrouping]);
  const attention = useMemo(() => attentionByFolder(searched, treeGrouping), [searched, treeGrouping]);
  const inScope = useMemo(() => searched.filter((f) => inFolder(f, treeGrouping, folder)), [searched, treeGrouping, folder]);
  const counts = useMemo(() => libraryCounts(inScope), [inScope]);
  const visible = useMemo(() => inScope.filter((f) => matchesLibraryFilters(f, config.filters)), [inScope, config.filters]);
  const sections = useMemo(() => groupLibraryFlows(sortLibraryFlows(visible, config.sort), config.group, config.folders), [visible, config.sort, config.group, config.folders]);
  const ordered = useMemo(() => sections.flatMap((s) => s.flows), [sections]);
  const viewCounts = useMemo(() => Object.fromEntries(views.map((v) => [v.id, byVariant.filter((f) => matchesLibraryFilters(f, v.config.filters)).length])), [views, byVariant]);
  /** What the view builder previews: the flows a view with these settings would show. */
  const countFor = useCallback(
    (c: LibraryViewConfig) => {
      const v = c.variant && variants.includes(c.variant) ? c.variant : null;
      return filterFlows(flows, 'all', v, '').filter((f) => matchesLibraryFilters(f, c.filters)).length;
    },
    [flows, variants],
  );
  const matching = useCallback((flow: ReviewFlowView) => matchingCheckpointIds(flow, config.filters), [config.filters]);
  const total = flows.reduce((n, f) => n + f.checkpoints.length, 0);

  // While the viewer is open it keeps the checkpoints it opened with, so resolving a comment
  // that moves a screen out of the view does not pull it from under the reviewer.
  const [pinned, setPinned] = useState<readonly string[] | null>(null);
  const setSelection = (next: ReviewSelection | null) => {
    if (next && !pinned) setPinned(ordered.map((f) => f.resultId));
    if (!next) {
      setPinned(null);
      // Closing the viewer ends going through the feedback.
      if (resolving) setResolving(null);
      setQueue(null);
    }
    setSelectionState(next);
  };
  const feedbackCountsInScope = useMemo(() => feedbackScopeCounts(inScope), [inScope]);
  const resolveQueue = resolving ? queue : null;
  const viewerFlows = useMemo(() => {
    // Going through feedback, the viewer steps through the screens that carry some, as they are now.
    if (resolveQueue?.length) return flowsWithFeedback(byVariant, resolveQueue);
    if (!pinned) return ordered;
    const all = new Map(byVariant.map((f) => [f.resultId, f]));
    return pinned.flatMap((id) => all.get(id) ?? []);
  }, [resolveQueue, pinned, ordered, byVariant]);

  /** Shows a piece of feedback: its screen and variant, and its thread. */
  const goToItem = (item: FeedbackItem) => {
    const next = { checkpointId: item.checkpointId, variant: item.variant };
    if (item.number == null) return setSelectionState(next);
    if (onOpenThread) onOpenThread(next, item.number);
    else {
      setSelectionState(next);
      comments.onOpenThreadChange?.(item.number);
    }
  };
  /** Starts going through the feedback of `among` (the flows on screen by default), at its first item. */
  const startResolving = (scope: FeedbackScope = defaultFeedbackScope(feedbackCountsInScope), among: readonly ReviewFlowView[] = inScope) => {
    const items = feedbackQueue(among, scope);
    setInbox(false);
    if (!items.length && !selection) {
      setResolving(null);
      setQueue(null);
      return;
    }
    setQueue(items);
    setResolving(scope);
    const here = selection && items.find((i) => i.checkpointId === selection.checkpointId && (!selection.variant || i.variant === selection.variant));
    const first = here ?? items[0];
    if (first) goToItem(first);
  };
  // A link that says to go through feedback (`resolve=verify`) starts there, on the screen it names if that has some.
  // Only when `resolving` changes: a host that keeps it in the URL hands the `null` of closing the viewer down a
  // render after the queue is gone, and starting again in between would open the viewer that was just closed.
  useEffect(() => {
    if (resolving && !queue) startResolving(resolving);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolving]);

  const [reveal, setReveal] = useState<{ checkpointId: string } | null>(null);
  const lastSelection = useRef(selection);
  useEffect(() => {
    if (lastSelection.current && !selection) setReveal({ checkpointId: lastSelection.current.checkpointId });
    lastSelection.current = selection;
  }, [selection]);
  const latest = useRef({ setSelection });
  useLayoutEffect(() => {
    latest.current = { setSelection };
  });
  const onOpen = useCallback((checkpointId: string, v: string | null) => latest.current.setSelection({ checkpointId, variant: v }), []);
  const noop = useCallback(() => undefined, []);
  const pending = useMemo(() => (pendingIds?.length ? new Set(pendingIds) : NOTHING_PENDING), [pendingIds]);

  const folderActions = (target: FolderMenuTarget): FolderAction[] => {
    const below = searched.filter((f) => inFolder(f, treeGrouping, target.id));
    const open = attention.get(target.id ?? '') ?? 0;
    return [
      ...(onDecide ? [approveFolderAction(target, needsReviewCaptureIds(below), (ids) => onDecide({ captureIds: ids, decision: 'approved' }), pending)] : []),
      {
        key: 'needs-review',
        label: 'Show what needs review',
        icon: CircleDashed,
        onSelect: () => {
          setFolder(target.id);
          setConfig({ ...config, filters: { ...config.filters, states: ['needs-review'] } });
        },
      },
      ...(open
        ? [
            {
              key: 'resolve',
              label: 'Resolve feedback here',
              icon: ListChecks,
              onSelect: () => {
                setFolder(target.id);
                startResolving(defaultFeedbackScope(feedbackScopeCounts(below)), below);
              },
            },
          ]
        : []),
      {
        key: 'comments',
        label: open ? `Show ${open} open ${open === 1 ? 'comment' : 'comments'}` : 'No open comments',
        icon: MessageSquare,
        disabled: open === 0,
        onSelect: () => {
          setFolder(target.id);
          setInbox(true);
        },
      },
    ];
  };

  const openThread = (item: InboxItem) => {
    setInbox(false);
    const next = { checkpointId: item.checkpointId, variant: item.variant };
    if (!pinned) setPinned((ordered.some((f) => f.resultId === item.flow.resultId) ? ordered : [item.flow, ...ordered]).map((f) => f.resultId));
    if (onOpenThread) onOpenThread(next, item.thread.number);
    else {
      setSelectionState(next);
      comments.onOpenThreadChange?.(item.thread.number);
    }
  };

  if (flows.length === 0 || total === 0) {
    return <EmptyState icon={Images} title={emptyTitle} description={emptyDescription} />;
  }

  const filtered = config.filters.states.length > 0 || config.filters.priorities.length > 0;
  const ViewIcon = activeView ? (activeView.builtIn ? (BUILT_IN_ICONS[activeView.id] ?? Layers) : Bookmark) : Layers;
  const savedActive = activeView && !activeView.builtIn ? activeView : null;
  const canEdit = Boolean(onSaveView);
  const submitEditor = (input: { name: string; config: LibraryViewConfig }) => {
    if (!editor) return;
    if (editor.mode === 'edit' && editor.id) onUpdateView?.({ id: editor.id, name: input.name, config: input.config });
    else onSaveView?.(input);
    setEditor(null);
  };
  return (
    <div ref={rootRef} className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]" style={{ [SCREEN_ZOOM_VAR]: size } as React.CSSProperties}>
      <Button variant="outline" size="sm" className="justify-self-start lg:hidden" aria-expanded={railOpen} aria-controls="library-rail" onClick={() => setRailOpen((o) => !o)}>
        <PanelLeft /> {railOpen ? 'Hide views and folders' : `Views and folders · ${activeView?.name ?? 'All flows'}`}
      </Button>
      <aside
        id="library-rail"
        aria-label="Views and folders"
        className="hidden min-w-0 flex-col gap-5 data-open:flex lg:sticky lg:flex lg:top-[calc(var(--sticky-offset,0px)+1rem)] lg:max-h-[calc(100dvh-var(--sticky-offset,0px)-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pb-4"
        data-open={railOpen || undefined}
      >
        <LibraryViewList
          views={views}
          activeId={activeViewId}
          modified={modified}
          counts={viewCounts}
          onSelect={selectView}
          onRename={onUpdateView ? (v, name) => onUpdateView({ id: v.id, name }) : undefined}
          onDelete={onDeleteView}
          onEdit={onUpdateView ? (v) => setEditor({ mode: 'edit', id: v.id, name: v.name, config: v.id === activeViewId ? config : v.config }) : undefined}
          onDuplicate={canEdit ? (v) => setEditor({ mode: 'create', name: `${v.name} (copy)`.slice(0, 60), config: v.config }) : undefined}
          onCreate={canEdit ? () => setEditor({ mode: 'create', name: '', config }) : undefined}
          pendingId={viewPendingId}
        />
        <div className="border-t border-separator" />
        <ReviewTree
          folders={folders}
          selected={folder}
          onSelect={setFolder}
          grouping={treeGrouping}
          title={LIBRARY_FOLDERS_LABELS[config.folders]}
          allLabel={config.folders === 'suite' ? 'All suites' : 'All files'}
          total={searched.reduce((n, f) => n + f.checkpoints.flatMap((c) => c.captures).length, 0)}
          needsReview={0}
          showNeedsReview={false}
          attention={attention}
          folderActions={folderActions}
        />
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <div className="flex min-w-0 max-w-full items-center gap-2">
                <ViewIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <h2 className="min-w-0 truncate text-title-m" title={activeView?.description ?? describeViewConfig(config)}>
                  {activeView?.name ?? 'All flows'}
                </h2>
                {modified ? <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-label-xs text-muted-foreground">Edited</span> : null}
              </div>
              <ViewSaveControls
                modified={modified}
                savedViewName={savedActive?.name ?? null}
                canSave={canEdit}
                pending={Boolean(viewPendingId)}
                onReset={() => activeView && setConfig(activeView.config)}
                onSave={savedActive && onUpdateView ? () => onUpdateView({ id: savedActive.id, config }) : undefined}
                onSaveAs={canEdit ? () => setEditor({ mode: 'create', name: '', config }) : undefined}
              />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
              {/* On a phone the search takes its own line; the buttons wrap below it. */}
              <div className="relative min-w-0 basis-full sm:basis-auto">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a test, case or checkpoint" aria-label="Find a test, case or checkpoint" className="h-8 w-full pl-8 sm:w-64" />
              </div>
              <FeedbackInboxButton flows={inScope} onClick={() => setInbox(true)} />
              {feedbackCountsInScope.all ? (
                <Button
                  size="sm"
                  variant={feedbackCountsInScope.verify ? 'default' : 'outline'}
                  onClick={() => startResolving()}
                  aria-label={`Resolve feedback: ${feedbackCountsInScope.verify ? `${feedbackCountsInScope.verify} to verify, ` : ''}${feedbackCountsInScope.all} open`}
                  title="Go through the open feedback one by one: what changed since it was given first"
                >
                  <ListChecks /> Resolve feedback
                  {feedbackCountsInScope.verify ? <span className="rounded-full bg-primary-foreground/20 px-1.5 text-label-xs tabular-nums">{feedbackCountsInScope.verify}</span> : null}
                </Button>
              ) : null}
              <LibraryFilterMenu config={config} onChange={setConfig} counts={counts} />
              <LibraryDisplayMenu config={config} onChange={setConfig} variants={variants}>
                <SizeControl size={size} onLive={setLiveSize} onCommit={setSize} />
              </LibraryDisplayMenu>
            </div>
          </div>
          {filtered ? (
            <div className="flex flex-wrap items-center gap-2">
              <LibraryFilterChips config={config} onChange={setConfig} />
            </div>
          ) : null}
        </header>

        {visible.length === 0 ? (
          <EmptyState
            icon={ListFilter}
            title={filtered ? 'No flows match this view' : 'No flows match'}
            description={filtered ? 'Nothing here is in the states or priorities this view asks for — which may be good news.' : 'Try another folder or search.'}
          >
            {filtered ? (
              <Button variant="outline" size="sm" onClick={() => setConfig({ ...config, filters: { states: [], priorities: [] } })}>
                <X /> Clear filters
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <StoryboardRows
            sections={sections}
            headings
            size={size}
            canDecide={false}
            library
            pending={NOTHING_PENDING}
            onOpen={onOpen}
            onApproveFlow={noop}
            variantSelected={variant}
            reveal={reveal}
            matching={matching}
          />
        )}
      </div>

      <CheckpointViewer
        flows={viewerFlows}
        selection={selection}
        onSelectionChange={setSelection}
        canDecide={Boolean(onDecide)}
        onDecide={onDecide}
        pendingIds={pendingIds}
        onIgnoreRegionsChange={onIgnoreRegionsChange}
        ignorePendingId={ignorePendingId}
        frame={frame ?? DEFAULT_FRAME}
        onFrameChange={onFrameChange}
        mode="library"
        comments={comments}
        resolve={
          resolving && resolveQueue
            ? {
                items: resolveQueue,
                scope: resolving,
                counts: feedbackCountsInScope,
                onScopeChange: (next) => startResolving(next),
                onGo: goToItem,
              }
            : null
        }
      />
      <FeedbackInbox open={inbox} onOpenChange={setInbox} flows={inScope} now={comments.now} onOpenThread={openThread} onResolve={(scope) => startResolving(scope)} />
      <LibraryViewEditor
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        mode={editor?.mode ?? 'create'}
        initialName={editor?.name ?? ''}
        initialConfig={editor?.config ?? config}
        variants={variants}
        countFor={countFor}
        total={flows.length}
        onSubmit={submitEditor}
        pending={Boolean(viewPendingId)}
      />
      <ScrollToTop />
    </div>
  );
}
