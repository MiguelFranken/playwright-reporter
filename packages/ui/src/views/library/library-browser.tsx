'use client';

import { Bookmark, Images, Layers, ListFilter, PanelLeft, Search, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { EmptyState } from '../../patterns/empty-state';
import { LIBRARY_STATE_ICONS } from '../../patterns/library-state-chip';
import { ScrollToTop } from '../../patterns/scroll-to-top';
import { cn } from '../../lib/cn';
import {
  BUILT_IN_VIEWS,
  describeViewConfig,
  feedbackCounts,
  groupLibraryFlows,
  LIBRARY_FOLDERS_LABELS,
  LIBRARY_STATE_HINTS,
  LIBRARY_STATE_LABELS,
  LIBRARY_STATE_TONES,
  libraryCounts,
  matchesLibraryFilters,
  matchingCheckpointIds,
  sameViewConfig,
  sortLibraryFlows,
  type LibraryCounts,
  type LibraryState,
  type LibraryViewConfig,
  type LibraryViewDef,
} from '../../lib/library-views';
import { buildReviewTree, DEFAULT_FRAME, folderId, folderPathOf, inFolder, variantsOf, type FrameSettings, type ReviewFlowView, type ReviewGrouping } from '../../lib/review';
import { toneText } from '../../lib/tone';
import { CheckpointViewer, type ReviewCommentsProps, type ReviewSelection } from '../review/checkpoint-viewer';
import { filterFlows } from '../review/review-storyboard';
import { ReviewTree } from '../review/review-tree';
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

const SUMMARY_STATES: LibraryState[] = ['waiting', 'verify', 'needs-review', 'updated'];
/** The summary's short labels; the full one is the button's title. */
const SUMMARY_LABELS: Partial<Record<LibraryState, string>> = { waiting: 'Waiting', verify: 'To verify', 'needs-review': 'Needs review', updated: 'Updated' };
/** Nothing is being decided in the library. */
const NOTHING_PENDING: ReadonlySet<string> = new Set();

/**
 * Where the flows on screen stand, as one strip of four toggles that each
 * filter the library to one step of the review loop: what waits for
 * changes, what is ready to verify, what nobody reviewed, what changed since
 * the last capture. They add up: two pressed show the flows in either state.
 */
export function LibrarySummary({ counts, states, onToggle }: { counts: LibraryCounts; states: readonly LibraryState[]; onToggle: (state: LibraryState) => void }) {
  return (
    <div className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-lg border border-border bg-surface shadow-xs [scrollbar-width:none]" role="group" aria-label="Review state">
      {SUMMARY_STATES.map((s, i) => {
        const Icon = LIBRARY_STATE_ICONS[s];
        const active = states.includes(s);
        const n = counts.states[s];
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            aria-label={`${LIBRARY_STATE_LABELS[s]} ${n}`}
            onClick={() => onToggle(s)}
            title={LIBRARY_STATE_HINTS[s]}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-label-s whitespace-nowrap outline-none transition-colors focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/25',
              i > 0 && 'border-l border-border',
              i === 0 && 'rounded-l-[7px]',
              i === SUMMARY_STATES.length - 1 && 'rounded-r-[7px]',
              active ? 'bg-accent-subtle text-accent-text' : 'hover:bg-muted/60',
              n === 0 && !active && 'text-muted-foreground',
            )}
          >
            <Icon className={cn('size-3.5 shrink-0', active ? 'text-accent-text' : n ? toneText[LIBRARY_STATE_TONES[s]] : 'text-muted-foreground')} />
            <span>{SUMMARY_LABELS[s]}</span>
            <span className={cn('tabular-nums', active ? 'text-accent-text' : 'text-muted-foreground')}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

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
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
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
    if (!next) setPinned(null);
    setSelectionState(next);
  };
  const viewerFlows = useMemo(() => {
    if (!pinned) return ordered;
    const all = new Map(byVariant.map((f) => [f.resultId, f]));
    return pinned.flatMap((id) => all.get(id) ?? []);
  }, [pinned, ordered, byVariant]);

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
  const toggleState = (state: LibraryState) =>
    setConfig({ ...config, filters: { ...config.filters, states: config.filters.states.includes(state) ? config.filters.states.filter((s) => s !== state) : [...config.filters.states, state] } });

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
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a test, case or checkpoint" aria-label="Find a test, case or checkpoint" className="h-8 w-full pl-8 sm:w-64" />
              </div>
              <FeedbackInboxButton flows={inScope} onClick={() => setInbox(true)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LibrarySummary counts={counts} states={config.filters.states} onToggle={toggleState} />
            <LibraryFilterMenu config={config} onChange={setConfig} counts={counts} />
            <LibraryFilterChips config={config} onChange={setConfig} />
            <div className="ml-auto">
              <LibraryDisplayMenu config={config} onChange={setConfig} variants={variants}>
                <SizeControl size={size} onLive={setLiveSize} onCommit={setSize} />
              </LibraryDisplayMenu>
            </div>
          </div>
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
        canDecide={false}
        frame={frame ?? DEFAULT_FRAME}
        onFrameChange={onFrameChange}
        mode="library"
        comments={comments}
      />
      <FeedbackInbox open={inbox} onOpenChange={setInbox} flows={inScope} now={comments.now} onOpenThread={openThread} />
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
