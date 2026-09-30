'use client';

import { ArrowDownWideNarrow, Check, Images, Search } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { EmptyState } from '../../patterns/empty-state';
import { cn } from '../../lib/cn';
import {
  buildReviewTree,
  changeScore,
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
import { toneSolid } from '../../lib/tone';
import { CheckpointViewer, type ReviewCommentsProps, type ReviewSelection } from './checkpoint-viewer';
import type { IgnoreRect } from './ignore-regions-editor';
import { approveFolderAction, ReviewTree } from './review-tree';
import { SCREEN_ZOOM_VAR } from './screen-frame';
import { SizeControl, STORYBOARD_SIZE } from './size-control';
import { needsReviewIds, StoryboardRows } from './storyboard-rows';

export type { ReviewSelection };

export { STORYBOARD_SIZE };

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
        sections={sections as readonly ReviewFolder[]}
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
          <aside className="lg:sticky lg:top-[calc(var(--sticky-offset,0px)+1rem)] lg:max-h-[calc(100dvh-var(--sticky-offset,0px)-2rem)] lg:self-start lg:overflow-y-auto">
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
              folderActions={
                canDecide && onDecide && !library
                  ? (target) => [approveFolderAction(target, needsReviewIds(searched.filter((f) => inFolder(f, grouping, target.id))), (ids) => onDecide({ captureIds: ids, decision: 'approved' }), pending)]
                  : undefined
              }
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
