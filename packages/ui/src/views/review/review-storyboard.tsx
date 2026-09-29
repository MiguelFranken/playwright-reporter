'use client';

import { ArrowDownWideNarrow, Check, ChevronRight, CircleAlert, ClipboardList, Film, Folder, Images, Route, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from '@tanstack/react-virtual';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Slider } from '../../components/slider';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { CommentCountBadge } from '../../patterns/comment-count-badge';
import { EmptyState } from '../../patterns/empty-state';
import { ReviewStatusBadge, ReviewStatusDot } from '../../patterns/review-status-badge';
import { StatusIcon } from '../../patterns/status-badge';
import { Link } from '../../provider';
import { cn } from '../../lib/cn';
import {
  buildReviewTree,
  captureViewport,
  changeScore,
  checkpointLabel,
  compareVariants,
  countStatuses,
  DEFAULT_FRAME,
  flattenFolders,
  inFolder,
  matchesReviewFilter,
  NEEDS_REVIEW,
  REVIEW_FILTER_LABELS,
  REVIEW_FILTERS,
  REVIEW_STATUS_TONES,
  variantsOf,
  worstStatus,
  type FrameSettings,
  type ReviewCheckpointView,
  type ReviewDecisionInput,
  type ReviewFilter,
  type ReviewFlowView,
  type ReviewCaptureView,
  type ReviewFolder,
  type ReviewGrouping,
  type ReviewSort,
  type StoryboardMode,
} from '../../lib/review';
import { openThreadCount } from '../../lib/review-threads';
import { toneSolid } from '../../lib/tone';
import { CheckpointViewer, type ReviewCommentsProps, type ReviewSelection } from './checkpoint-viewer';
import { DiffBadge, DiffMarks } from './diff-summary';
import type { IgnoreRect } from './ignore-regions-editor';
import { ReviewTree } from './review-tree';
import { SCREEN_ZOOM_VAR, ScreenFrame } from './screen-frame';

export type { ReviewSelection };

/** The overview's scale of a capture's real size: 10% (a strip of stamps) to 50% (readable, scrolling screens). */
export const STORYBOARD_SIZE = { min: 0.1, max: 0.5, key: 0.01, jump: 0.05, default: 0.18 } as const;
/** From this scale the frames load the full image and scroll, so a flow can be read without opening it. */
const SCROLL_FROM = 0.28;

/** Uncontrolled unless the host passes the value: stories drive it, the app binds it to the URL. */
function useControlled<T>(value: T | undefined, onChange: ((v: T) => void) | undefined, initial: T): [T, (v: T) => void] {
  const [own, setOwn] = useState(initial);
  return value === undefined ? [own, (v) => (setOwn(v), onChange?.(v))] : [value, (v) => onChange?.(v)];
}

/**
 * The flows and checkpoints the filters leave, each checkpoint keeping only the matching variants.
 * What a filter leaves whole is returned as it came, so a row whose flow is untouched does not render again.
 */
export function filterFlows(flows: readonly ReviewFlowView[], filter: ReviewFilter, variant: string | null, query: string): ReviewFlowView[] {
  const q = query.trim().toLowerCase();
  const keep = (cap: ReviewCaptureView) => (!variant || cap.variant === variant) && matchesReviewFilter(cap.status, filter);
  const out: ReviewFlowView[] = [];
  for (const f of flows) {
    if (
      q &&
      ![...f.titlePath, f.file, ...(f.cases ?? []).flatMap((c) => [c.key, c.title]), ...f.checkpoints.flatMap((c) => [c.name, c.title ?? ''])].some((s) => s.toLowerCase().includes(q))
    )
      continue;
    let changed = false;
    const checkpoints: ReviewCheckpointView[] = [];
    for (const c of f.checkpoints) {
      const captures = c.captures.filter(keep);
      if (captures.length !== c.captures.length) changed = true;
      if (captures.length === c.captures.length) checkpoints.push(c);
      else if (captures.length > 0) checkpoints.push({ ...c, captures });
    }
    if (checkpoints.length > 0) out.push(changed ? { ...f, checkpoints } : f);
  }
  return out;
}

/** The most a flow changed: its most changed image's score (see `changeScore`). */
const flowChange = (f: ReviewFlowView) => Math.max(0, ...f.checkpoints.flatMap((c) => c.captures.map(changeScore)));

/** Flows with the most changed first; ties keep their order. */
export function sortFlows(flows: readonly ReviewFlowView[], sort: ReviewSort): ReviewFlowView[] {
  if (sort === 'sequence') return [...flows];
  return flows
    .map((f, i) => ({ f, i, score: flowChange(f) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.f);
}

/**
 * A review as a storyboard: the flows in the folders they belong to — their
 * test cases' suites, or their spec files — each test a row of its
 * checkpoints left to right in capture order, every capture on a screen of
 * its own shape (a phone is portrait), desktop beside mobile.
 *
 * The size slider scales every screen together; from about a quarter of the
 * real size the screens load the full image and scroll, so a flow can be
 * read without opening a single checkpoint. The filter defaults to what needs
 * review. Opening a checkpoint shows it full size with its baseline.
 */
export function ReviewStoryboard({
  flows,
  filter: filterProp,
  onFilterChange,
  variant: variantProp,
  onVariantChange,
  query: queryProp,
  onQueryChange,
  selection: selectionProp,
  onSelectionChange,
  grouping: groupingProp,
  onGroupingChange,
  folder: folderProp,
  onFolderChange,
  size: sizeProp,
  onSizeChange,
  frame,
  onFrameChange,
  onDecide,
  pendingIds = [],
  canDecide = true,
  toolbar = true,
  tree = toolbar,
  emptyTitle = 'No review checkpoints in this run',
  emptyDescription,
  mode = 'review',
  sort: sortProp,
  onSortChange,
  onIgnoreRegionsChange,
  ignorePendingId,
  comments,
}: {
  flows: readonly ReviewFlowView[];
  filter?: ReviewFilter;
  onFilterChange?: (next: ReviewFilter) => void;
  /** A variant name, or `null` for every variant side by side. */
  variant?: string | null;
  onVariantChange?: (next: string | null) => void;
  query?: string;
  onQueryChange?: (next: string) => void;
  selection?: ReviewSelection | null;
  onSelectionChange?: (next: ReviewSelection | null) => void;
  grouping?: ReviewGrouping;
  onGroupingChange?: (next: ReviewGrouping) => void;
  /** The folder shown, by id (`Checkout / Coupons`), or `null` for all. */
  folder?: string | null;
  onFolderChange?: (next: string | null) => void;
  /** The screens' scale of the real size, within `STORYBOARD_SIZE`. */
  size?: number;
  onSizeChange?: (next: number) => void;
  /** The viewer's screen settings. */
  frame?: FrameSettings;
  onFrameChange?: (next: FrameSettings) => void;
  onDecide?: (input: ReviewDecisionInput) => void;
  pendingIds?: readonly string[];
  canDecide?: boolean;
  /** Filters, size and bulk actions above the rows; off where one flow is embedded. */
  toolbar?: boolean;
  /** The folder tree beside the rows. */
  tree?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  /** `library` shows the screens as documentation: no statuses, filters or approvals. */
  mode?: StoryboardMode;
  /** Journey order, or the most changed tests first. */
  sort?: ReviewSort;
  onSortChange?: (next: ReviewSort) => void;
  onIgnoreRegionsChange?: (input: { captureId: string; regions: IgnoreRect[] }) => void;
  ignorePendingId?: string | null;
  /** Comment threads on the images, in the viewer. */
  comments?: ReviewCommentsProps;
}) {
  const library = mode === 'library';
  const hasNeedsReview = useMemo(() => flows.some((f) => f.checkpoints.some((c) => c.captures.some((cap) => NEEDS_REVIEW.includes(cap.status)))), [flows]);
  const hasCases = useMemo(() => flows.some((f) => f.cases?.length), [flows]);
  const [filter, setFilter] = useControlled<ReviewFilter>(filterProp, onFilterChange, toolbar && hasNeedsReview && !library ? 'needs-review' : 'all');
  const [variant, setVariant] = useControlled<string | null>(variantProp, onVariantChange, null);
  const [query, setQuery] = useControlled<string>(queryProp, onQueryChange, '');
  const [selection, setSelectionState] = useControlled<ReviewSelection | null>(selectionProp, onSelectionChange, null);
  const [grouping, setGrouping] = useControlled<ReviewGrouping>(groupingProp, onGroupingChange, hasCases ? 'suite' : 'file');
  const [folder, setFolder] = useControlled<string | null>(folderProp, onFolderChange, null);
  const [size, setSize] = useControlled<number>(sizeProp, onSizeChange, STORYBOARD_SIZE.default);
  const [sort, setSort] = useControlled<ReviewSort>(sortProp, onSortChange, 'sequence');
  const measured = useMemo(() => flows.some((f) => f.checkpoints.some((c) => c.captures.some((cap) => cap.diff?.state === 'done'))), [flows]);
  // Dragging the size slider scales the screens through a CSS variable, set at most once a frame, instead of
  // re-rendering every row; the rows render again once, when the slider lets go.
  const rootRef = useRef<HTMLDivElement>(null);
  const setLiveSize = (v: number) => rootRef.current?.style.setProperty(SCREEN_ZOOM_VAR, String(v));
  // While the viewer is open it keeps the checkpoints it opened with, so a
  // decision that moves one out of the filter does not pull it from under the reviewer.
  const [pinned, setPinned] = useState<ReadonlySet<string> | null>(null);

  const variants = useMemo(() => variantsOf(flows), [flows]);
  const effectiveFilter = toolbar && !library ? filter : 'all';
  const searched = useMemo(() => filterFlows(flows, 'all', variant, toolbar ? query : ''), [flows, variant, query, toolbar]);
  const folders = useMemo(() => buildReviewTree(searched, grouping), [searched, grouping]);
  const visible = useMemo(
    () => filterFlows(searched, effectiveFilter, null, '').filter((f) => !tree || inFolder(f, grouping, folder)),
    [searched, effectiveFilter, tree, grouping, folder],
  );
  // Most changed first ranks across folders: one list, the loudest change on top.
  const sections = useMemo(
    () =>
      sort === 'most-changed' && !library
        ? [{ id: 'Most changed first', name: 'Most changed first', path: ['Most changed first'], flows: sortFlows(visible, 'most-changed'), children: [], total: 0, needsReview: 0 }]
        : flattenFolders(buildReviewTree(visible, grouping)),
    [visible, grouping, sort, library],
  );
  const counts = useMemo(() => countStatuses(flows, variant), [flows, variant]);
  const total = counts.approved + counts.changes_requested + counts.changed + counts.new;
  const searchedCounts = useMemo(() => countStatuses(searched), [searched]);
  const pending = useMemo(() => new Set(pendingIds), [pendingIds]);
  const ordered = useMemo(() => sections.flatMap((s) => s.flows), [sections]);
  // Where the viewer was when it closed: the rows scroll there if it is out of view.
  const [reveal, setReveal] = useState<{ checkpointId: string } | null>(null);
  const lastSelection = useRef(selection);
  useEffect(() => {
    if (lastSelection.current && !selection) setReveal({ checkpointId: lastSelection.current.checkpointId });
    lastSelection.current = selection;
  }, [selection]);

  const setSelection = (next: ReviewSelection | null) => {
    if (next && !pinned) setPinned(new Set(ordered.flatMap((f) => f.checkpoints.map((c) => c.id))));
    if (!next) setPinned(null);
    setSelectionState(next);
  };
  // The rows are memoised; they get callbacks that never change and call the current ones.
  const latest = useRef({ setSelection, onDecide });
  useLayoutEffect(() => {
    latest.current = { setSelection, onDecide };
  });
  const onOpen = useCallback((checkpointId: string, v: string | null) => latest.current.setSelection({ checkpointId, variant: v }), []);
  const onApproveFlow = useCallback((ids: string[]) => latest.current.onDecide?.({ captureIds: ids, decision: 'approved' }), []);
  const viewerFlows = useMemo(() => {
    if (!pinned) return ordered;
    const all = new Map(filterFlows(flows, 'all', variant, '').map((f) => [f.resultId, f]));
    return ordered
      .map((f) => all.get(f.resultId) ?? f)
      .map((f) => ({ ...f, checkpoints: f.checkpoints.filter((c) => pinned.has(c.id)) }))
      .filter((f) => f.checkpoints.length > 0);
  }, [pinned, ordered, flows, variant]);

  const shownToApprove = useMemo(() => needsReviewIds(visible), [visible]);

  if (flows.length === 0 || total === 0) {
    return (
      <EmptyState
        icon={Images}
        title={emptyTitle}
        description={
          emptyDescription ?? (
            <>
              Capture checkpoints with <code className="text-code-s">review(&apos;name&apos;)</code> from <code className="text-code-s">@miguelfranken/reporter/review</code>, or attach images named{' '}
              <code className="text-code-s">review:&lt;name&gt;:&lt;variant&gt;</code>.
            </>
          )
        }
      />
    );
  }

  const rows =
    visible.length === 0 ? (
      <EmptyState
        icon={Check}
        title={effectiveFilter === 'needs-review' && !query && !folder ? 'Nothing needs review' : 'No checkpoints match'}
        description={effectiveFilter === 'needs-review' && !query && !folder ? 'Every image matches an approved one or was decided about.' : 'Try another filter, folder or search.'}
      >
        {effectiveFilter !== 'all' ? (
          <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
            Show all {total} images
          </Button>
        ) : null}
      </EmptyState>
    ) : (
      <StoryboardRows
        sections={sections}
        headings={tree || sections.length > 1}
        size={size}
        canDecide={canDecide && Boolean(onDecide) && !library}
        library={library}
        pending={pending}
        onOpen={onOpen}
        onApproveFlow={onApproveFlow}
        variantSelected={variant}
        reveal={reveal}
      />
    );

  return (
    <div ref={rootRef} className="flex flex-col gap-5" style={{ [SCREEN_ZOOM_VAR]: size } as React.CSSProperties}>
      {toolbar ? (
        <div className={cn('flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between', library && 'items-end 2xl:justify-end')}>
          {library ? null : (
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-sunken p-1" role="group" aria-label="Filter by review status">
            {REVIEW_FILTERS.map((f) => {
              const n = f === 'all' ? total : f === 'needs-review' ? counts.changed + counts.new : counts[f];
              const active = f === filter;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-label-s transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                    active ? 'bg-surface text-foreground shadow-e1' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f !== 'all' && f !== 'needs-review' ? <span aria-hidden className={cn('size-1.5 rounded-full', toneSolid[REVIEW_STATUS_TONES[f]])} /> : null}
                  {REVIEW_FILTER_LABELS[f]}
                  <span className="tabular-nums text-muted-foreground">{n}</span>
                </button>
              );
            })}
          </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {variants.length > 1 ? (
              <ToggleGroup variant="segment" size="sm" value={[variant ?? 'all']} onValueChange={(v) => v[0] && setVariant(v[0] === 'all' ? null : String(v[0]))} aria-label="Variant">
                <ToggleGroupItem value="all">All variants</ToggleGroupItem>
                {variants.map((v) => (
                  <ToggleGroupItem key={v} value={v} className="capitalize">
                    {v}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : null}
            {measured && !library ? (
              <Button variant={sort === 'most-changed' ? 'secondary' : 'outline'} size="sm" aria-pressed={sort === 'most-changed'} onClick={() => setSort(sort === 'most-changed' ? 'sequence' : 'most-changed')}>
                <ArrowDownWideNarrow /> Most changed first
              </Button>
            ) : null}
            <SizeControl size={size} onLive={setLiveSize} onCommit={setSize} />
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a test, case or checkpoint" aria-label="Find a test, case or checkpoint" className="h-8 w-60 pl-8" />
            </div>
            {canDecide && onDecide && !library ? (
              <Button size="sm" disabled={shownToApprove.length === 0 || shownToApprove.some((id) => pending.has(id))} onClick={() => onDecide({ captureIds: shownToApprove, decision: 'approved' })}>
                <Check /> Approve {shownToApprove.length} shown
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tree ? (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
            <ReviewTree
              folders={folders}
              selected={folder}
              onSelect={setFolder}
              grouping={grouping}
              onGroupingChange={(g) => {
                setGrouping(g);
                setFolder(null);
              }}
              total={searchedCounts.approved + searchedCounts.changes_requested + searchedCounts.changed + searchedCounts.new}
              needsReview={searchedCounts.changed + searchedCounts.new}
              showNeedsReview={!library}
            />
          </aside>
          <div className="min-w-0">{rows}</div>
        </div>
      ) : (
        rows
      )}

      <CheckpointViewer
        flows={viewerFlows}
        selection={selection}
        onSelectionChange={setSelection}
        onDecide={onDecide}
        pendingIds={pendingIds}
        canDecide={canDecide}
        frame={frame ?? DEFAULT_FRAME}
        onFrameChange={onFrameChange}
        mode={mode}
        onIgnoreRegionsChange={onIgnoreRegionsChange}
        ignorePendingId={ignorePendingId}
        comments={comments}
      />
    </div>
  );
}

const needsReviewIds = (list: readonly ReviewFlowView[]) =>
  list.flatMap((f) => f.checkpoints.flatMap((c) => c.captures.filter((cap) => NEEDS_REVIEW.includes(cap.status)).map((cap) => cap.id)));

type RowItem = { kind: 'heading'; key: string; section: ReviewFolder; first: boolean } | { kind: 'flow'; key: string; flow: ReviewFlowView; first: boolean };

/** How far past the screen rows stay rendered, in rows: what a quick scroll reaches before the next frame. */
const OVERSCAN = 4;
/** The screen the server renders the first rows for, before the browser can say how large it is. */
const INITIAL_RECT = { width: 1280, height: 1000 } as const;

/**
 * A row's height before it is measured, from the screens it holds: close
 * enough that the scrollbar does not jump when the real row takes its place.
 */
function estimateRow(item: RowItem, size: number, library: boolean): number {
  if (item.kind === 'heading') return (item.first ? 0 : 24) + 42;
  const { flow } = item;
  const tallest = Math.max(
    24,
    ...flow.checkpoints.map((c) => Math.max(0, ...c.captures.map((cap) => captureViewport(cap).height)) * size),
    flow.failureImage && !library ? 720 * size : 0,
  );
  const described = library && flow.checkpoints.some((c) => c.description) ? 44 : 0;
  // Padding, the title and file lines, the checkpoint label, the variant line.
  return 40 + 48 + 16 + 32 + tallest + described + 30;
}

/**
 * The rows, virtualised against the window: only the rows on screen and a
 * few either side are in the document, so a run with hundreds of tests
 * renders, scrolls and resizes as quickly as one with ten. Each row is
 * measured as it renders (and again when the size slider resizes it), the
 * heading of the section being scrolled through stays pinned at the top.
 */
function StoryboardRows({
  sections,
  headings,
  size,
  canDecide,
  library,
  pending,
  onOpen,
  onApproveFlow,
  variantSelected,
  reveal,
}: {
  sections: readonly ReviewFolder[];
  headings: boolean;
  size: number;
  canDecide: boolean;
  library: boolean;
  pending: ReadonlySet<string>;
  onOpen: (checkpointId: string, variant: string | null) => void;
  onApproveFlow: (ids: string[]) => void;
  variantSelected: string | null;
  reveal: { checkpointId: string } | null;
}) {
  const items = useMemo(() => {
    const out: RowItem[] = [];
    sections.forEach((section, i) => {
      if (headings) out.push({ kind: 'heading', key: `folder:${section.id}`, section, first: i === 0 });
      section.flows.forEach((flow, j) => out.push({ kind: 'flow', key: `${section.id}:${flow.resultId}`, flow, first: j === 0 }));
    });
    return out;
  }, [sections, headings]);
  const headingIndexes = useMemo(() => items.flatMap((item, i) => (item.kind === 'heading' ? [i] : [])), [items]);

  // The window scrolls; the rows start where this list does on the page.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => setScrollMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
    update();
    // Anything above the list that grows or wraps (the toolbar, a banner) moves it.
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const activeHeading = useRef(-1);
  const rangeExtractor = useCallback(
    (range: Range) => {
      activeHeading.current = headingIndexes.findLast((i) => i <= range.startIndex) ?? -1;
      const shown = defaultRangeExtractor(range);
      return activeHeading.current >= 0 && !shown.includes(activeHeading.current) ? [activeHeading.current, ...shown] : shown;
    },
    [headingIndexes],
  );

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (i) => estimateRow(items[i], size, library),
    getItemKey: (i) => items[i].key,
    overscan: OVERSCAN,
    scrollMargin,
    rangeExtractor,
    initialRect: INITIAL_RECT,
    // The same first rows on the server and in the browser's first render.
    initialOffset: 0,
    useFlushSync: false,
  });

  useEffect(() => {
    if (!reveal) return;
    const index = items.findIndex((item) => item.kind === 'flow' && item.flow.checkpoints.some((c) => c.id === reveal.checkpointId));
    if (index < 0) return;
    const shown = virtualizer.getVirtualItems().filter((v) => v.index !== activeHeading.current);
    const [top, bottom] = [shown[0]?.index ?? -1, shown.at(-1)?.index ?? -1];
    // Only when the row is out of the rendered range; a row already near the screen stays where the reviewer left it.
    if (index > top + OVERSCAN && index < bottom - OVERSCAN) return;
    virtualizer.scrollToIndex(index, { align: 'center' });
    // Only a new close should move the page, not a change of the rows.
  }, [reveal]);

  const virtualItems = virtualizer.getVirtualItems();
  return (
    <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualItems.map((v) => {
        const item = items[v.index];
        const sticky = item.kind === 'heading' && v.index === activeHeading.current;
        return (
          <div
            key={v.key}
            ref={virtualizer.measureElement}
            data-index={v.index}
            className={cn('top-0 left-0 w-full', sticky ? 'sticky z-10' : 'absolute')}
            style={sticky ? undefined : { transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
          >
            {item.kind === 'heading' ? (
              <SectionHeading section={item.section} first={item.first} />
            ) : (
              <FlowRow
                flow={item.flow}
                first={item.first}
                size={size}
                canDecide={canDecide}
                library={library}
                pending={pending}
                onOpen={onOpen}
                onApproveFlow={onApproveFlow}
                variantSelected={variantSelected}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionHeading({ section, first }: { section: ReviewFolder; first: boolean }) {
  return (
    <div className={first ? undefined : 'pt-6'}>
      <h2 className="-mx-1 mb-1 flex items-center gap-1.5 border-b border-separator bg-surface/95 px-1 py-2 text-label-m text-muted-foreground backdrop-blur">
        <Folder className="size-4 shrink-0" />
        {section.path.map((part, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <ChevronRight aria-hidden className="size-3.5 shrink-0" /> : null}
            <span className={cn('truncate', i === section.path.length - 1 && 'text-foreground')}>{part}</span>
          </span>
        ))}
        <span className="ml-1 text-label-xs tabular-nums">· {section.flows.length}</span>
      </h2>
    </div>
  );
}

const FlowRow = memo(function FlowRow({
  flow,
  first,
  size,
  canDecide,
  library,
  pending,
  onOpen,
  onApproveFlow,
  variantSelected,
}: {
  flow: ReviewFlowView;
  first: boolean;
  size: number;
  canDecide: boolean;
  library: boolean;
  pending: ReadonlySet<string>;
  onOpen: (checkpointId: string, variant: string | null) => void;
  onApproveFlow: (ids: string[]) => void;
  variantSelected: string | null;
}) {
  const needsReview = useMemo(() => needsReviewIds([flow]), [flow]);
  const failed = flow.outcome === 'failed' || flow.outcome === 'timedout' || flow.outcome === 'interrupted';
  const heading = flow.titlePath.length ? flow.titlePath.join(' › ') : flow.title;
  return (
    <article className={cn('py-5', !first && 'border-t border-separator')} aria-label={flow.titlePath.length ? flow.titlePath.join(' › ') : flow.title}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          {library ? <Route aria-hidden className="size-4 text-muted-foreground" /> : <StatusIcon status={flow.outcome} />}
          <h3 className="truncate text-title-s" title={heading}>
            <Link href={flow.resultHref} className="hover:underline">
              {heading}
            </Link>
          </h3>
          <p className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate text-code-s" title={flow.file}>
              {flow.file}
              {flow.line ? `:${flow.line}` : ''}
            </span>
            {flow.project ? (
              <Badge variant="secondary" className="text-label-xs">
                {flow.project}
              </Badge>
            ) : null}
            {flow.cases?.map((c) => (
              <Link key={c.key} href={c.href} className="inline-flex items-center gap-1 rounded-md bg-accent-subtle px-1.5 py-0.5 text-label-xs text-accent-text hover:underline" title={c.title}>
                <ClipboardList className="size-3" />
                {c.key} <span className="max-w-48 truncate">{c.title}</span>
              </Link>
            ))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 md:self-start">
          {flow.videoUrl ? (
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={flow.videoUrl} target="_blank" rel="noreferrer" />}>
              <Film /> Video
            </Button>
          ) : null}
          {flow.traceUrl && !library ? (
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={flow.traceUrl} target="_blank" rel="noreferrer" />}>
              <Route /> Trace
            </Button>
          ) : null}
          {canDecide && needsReview.length ? (
            <Button variant="outline" size="sm" disabled={needsReview.some((id) => pending.has(id))} onClick={() => onApproveFlow(needsReview)}>
              <Check /> Approve test ({needsReview.length})
            </Button>
          ) : null}
        </div>
      </div>
      <ol className="mt-4 flex items-start gap-6 overflow-x-auto pb-2 pl-7" aria-label={`Checkpoints of ${flow.title}`}>
        {flow.checkpoints.map((cp) => (
          <CheckpointColumn key={cp.id} checkpoint={cp} size={size} onOpen={onOpen} variantSelected={variantSelected} library={library} />
        ))}
        {failed && flow.failureImage && !library ? (
          <li className="flex shrink-0 flex-col gap-2">
            <a href={flow.resultHref} className="inline-flex h-6 items-center gap-1.5 text-label-m text-danger-text hover:underline">
              <CircleAlert className="size-4" /> Failed here
            </a>
            <ScreenFrame image={flow.failureImage} frame={{ width: 1280, height: 720 }} zoom={size} live alt="Screenshot at the failure" scroll={false} tone="danger" />
          </li>
        ) : null}
      </ol>
    </article>
  );
});

/** The pointer's precision: far below a pixel of the track, so the thumb follows the pointer instead of snapping to steps. */
const POINTER_STEP = 0.0001;
/** How fast the screens catch up with the value, as the time constant of an exponential ease (the same at any frame rate). */
const EASE_MS = { drag: 40, jump: 90 } as const;
/** Arrow keys move by `key`, with Shift and Page Up/Down by `jump`. */
const KEY_STEPS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 };

const clampSize = (v: number) => Math.min(STORYBOARD_SIZE.max, Math.max(STORYBOARD_SIZE.min, v));

/**
 * The screen-size slider. The thumb follows the pointer continuously, and the
 * screens follow the value in one `requestAnimationFrame` loop that eases
 * toward it and writes it to their CSS variable (`onLive`), so uneven pointer
 * events still move them smoothly and a click, a key or a zoom button glides
 * instead of jumping. Nothing re-renders the rows until the motion settles
 * after the slider lets go; then `onCommit` renders them once at the new size.
 */
function SizeControl({ size, onLive, onCommit }: { size: number; onLive: (v: number) => void; onCommit: (v: number) => void }) {
  // The thumb's value while the slider is in motion; the committed size at rest.
  const [thumb, setThumb] = useState<number | null>(null);
  const motion = useRef({ x: size, target: size, ease: EASE_MS.drag as number, frame: 0, last: 0, dragging: false, commit: false });
  useEffect(() => () => cancelAnimationFrame(motion.current.frame), []);
  const shown = thumb ?? size;

  const settle = () => {
    const m = motion.current;
    if (!m.commit || m.dragging || m.frame) return;
    m.commit = false;
    onCommit(+m.target.toFixed(4));
    setThumb(null);
  };
  const tick = (now: number) => {
    const m = motion.current;
    const dt = m.last ? Math.min(now - m.last, 64) : 16;
    m.last = now;
    m.x += (m.target - m.x) * (1 - Math.exp(-dt / m.ease));
    if (Math.abs(m.target - m.x) < 0.0002) m.x = m.target;
    onLive(m.x);
    // Outside a drag the thumb glides with the screens.
    if (!m.dragging) setThumb(m.x);
    if (m.x !== m.target) {
      m.frame = requestAnimationFrame(tick);
    } else {
      m.frame = 0;
      m.last = 0;
      settle();
    }
  };
  const moveTo = (v: number, ease: number) => {
    const m = motion.current;
    // From rest, start where the screens are: the committed size.
    if (!m.frame && thumb === null) m.x = size;
    m.target = clampSize(v);
    m.ease = ease;
    if (!m.frame) m.frame = requestAnimationFrame(tick);
  };
  /** Moves by `by` from where the slider is heading, on the 1% grid, and commits there. */
  const step = (by: number) => {
    const m = motion.current;
    const from = m.frame || thumb !== null ? m.target : size;
    m.commit = true;
    moveTo(Math.round((from + by) / STORYBOARD_SIZE.key) * STORYBOARD_SIZE.key, EASE_MS.jump);
  };

  const icon = 'rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-40';
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2 py-1" title="Screen size">
      <button type="button" aria-label="Smaller screens" disabled={shown <= STORYBOARD_SIZE.min} onClick={() => step(-STORYBOARD_SIZE.jump)} className={icon}>
        <ZoomOut className="size-4" />
      </button>
      <Slider
        className="w-28"
        min={STORYBOARD_SIZE.min}
        max={STORYBOARD_SIZE.max}
        step={POINTER_STEP}
        value={shown}
        onValueChange={(v, details) => {
          const value = Array.isArray(v) ? v[0] : v;
          const m = motion.current;
          m.dragging = details.reason === 'drag';
          if (m.dragging) setThumb(value);
          moveTo(value, m.dragging ? EASE_MS.drag : EASE_MS.jump);
        }}
        onValueCommitted={() => {
          const m = motion.current;
          m.dragging = false;
          m.commit = true;
          settle();
        }}
        // With a pointer step this fine, the keys keep their own, coarser steps.
        onKeyDownCapture={(e) => {
          const n = KEY_STEPS[e.key];
          if (!n) return;
          e.preventDefault();
          e.stopPropagation();
          step(n * (e.shiftKey && Math.abs(n) === 1 ? STORYBOARD_SIZE.jump : STORYBOARD_SIZE.key));
        }}
        thumbLabel="Screen size"
        valueText={(v) => `${Math.round(v * 100)}% of the real size`}
      />
      <button type="button" aria-label="Larger screens" disabled={shown >= STORYBOARD_SIZE.max} onClick={() => step(STORYBOARD_SIZE.jump)} className={icon}>
        <ZoomIn className="size-4" />
      </button>
      <span className="w-9 text-right text-label-s text-muted-foreground tabular-nums">{Math.round(shown * 100)}%</span>
    </div>
  );
}

/** The gap between the variants of one checkpoint, in px; the checkpoints themselves sit twice as far apart. */
const VARIANT_GAP = 12;

function CheckpointColumn({
  checkpoint,
  size,
  onOpen,
  variantSelected,
  library,
}: {
  checkpoint: ReviewCheckpointView;
  size: number;
  onOpen: (checkpointId: string, variant: string | null) => void;
  variantSelected: string | null;
  library: boolean;
}) {
  const captures = [...checkpoint.captures].sort((a, b) => compareVariants(a.variant, b.variant));
  const status = worstStatus(captures.map((c) => c.status));
  const label = checkpointLabel(checkpoint.name, checkpoint.title);
  const scroll = size >= SCROLL_FROM;
  const realWidth = captures.reduce((sum, c) => sum + captureViewport(c).width, 0);
  const open = (variant: string | null) => onOpen(checkpoint.id, variantSelected ?? variant);
  return (
    <li className="flex shrink-0 flex-col gap-2" style={{ width: `max(150px, calc(${realWidth}px * var(${SCREEN_ZOOM_VAR}, ${size}) + ${VARIANT_GAP * (captures.length - 1)}px))` }}>
      <div className="flex h-6 items-center gap-2">
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-label-xs text-muted-foreground tabular-nums">
          {checkpoint.sequence + 1}
        </span>
        <button
          type="button"
          onClick={() => open(captures.length === 1 ? captures[0].variant : null)}
          aria-label={`Open ${checkpoint.sequence + 1}. ${label}`}
          className="min-w-0 truncate text-left text-label-m outline-none hover:underline focus-visible:underline"
          title={checkpoint.description ?? label}
        >
          {label}
        </button>
        {library || status === 'approved' ? null : <ReviewStatusBadge status={status} className="shrink-0" />}
      </div>
      {library && checkpoint.description ? <p className="-mt-1 line-clamp-2 pl-7 text-body-s text-muted-foreground">{checkpoint.description}</p> : null}
      <div className="flex items-start" style={{ gap: VARIANT_GAP }}>
        {captures.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5">
            {/* A click opens the viewer; the wheel scrolls the screen. The label above is the keyboard way in. */}
            <div onClick={() => open(c.variant)} className="relative cursor-zoom-in">
              <CommentCountBadge count={openThreadCount(c.threads)} />
              <ScreenFrame
                image={c.image}
                frame={captureViewport(c)}
                zoom={size}
                live
                alt={`${label} — ${c.variant}`}
                scroll={scroll}
                label={`${label}, ${c.variant} screen`}
                tone={library ? undefined : c.status === 'changed' ? 'warning' : c.status === 'new' ? 'info' : c.status === 'changes_requested' ? 'danger' : undefined}
                overlay={library && !c.compare ? undefined : (shown) => <ChangeMarks capture={c} shown={shown} />}
              />
            </div>
            <span className="flex flex-wrap items-center gap-1.5 text-label-xs text-muted-foreground">
              {library ? null : <ReviewStatusDot status={c.status} />}
              <span className="capitalize">{c.variant}</span>
              {library && !c.compare ? null : c.compare?.same ? (
                <span>same as {c.compare.label}</span>
              ) : (
                <DiffBadge diff={c.diff} decision={library ? null : c.decision} className="h-4 px-1 text-label-xs" />
              )}
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}

/**
 * Where a screen changed, boxed on the storyboard's small screen. A preview
 * shows only the first screen of the page, so only the boxes on it are drawn.
 */
function ChangeMarks({ capture, shown }: { capture: ReviewCaptureView; shown: 'full' | 'preview' }) {
  const d = capture.diff;
  if (!d || d.state !== 'done' || !d.regions.length || (capture.status === 'approved' && !capture.compare)) return null;
  const size = d.head ?? (capture.image.width && capture.image.height ? { width: capture.image.width, height: capture.image.height } : null);
  if (!size) return null;
  const viewport = captureViewport(capture);
  const cover = shown === 'full' ? size.height : Math.min(size.height, Math.round((viewport.height * size.width) / viewport.width));
  return <DiffMarks regions={d.regions} width={size.width} height={size.height} coverHeight={cover} />;
}
