'use client';

import { ArrowRight, Check, CircleAlert, Film, Images, Route, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { EmptyState } from '../../patterns/empty-state';
import { ReviewStatusBadge, ReviewStatusDot } from '../../patterns/review-status-badge';
import { StatusIcon } from '../../patterns/status-badge';
import { Link } from '../../provider';
import { cn } from '../../lib/cn';
import {
  checkpointLabel,
  compareVariants,
  countStatuses,
  matchesReviewFilter,
  NEEDS_REVIEW,
  REVIEW_FILTER_LABELS,
  REVIEW_FILTERS,
  REVIEW_STATUS_TONES,
  variantsOf,
  worstStatus,
  type ReviewCheckpointView,
  type ReviewDecisionInput,
  type ReviewFilter,
  type ReviewFlowView,
} from '../../lib/review';
import { toneSolid } from '../../lib/tone';
import { CheckpointViewer, type ReviewSelection } from './checkpoint-viewer';
import { ReviewFrame } from './review-frame';

export type { ReviewSelection };

/** Uncontrolled unless the host passes the value: stories drive it, the app binds it to the URL. */
function useControlled<T>(value: T | undefined, onChange: ((v: T) => void) | undefined, initial: T): [T, (v: T) => void] {
  const [own, setOwn] = useState(initial);
  return value === undefined ? [own, (v) => (setOwn(v), onChange?.(v))] : [value, (v) => onChange?.(v)];
}

/** The flows and checkpoints the filters leave, each checkpoint keeping only the matching variants. */
export function filterFlows(flows: readonly ReviewFlowView[], filter: ReviewFilter, variant: string | null, query: string): ReviewFlowView[] {
  const q = query.trim().toLowerCase();
  return flows
    .filter((f) => !q || [...f.titlePath, f.file, ...f.checkpoints.flatMap((c) => [c.name, c.title ?? ''])].some((s) => s.toLowerCase().includes(q)))
    .map((f) => ({
      ...f,
      checkpoints: f.checkpoints
        .map((c) => ({ ...c, captures: c.captures.filter((cap) => (!variant || cap.variant === variant) && matchesReviewFilter(cap.status, filter)) }))
        .filter((c) => c.captures.length > 0),
    }))
    .filter((f) => f.checkpoints.length > 0);
}

/**
 * A run's review checkpoints as a storyboard: one row per test — a journey
 * through the product — and its checkpoints left to right in the order they
 * were captured, desktop and mobile side by side. Nothing to read in a list
 * of file names: what changed is what lights up.
 *
 * The filter defaults to what needs review (changed and new images), so a run
 * whose pixels match their approvals opens empty and says so. The viewer
 * opens on a checkpoint for the full-size images, the comparison with the
 * baseline and the decision.
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
  onDecide,
  pendingIds = [],
  canDecide = true,
  toolbar = true,
  emptyTitle = 'No review checkpoints in this run',
  emptyDescription,
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
  onDecide?: (input: ReviewDecisionInput) => void;
  pendingIds?: readonly string[];
  canDecide?: boolean;
  /** Filters and bulk actions above the rows; off where one flow is embedded. */
  toolbar?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
}) {
  const hasNeedsReview = useMemo(() => flows.some((f) => f.checkpoints.some((c) => c.captures.some((cap) => NEEDS_REVIEW.includes(cap.status)))), [flows]);
  const [filter, setFilter] = useControlled<ReviewFilter>(filterProp, onFilterChange, toolbar && hasNeedsReview ? 'needs-review' : 'all');
  const [variant, setVariant] = useControlled<string | null>(variantProp, onVariantChange, null);
  const [query, setQuery] = useControlled<string>(queryProp, onQueryChange, '');
  const [selection, setSelectionState] = useControlled<ReviewSelection | null>(selectionProp, onSelectionChange, null);
  // While the viewer is open it keeps the checkpoints it opened with, so a
  // decision that moves one out of the filter does not pull it from under the reviewer.
  const [pinned, setPinned] = useState<ReadonlySet<string> | null>(null);

  const variants = useMemo(() => variantsOf(flows), [flows]);
  const effectiveFilter = toolbar ? filter : 'all';
  const visible = useMemo(() => filterFlows(flows, effectiveFilter, variant, toolbar ? query : ''), [flows, effectiveFilter, variant, query, toolbar]);
  const counts = useMemo(() => countStatuses(flows, variant), [flows, variant]);
  const total = counts.approved + counts.changes_requested + counts.changed + counts.new;
  const pending = new Set(pendingIds);
  const setSelection = (next: ReviewSelection | null) => {
    if (next && !pinned) setPinned(new Set(visible.flatMap((f) => f.checkpoints.map((c) => c.id))));
    if (!next) setPinned(null);
    setSelectionState(next);
  };
  const viewerFlows = useMemo(() => {
    if (!pinned) return visible;
    return filterFlows(flows, 'all', variant, '')
      .map((f) => ({ ...f, checkpoints: f.checkpoints.filter((c) => pinned.has(c.id)) }))
      .filter((f) => f.checkpoints.length > 0);
  }, [pinned, visible, flows, variant]);

  const needsReviewIds = (list: readonly ReviewFlowView[]) =>
    list.flatMap((f) => f.checkpoints.flatMap((c) => c.captures.filter((cap) => NEEDS_REVIEW.includes(cap.status)).map((cap) => cap.id)));
  const shownToApprove = needsReviewIds(visible);

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

  return (
    <div className="flex flex-col gap-4">
      {toolbar ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a test or checkpoint" aria-label="Find a test or checkpoint" className="h-8 w-56 pl-8" />
            </div>
            {canDecide && onDecide ? (
              <Button size="sm" disabled={shownToApprove.length === 0 || shownToApprove.some((id) => pending.has(id))} onClick={() => onDecide({ captureIds: shownToApprove, decision: 'approved' })}>
                <Check /> Approve {shownToApprove.length} shown
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={Check}
          title={filter === 'needs-review' && !query ? 'Nothing needs review' : 'No checkpoints match'}
          description={filter === 'needs-review' && !query ? 'Every image in this run matches an approved one or was decided about.' : 'Try another filter or search.'}
        >
          {filter !== 'all' ? (
            <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
              Show all {total} images
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Tests with review checkpoints">
          {visible.map((flow) => (
            <FlowRow
              key={flow.resultId}
              flow={flow}
              canDecide={canDecide && Boolean(onDecide)}
              pending={pending}
              onOpen={(checkpointId, v) => setSelection({ checkpointId, variant: v })}
              onApproveFlow={(ids) => onDecide?.({ captureIds: ids, decision: 'approved' })}
              needsReview={needsReviewIds([flow])}
              variantSelected={variant}
            />
          ))}
        </ol>
      )}

      <CheckpointViewer flows={viewerFlows} selection={selection} onSelectionChange={setSelection} onDecide={onDecide} pendingIds={pendingIds} canDecide={canDecide} />
    </div>
  );
}

function FlowRow({
  flow,
  canDecide,
  pending,
  onOpen,
  onApproveFlow,
  needsReview,
  variantSelected,
}: {
  flow: ReviewFlowView;
  canDecide: boolean;
  pending: ReadonlySet<string>;
  onOpen: (checkpointId: string, variant: string | null) => void;
  onApproveFlow: (ids: string[]) => void;
  needsReview: string[];
  variantSelected: string | null;
}) {
  const failed = flow.outcome === 'failed' || flow.outcome === 'timedout' || flow.outcome === 'interrupted';
  const heading = flow.titlePath.length ? flow.titlePath.join(' › ') : flow.title;
  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card shadow-e1">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon status={flow.outcome} />
          <div className="min-w-0">
            <h3 className="truncate text-title-s" title={heading}>
              <Link href={flow.resultHref} className="hover:underline">
                {heading}
              </Link>
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              <span className="text-code-s" title={flow.file}>
                {flow.file}
                {flow.line ? `:${flow.line}` : ''}
              </span>
              {flow.project ? (
                <Badge variant="secondary" className="ml-2 align-middle text-label-xs">
                  {flow.project}
                </Badge>
              ) : null}
              {flow.flow ? <span className="ml-2">Journey: {flow.flow}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {flow.videoUrl ? (
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={flow.videoUrl} target="_blank" rel="noreferrer" />}>
              <Film /> Video
            </Button>
          ) : null}
          {flow.traceUrl ? (
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
      <ol className="flex items-stretch gap-2 overflow-x-auto p-4" aria-label={`Checkpoints of ${flow.title}`}>
        {flow.checkpoints.map((cp, i) => (
          <li key={cp.id} className="flex items-center gap-2">
            {i > 0 ? <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
            <CheckpointCard checkpoint={cp} onOpen={onOpen} variantSelected={variantSelected} />
          </li>
        ))}
        {failed && flow.failureImage ? (
          <li className="flex items-center gap-2">
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <a href={flow.resultHref} className="flex flex-col gap-2 rounded-lg border border-danger-border bg-danger-subtle/40 p-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25">
              <ReviewFrame image={flow.failureImage} alt="Screenshot at the failure" height={140} />
              <span className="inline-flex items-center gap-1.5 text-label-s text-danger-text">
                <CircleAlert className="size-3.5" /> Failed here
              </span>
            </a>
          </li>
        ) : null}
      </ol>
    </li>
  );
}

function CheckpointCard({
  checkpoint,
  onOpen,
  variantSelected,
}: {
  checkpoint: ReviewCheckpointView;
  onOpen: (checkpointId: string, variant: string | null) => void;
  variantSelected: string | null;
}) {
  const captures = [...checkpoint.captures].sort((a, b) => compareVariants(a.variant, b.variant));
  const status = worstStatus(captures.map((c) => c.status));
  const label = checkpointLabel(checkpoint.name, checkpoint.title);
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-2">
      <button
        type="button"
        onClick={() => onOpen(checkpoint.id, variantSelected ?? (captures.length === 1 ? captures[0].variant : null))}
        className="flex items-end gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
        aria-label={`Open ${checkpoint.sequence + 1}. ${label}`}
      >
        {captures.map((c) => (
          <div key={c.id} className="flex flex-col items-start gap-1">
            <ReviewFrame image={c.image} viewport={c.viewport} alt={`${label} — ${c.variant}`} height={140} className={cn(NEEDS_REVIEW.includes(c.status) && 'ring-2 ring-offset-1 ring-offset-surface', c.status === 'changed' && 'ring-warning-border', c.status === 'new' && 'ring-info-border')} />
            <span className="flex items-center gap-1 text-label-xs capitalize text-muted-foreground">
              <ReviewStatusDot status={c.status} />
              {c.variant}
            </span>
          </div>
        ))}
      </button>
      <div className="flex max-w-80 min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 text-label-m">
          <span className="mr-1 tabular-nums text-muted-foreground">{checkpoint.sequence + 1}.</span>
          <span className="break-words">{label}</span>
        </p>
        <ReviewStatusBadge status={status} className="shrink-0" />
      </div>
    </div>
  );
}
