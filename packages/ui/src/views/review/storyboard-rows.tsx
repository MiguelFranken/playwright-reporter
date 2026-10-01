'use client';

import { Check, ChevronRight, CircleAlert, ClipboardList, Film, Folder, History, MessageSquare, Route, EyeOff } from 'lucide-react';
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from '@tanstack/react-virtual';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { CommentCountBadge } from '../../patterns/comment-count-badge';
import { LibraryStateChip } from '../../patterns/library-state-chip';
import { ReviewStatusBadge, ReviewStatusDot } from '../../patterns/review-status-badge';
import { StatusIcon } from '../../patterns/status-badge';
import { Link } from '../../provider';
import { cn } from '../../lib/cn';
import { flowFeedback, flowPriority, flowState, feedbackCounts, type LibrarySection } from '../../lib/library-views';
import { captureViewport, checkpointLabel, compareVariants, NEEDS_REVIEW, worstStatus, type ReviewCaptureView, type ReviewCheckpointView, type ReviewFlowView } from '../../lib/review';
import { PriorityIcon } from '../test-cases/case-badges';
import { DiffBadge, DiffMarks } from './diff-summary';
import { SCREEN_ZOOM_VAR, ScreenFrame } from './screen-frame';

/** From this scale the frames scroll, so a flow can be read without opening it. */
const SCROLL_FROM = 0.28;

/** A section of rows: a heading (a folder path, a state, a priority) and its flows. */
export type RowSection = Pick<LibrarySection, 'id' | 'path' | 'flows' | 'state' | 'priority'>;

export const needsReviewIds = (list: readonly ReviewFlowView[]) =>
  list.flatMap((f) => f.checkpoints.flatMap((c) => c.captures.filter((cap) => NEEDS_REVIEW.includes(cap.status)).map((cap) => cap.id)));

/** What approving these flows covers: their screens that need review, and how many flows those are in. */
export const folderApproval = (list: readonly ReviewFlowView[]) => {
  const perFlow = list.map((f) => needsReviewIds([f]));
  return { captureIds: perFlow.flat(), flows: perFlow.filter((ids) => ids.length > 0).length };
};

type RowItem = { kind: 'heading'; key: string; section: RowSection; first: boolean } | { kind: 'flow'; key: string; flow: ReviewFlowView; first: boolean };

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

export interface StoryboardRowsProps {
  sections: readonly RowSection[];
  headings: boolean;
  size: number;
  canDecide: boolean;
  library: boolean;
  pending: ReadonlySet<string>;
  onOpen: (checkpointId: string, variant: string | null) => void;
  onApproveFlow: (ids: string[]) => void;
  variantSelected: string | null;
  reveal: { checkpointId: string } | null;
  /** Per flow, the checkpoints that match the view's state filter; the others step back. */
  matching?: (flow: ReviewFlowView) => ReadonlySet<string> | null;
}

/**
 * The rows, virtualised against the window: only the rows on screen and a
 * few either side are in the document, so a run with hundreds of tests
 * renders, scrolls and resizes as quickly as one with ten. Each row is
 * measured as it renders (and again when the size slider resizes it), the
 * heading of the section being scrolled through stays pinned below the app's
 * sticky header (`--sticky-offset`). A pinned heading's space above it tucks
 * under that header, so nothing scrolls through the gap between the two.
 */
export function StoryboardRows({ sections, headings, size, canDecide, library, pending, onOpen, onApproveFlow, variantSelected, reveal, matching }: StoryboardRowsProps) {
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
        const tucked = sticky && !item.first;
        return (
          <div
            key={v.key}
            ref={virtualizer.measureElement}
            data-index={v.index}
            className={cn(
              'left-0 w-full',
              sticky ? 'sticky z-10' : 'absolute top-0',
              sticky && (tucked ? 'top-[calc(var(--sticky-offset,0px)-1.5rem)]' : 'top-[var(--sticky-offset,0px)]'),
            )}
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
                matching={matching?.(item.flow) ?? null}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionHeading({ section, first }: { section: RowSection; first: boolean }) {
  return (
    <div className={first ? undefined : 'pt-6'}>
      <h2 className="-mx-1 mb-1 flex items-center gap-1.5 border-b border-separator bg-surface px-1 py-2 text-label-m text-muted-foreground">
        {section.state ? (
          <LibraryStateChip state={section.state} iconOnly />
        ) : section.priority ? (
          <PriorityIcon priority={section.priority} />
        ) : (
          <Folder className="size-4 shrink-0" />
        )}
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
  matching,
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
  matching: ReadonlySet<string> | null;
}) {
  const needsReview = useMemo(() => needsReviewIds([flow]), [flow]);
  const failed = flow.outcome === 'failed' || flow.outcome === 'timedout' || flow.outcome === 'interrupted';
  const heading = flow.titlePath.length ? flow.titlePath.join(' › ') : flow.title;
  const state = library ? flowState(flow) : null;
  const feedback = library ? flowFeedback(flow) : null;
  const priority = library ? flowPriority(flow) : 'none';
  return (
    <article className={cn('py-5', !first && 'border-t border-separator')} aria-label={heading}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          {library ? <Route aria-hidden className="size-4 text-muted-foreground" /> : <StatusIcon status={flow.outcome} />}
          <h3 className="flex min-w-0 items-center gap-2 text-title-s" title={heading}>
            {priority !== 'none' ? <PriorityIcon priority={priority} className="shrink-0" /> : null}
            <Link href={flow.resultHref} className="truncate hover:underline">
              {heading}
            </Link>
          </h3>
          <p className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {state === 'waiting' || state === 'verify' ? <LibraryStateChip state={state} /> : null}
            {feedback?.open ? (
              <span className="inline-flex items-center gap-1 text-label-xs" title={`${feedback.open} open ${feedback.open === 1 ? 'comment' : 'comments'}${feedback.outdated ? `, ${feedback.outdated} on an earlier version` : ''}`}>
                <MessageSquare aria-hidden className="size-3.5" />
                {feedback.open} open
                {feedback.outdated ? <span className="text-info-text">· {feedback.outdated} to verify</span> : null}
              </span>
            ) : null}
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
          <CheckpointColumn
            key={cp.id}
            checkpoint={cp}
            size={size}
            onOpen={onOpen}
            variantSelected={variantSelected}
            library={library}
            dimmed={Boolean(matching && !matching.has(cp.id))}
            flowRun={flow.runNumber ?? null}
          />
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

/** The gap between the variants of one checkpoint, in px; the checkpoints themselves sit twice as far apart. */
const VARIANT_GAP = 12;

function CheckpointColumn({
  checkpoint,
  size,
  onOpen,
  variantSelected,
  library,
  dimmed,
  flowRun,
}: {
  checkpoint: ReviewCheckpointView;
  size: number;
  onOpen: (checkpointId: string, variant: string | null) => void;
  variantSelected: string | null;
  library: boolean;
  /** Outside the view's state filter: shown for the journey, quieter. */
  dimmed: boolean;
  /** The flow's own run: a screen from another one says so. */
  flowRun: number | null;
}) {
  const captures = [...checkpoint.captures].sort((a, b) => compareVariants(a.variant, b.variant));
  const status = worstStatus(captures.map((c) => c.status));
  const label = checkpointLabel(checkpoint.name, checkpoint.title);
  const scroll = size >= SCROLL_FROM;
  const realWidth = captures.reduce((sum, c) => sum + captureViewport(c).width, 0);
  const open = (variant: string | null) => onOpen(checkpoint.id, variantSelected ?? variant);
  const earlier = library ? (checkpoint.origin?.runNumber ?? null) : null;
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
        {captures.map((c) => {
          const f = feedbackCounts([c]);
          const updated = library && c.previous && !c.previous.same;
          // A screen a later run did not capture: from the run it comes from.
          const from = library ? (c.runNumber ? (flowRun && c.runNumber !== flowRun ? c.runNumber : null) : earlier) : null;
          return (
            <div key={c.id} className="flex flex-col gap-1.5">
              {/* A click opens the viewer; the bar at the screen's edge scrolls it. The label above is the keyboard way in. */}
              <div onClick={() => open(c.variant)} className="relative cursor-zoom-in">
                <CommentCountBadge count={f.open} outdated={f.outdated} />
                <ScreenFrame
                  image={c.image}
                  frame={captureViewport(c)}
                  zoom={size}
                  live
                  alt={`${label} — ${c.variant}`}
                  scroll={scroll}
                  // Many screens on one page: the wheel scrolls the page, the bar at a screen's edge scrolls the screen.
                  wheel="page"
                  label={`${label}, ${c.variant} screen`}
                  // Outside the view's filter: the screen steps back, its labels stay readable.
                  className={cn('transition-opacity', dimmed && 'opacity-40 hover:opacity-100')}
                  tone={library ? (f.current ? 'danger' : f.outdated ? 'info' : undefined) : c.status === 'changed' ? 'warning' : c.status === 'new' ? 'info' : c.status === 'changes_requested' ? 'danger' : undefined}
                  overlay={library && !c.compare ? undefined : () => <ChangeMarks capture={c} />}
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
                {c.ignore?.active || c.ignore?.suspended ? (
                  <span
                    className={cn('inline-flex items-center gap-1', c.ignore.suspended ? 'text-warning-text' : 'text-muted-foreground')}
                    title={c.ignore.suspended ? `${c.ignore.suspended} ${c.ignore.suspended === 1 ? 'area' : 'areas'} left out, not applied here (another image size)` : `${c.ignore.active} ${c.ignore.active === 1 ? 'area' : 'areas'} left out of the comparison${c.ignore.suppressedPixels ? `, ${c.ignore.suppressedPixels.toLocaleString('en')} changed px left out` : ''}`}
                  >
                    <EyeOff aria-hidden className="size-3" />
                    <span className="tabular-nums">{c.ignore.active}</span>
                    <span className="sr-only">{c.ignore.active === 1 ? 'area' : 'areas'} left out</span>
                  </span>
                ) : null}
                {updated ? (
                  <span className="inline-flex items-center gap-1 text-warning-text" title={`Changed since run #${c.previous!.runNumber}`}>
                    <span aria-hidden className="size-1.5 rounded-full bg-warning-solid" />
                    Updated
                  </span>
                ) : null}
                {from ? (
                  <span className="inline-flex items-center gap-1" title={`Not captured by run #${flowRun}: this screen is from run #${from}`}>
                    <History aria-hidden className="size-3" />#{from}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </li>
  );
}

/** Where a screen changed, boxed on the storyboard's small screen. */
function ChangeMarks({ capture }: { capture: ReviewCaptureView }) {
  const d = capture.diff;
  if (!d || d.state !== 'done' || !d.regions.length || (capture.status === 'approved' && !capture.compare)) return null;
  const size = d.head ?? (capture.image.width && capture.image.height ? { width: capture.image.width, height: capture.image.height } : null);
  if (!size) return null;
  return <DiffMarks regions={d.regions} width={size.width} height={size.height} coverHeight={size.height} />;
}
