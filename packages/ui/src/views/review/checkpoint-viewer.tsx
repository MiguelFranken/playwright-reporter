'use client';

import { Check, ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff, Film, History, Keyboard, MessageSquareWarning, Route, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../components/dialog';
import { Kbd } from '../../components/kbd';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { ReviewStatusBadge, ReviewStatusDot } from '../../patterns/review-status-badge';
import { StatusIcon } from '../../patterns/status-badge';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import {
  captureViewport,
  checkpointLabel,
  compareVariants,
  DEFAULT_FRAME,
  fitZoom,
  frameFor,
  type FrameSettings,
  NEEDS_REVIEW,
  type ReviewCaptureView,
  type ReviewCheckpointView,
  type ReviewDecisionInput,
  type ReviewFlowView,
  type ReviewImage,
  type StoryboardMode,
} from '../../lib/review';
import { openThreadCount, sortThreads, type ThreadActions, type ThreadFilter } from '../../lib/review-threads';
import { DiffHighlight, diffImageSize } from './diff-highlight';
import { DiffSummary } from './diff-summary';
import { COMPARE_MODE_LABELS, COMPARE_MODES, ImageCompare, type CompareMode } from './image-compare';
import { IgnoreRegionsEditor, type IgnoreRect } from './ignore-regions-editor';
import { FrameToolbar } from './frame-toolbar';
import { PinLayer, type PinFocusRequest, type ThreadDraft } from './pin-layer';
import { ScreenFrame } from './screen-frame';
import { ThreadCompare } from './thread-compare';
import { ThreadList } from './thread-list';
import { LibraryStateChip } from '../../patterns/library-state-chip';
import { captureStates, type LibraryState } from '../../lib/library-views';

/** What the viewer shows: a checkpoint, and one of its variants or (`null`) all of them side by side. */
export interface ReviewSelection {
  checkpointId: string;
  variant: string | null;
}

/** Comment threads in the viewer: who may do what, and what the host records. */
export interface ReviewCommentsProps extends ThreadActions {
  canComment?: boolean;
  /** May delete anybody's comment. */
  canModerate?: boolean;
  /** The signed-in user, whose own comments can be edited and deleted. */
  viewerId?: string | null;
  /** The reference instant for relative times (stories pin it). */
  now?: Date;
  /** The thread to open when the viewer shows the checkpoint, by number: a link (`thread=3`). */
  openThread?: number | null;
  /** A thread was opened by a click, or closed: the host may put its number in the URL. */
  onOpenThreadChange?: (number: number | null) => void;
}

/** `changes`: this run's image with the measured changes marked; `ignore`: drawing the areas left out. */
type StageMode = 'image' | 'changes' | 'ignore' | CompareMode;

interface Position {
  flow: ReviewFlowView;
  checkpoint: ReviewCheckpointView;
  flowIndex: number;
  index: number;
}

/** Every checkpoint of the flows, in storyboard order. */
function positions(flows: readonly ReviewFlowView[]): Position[] {
  const out: Position[] = [];
  flows.forEach((flow, flowIndex) => flow.checkpoints.forEach((checkpoint, index) => out.push({ flow, checkpoint, flowIndex, index })));
  return out;
}

function sortedCaptures(cp: ReviewCheckpointView) {
  return [...cp.captures].sort((a, b) => compareVariants(a.variant, b.variant));
}

/** `4.2 s`, `1:03.5`: where the moment is in the attempt's video. */
function seconds(ms: number) {
  const s = Math.max(0, ms / 1000);
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/**
 * The reference a capture is compared with: another line of work's capture
 * when the library compares two, else (in review) the approved baseline, else
 * the run before.
 */
function referenceOf(capture: ReviewCaptureView, library: boolean): { image: ReviewImage; label: string; same: boolean } | null {
  if (capture.compare) return { image: capture.compare.image, label: capture.compare.label, same: capture.compare.same };
  // The library compares an updated screen with the capture before it on the branch.
  if (library) return capture.previous && !capture.previous.same ? { image: capture.previous.image, label: `Before (#${capture.previous.runNumber})`, same: false } : null;
  if (capture.baseline) return { image: capture.baseline.image, label: `Approved${capture.baseline.runNumber ? ` (#${capture.baseline.runNumber})` : ''}`, same: capture.baseline.same };
  if (capture.previous) return { image: capture.previous.image, label: `Run #${capture.previous.runNumber}`, same: capture.previous.same };
  return null;
}

/** How many checkpoints either side of the open one have their images fetched ahead. */
const PRELOAD_AROUND = 2;

/**
 * The images of the checkpoints next to the open one, and what they compare
 * against, fetched while the reviewer looks at this one: the arrow keys and
 * the step after an approval show the next screen at once.
 */
function usePreloadNeighbours(all: readonly Position[], at: number, library: boolean) {
  const urls = useMemo(() => {
    if (at < 0) return [];
    const out = new Set<string>();
    for (let i = Math.max(0, at - PRELOAD_AROUND); i <= Math.min(all.length - 1, at + PRELOAD_AROUND); i++) {
      if (i === at) continue;
      for (const c of all[i].checkpoint.captures) {
        if (c.image.available) out.add(c.image.url);
        const reference = referenceOf(c, library);
        if (reference?.image.available && !reference.same) out.add(reference.image.url);
      }
    }
    return [...out];
  }, [all, at, library]);
  useEffect(() => {
    // The browser keeps what these fetch in its cache; the timer lets the open screen's own images go first.
    const timer = setTimeout(() => {
      for (const url of urls) {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [urls]);
}

/**
 * The full-screen review of one checkpoint at a time: its image at full
 * resolution (or every variant side by side), a comparison with the approved
 * baseline, what was captured where and when, and the decision.
 *
 * Built for going through a run with the keyboard: ← → move between
 * checkpoints, ↑ ↓ between flows, V switches the variant, M the comparison,
 * N and P step through the measured changes, A approves and moves on to the
 * next image that needs review, C pins comments on the screenshot. Controlled: the host owns the selection (it may live in the URL)
 * and records decisions.
 */
export function CheckpointViewer({
  flows,
  selection,
  onSelectionChange,
  onDecide,
  pendingIds = [],
  canDecide = true,
  frame: frameProp,
  onFrameChange,
  mode = 'review',
  onIgnoreRegionsChange,
  ignorePendingId,
  comments = {},
}: {
  flows: readonly ReviewFlowView[];
  selection: ReviewSelection | null;
  onSelectionChange: (next: ReviewSelection | null) => void;
  onDecide?: (input: ReviewDecisionInput) => void;
  /** Captures whose decision is being saved. */
  pendingIds?: readonly string[];
  canDecide?: boolean;
  /** The screen captures are shown on; uncontrolled when absent. */
  frame?: FrameSettings;
  onFrameChange?: (next: FrameSettings) => void;
  /** `library`: documentation — the screens, what they show and where, without statuses, comparisons or decisions. */
  mode?: StoryboardMode;
  /** Saves the areas a capture's checkpoint and variant leave out of comparisons; without it they cannot be edited. */
  onIgnoreRegionsChange?: (input: { captureId: string; regions: IgnoreRect[] }) => void;
  /** The capture whose ignored areas are being saved. */
  ignorePendingId?: string | null;
  comments?: ReviewCommentsProps;
}) {
  const library = mode === 'library';
  const all = useMemo(() => positions(flows), [flows]);
  const at = selection ? all.findIndex((p) => p.checkpoint.id === selection.checkpointId || p.checkpoint.aliases?.includes(selection.checkpointId)) : -1;
  const pos = at >= 0 ? all[at] : null;
  usePreloadNeighbours(all, at, library);
  const [stage, setStage] = useState<StageMode>('changes');
  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState<ThreadDraft | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('open');
  const [composing, setComposing] = useState(false);
  const [pinsHidden, setPinsHidden] = useState(false);
  const [focus, setFocus] = useState<PinFocusRequest | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  // An outdated thread shown beside the version it was made on.
  const [comparingThreadId, setComparingThreadId] = useState<string | null>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // The dialog mounts its content in a portal after opening; state follows the element itself.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);

  const captures = pos ? sortedCaptures(pos.checkpoint) : [];
  const variant = selection?.variant ?? null;
  const shown = variant ? captures.filter((c) => c.variant === variant) : captures;
  const current = shown.length === 1 ? shown[0] : null;
  const reference = current ? referenceOf(current, library) : null;
  // In the library a screen is compared with the capture before it, which nobody measured; its diff (against an approved baseline) is not that.
  const diff = current && reference && (!library || current.compare) ? (current.diff ?? null) : null;
  const measuredSize = current && diff ? diffImageSize(current.image, diff) : null;
  const hasChanges = Boolean(current?.image.available && diff?.state === 'done' && (diff.changedPixels > 0 || diff.sizeChanged) && measuredSize);
  const regions = hasChanges ? diff!.regions : [];
  const ownSize = current?.image.width && current.image.height ? { width: current.image.width, height: current.image.height } : null;
  const canIgnore = Boolean(onIgnoreRegionsChange && canDecide && !library && current?.image.available && (measuredSize ?? ownSize));
  const effectiveStage: StageMode = !current
    ? 'image'
    : stage === 'ignore'
      ? canIgnore
        ? 'ignore'
        : 'image'
      : stage === 'changes'
        ? hasChanges
          ? 'changes'
          : 'image'
        : reference && stage !== 'image'
          ? stage
          : 'image';
  const [ownFrame, setOwnFrame] = useState<FrameSettings>(DEFAULT_FRAME);
  const frameSettings = frameProp ?? ownFrame;
  const setFrame = (next: FrameSettings) => {
    setOwnFrame(next);
    onFrameChange?.(next);
  };
  const stageSize = useElementSize(stageEl);
  // Narrower than the side panel needs, the viewer scrolls as one page: the stage grows with its screens, so fitting them
  // follows the window's height rather than the stage's own.
  const stackedHeight = useStackedHeight();
  const comparing = Boolean(current && effectiveStage !== 'image');
  const canComment = Boolean(comments.canComment && comments.onCreateThread);
  const threadGroups = shown.map((c) => ({ captureId: c.id, variant: c.variant, threads: c.threads ?? [] }));
  const shownThreads = threadGroups.flatMap((g) => g.threads);
  const comparedThread = comparingThreadId ? (shownThreads.find((t) => t.id === comparingThreadId && t.origin) ?? null) : null;
  const comparedCapture = comparedThread ? (shown.find((c) => c.threads?.some((t) => t.id === comparedThread.id)) ?? null) : null;
  const threadComparing = Boolean(comparedThread && comparedCapture);
  const frames = (threadComparing ? [comparedCapture!] : comparing && current ? [current] : shown).map((c) => frameFor(frameSettings, c));
  const zoomFrames = threadComparing || (comparing && effectiveStage === 'side-by-side') ? [frames[0], frames[0]] : frames;
  // Room for the captions above the screens and the stage's padding.
  // Room for the captions above the screens (and, comparing a thread, its banner and comment) and the stage's padding.
  const fitHeight = stackedHeight == null ? stageSize.height - 48 : Math.max(240, stackedHeight * 0.75);
  const zoom = frameSettings.zoom === 'fit' ? fitZoom(zoomFrames, { width: stageSize.width - 48, height: fitHeight - (threadComparing ? 190 : 28) }) : frameSettings.zoom;
  const pending = new Set(pendingIds);
  const busy = shown.some((c) => pending.has(c.id));

  const openCount = openThreadCount(shownThreads);
  // Pins sit on images drawn at the capture's own geometry: the plain image, its changes, and this run's side of a side-by-side.
  const pinsOn = threadComparing || effectiveStage === 'image' || effectiveStage === 'changes' || effectiveStage === 'side-by-side';
  const listed = sortThreads(shownThreads.filter((t) => threadFilter === 'all' || t.status === threadFilter || t.id === openThreadId));

  // A new checkpoint starts at its first change, without a half-placed pin or an open thread; comment mode stays on.
  const selectionKey = `${selection?.checkpointId}\u0000${selection?.variant}`;
  useEffect(() => {
    setActiveRegion(null);
    setDraft(null);
    setComposing(false);
    setConfirmApprove(false);
    setOpenThreadId(null);
    setComparingThreadId(null);
  }, [selectionKey]);

  // A link to a thread (`thread=3`) opens it and brings its pin into view, once its checkpoint is shown.
  const linked = comments.openThread != null ? (shownThreads.find((t) => t.number === comments.openThread) ?? null) : null;
  useEffect(() => {
    if (!linked) return;
    setOpenThreadId(linked.id);
    if (linked.status === 'resolved') setThreadFilter((f) => (f === 'open' ? 'all' : f));
    setFocus((f) => ({ threadId: linked.id, nonce: (f?.nonce ?? 0) + 1, ping: true }));
    // Only when the link or the checkpoint changes, not on every revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked?.id, selectionKey]);

  const openThread = (id: string | null, opts: { focus?: boolean } = {}) => {
    setOpenThreadId(id);
    if (id) setDraft(null);
    if (opts.focus && id) setFocus((f) => ({ threadId: id, nonce: (f?.nonce ?? 0) + 1, ping: true }));
    comments.onOpenThreadChange?.(id ? (shownThreads.find((t) => t.id === id)?.number ?? null) : null);
  };
  /** Shows an outdated thread beside the version it was made on, or (the same one again) closes that. */
  const compareThread = (id: string | null) => {
    setComparingThreadId(id);
    if (id) {
      setPinsHidden(false);
      openThread(id);
    }
  };
  const stepThread = (delta: number) => {
    if (!listed.length) return;
    const i = listed.findIndex((t) => t.id === openThreadId);
    const next = listed[(i + delta + listed.length) % listed.length] ?? listed[0];
    if (next.anchor.kind !== 'image' && !pinsOn) setStage('image');
    openThread(next.id, { focus: true });
  };
  const toggleCommenting = (next = !commenting) => {
    setCommenting(next);
    if (!next) setDraft(null);
    else {
      // Pins go on the image as it was captured: the changes view, the plain image, or this run's side.
      if (!pinsOn) setStage('image');
      setPinsHidden(false);
    }
  };
  const moveRegion = (delta: number) => {
    if (regions.length === 0) return;
    if (effectiveStage !== 'changes') setStage('changes');
    setActiveRegion((i) => (i == null ? (delta > 0 ? 0 : regions.length - 1) : (i + delta + regions.length) % regions.length));
  };

  const select = (p: Position | undefined, keepVariant = true) => {
    if (!p) return;
    const variants = p.checkpoint.captures.map((c) => c.variant);
    onSelectionChange({ checkpointId: p.checkpoint.id, variant: keepVariant && variant && variants.includes(variant) ? variant : variant ? (sortedCaptures(p.checkpoint)[0]?.variant ?? null) : null });
  };
  const move = (delta: number) => select(all[at + delta]);
  const moveFlow = (delta: number) => {
    if (!pos) return;
    const target = all.find((p) => p.flowIndex === pos.flowIndex + delta);
    select(target);
  };
  const cycleVariant = () => {
    if (!pos) return;
    const names = [...captures.map((c) => c.variant), null];
    const next = names[(names.indexOf(variant) + 1) % names.length];
    onSelectionChange({ checkpointId: pos.checkpoint.id, variant: next });
  };
  const cycleStage = () => {
    if (!reference) return;
    const modes: StageMode[] = ['image', ...(hasChanges ? (['changes'] as const) : []), ...COMPARE_MODES];
    setStage(modes[(modes.indexOf(effectiveStage) + 1) % modes.length]);
  };

  /** After a decision: the next image in order that still needs review. */
  const advance = (decided: readonly string[]) => {
    const done = new Set(decided);
    for (let i = at; i < all.length; i++) {
      const caps = sortedCaptures(all[i].checkpoint).filter((c) => !done.has(c.id) && NEEDS_REVIEW.includes(c.status));
      const candidate = variant ? caps.find((c) => c.variant === variant) : caps[0];
      if (i === at && !variant) continue;
      if (candidate) {
        onSelectionChange({ checkpointId: all[i].checkpoint.id, variant: variant ? candidate.variant : null });
        return;
      }
    }
  };

  const decide = (decision: ReviewDecisionInput['decision'], ids: string[], resolveThreads?: boolean) => {
    if (!onDecide || ids.length === 0) return;
    setConfirmApprove(false);
    onDecide({ captureIds: ids, decision, ...(decision === 'approved' && resolveThreads ? { resolveThreads: true } : {}) });
    if (decision === 'approved') advance(ids);
    // Asking for changes with nothing pinned yet: point at what should change.
    else if (canComment && openCount === 0) toggleCommenting(true);
  };
  /** Approve, or first ask what happens to the open threads. */
  const approve = () => {
    if (openCount > 0 && canComment) {
      setConfirmApprove(true);
      requestAnimationFrame(() => approveRef.current?.focus());
    } else decide('approved', shown.map((c) => c.id));
  };

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Arrow keys inside a toggle group move between its options, and in the pin layer move its crosshair.
      if (e.key.startsWith('Arrow') && target?.closest('[data-slot="toggle-group"], [data-slot="pin-layer"]')) return;
      // A popover or menu open over the viewer handles its own keys.
      if (target?.closest('[data-slot="popover-content"], [role="menu"]')) return;
      const key = e.key.toLowerCase();
      if (e.key === 'Escape' && commenting) {
        // Out of comment mode first; a second Escape closes the viewer.
        e.stopPropagation();
        toggleCommenting(false);
      } else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowDown') moveFlow(1);
      else if (e.key === 'ArrowUp') moveFlow(-1);
      else if (key === 'v') cycleVariant();
      else if (key === 'm') cycleStage();
      else if (key === 'n' && regions.length) moveRegion(1);
      else if (key === 'p' && regions.length) moveRegion(-1);
      else if (key === 'c' && canComment) toggleCommenting();
      else if (e.key === ']') stepThread(1);
      else if (e.key === '[') stepThread(-1);
      else if (key === 'h' && shownThreads.length) setPinsHidden((h) => !h);
      else if (key === 'o' && (comparedThread || shownThreads.find((t) => t.id === openThreadId)?.origin)) compareThread(comparedThread ? null : openThreadId);
      else if (key === 'e' && canComment && openThreadId && comments.onSetThreadStatus) {
        const t = shownThreads.find((x) => x.id === openThreadId);
        if (t) comments.onSetThreadStatus({ threadId: t.id, status: t.status === 'open' ? 'resolved' : 'open', captureId: threadGroups.find((g) => g.threads.includes(t))?.captureId });
      } else if (key === 'r' && canComment && current) setComposing(true);
      else if (library) return;
      else if (key === 'a' && canDecide && onDecide && !busy) approve();
      else return;
      e.preventDefault();
    };
    // Capture phase: the dialog's own handlers stop arrow keys before they bubble.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const label = pos ? checkpointLabel(pos.checkpoint.name, pos.checkpoint.title) : '';

  /** The pins of one capture on its frame. */
  const pinLayer = (capture: ReviewCaptureView, name: string) =>
    pinsOn && (canComment || capture.threads?.length) ? (
      <PinLayer
        captureId={capture.id}
        threads={capture.threads ?? []}
        label={name}
        commenting={commenting && canComment}
        showResolved={threadFilter !== 'open'}
        hidden={pinsHidden}
        openThreadId={openThreadId}
        onOpenThreadChange={(id, from) => {
          // A popover closing late must not shut the one that just opened.
          if (id === null && from && from !== openThreadId) return;
          openThread(id);
        }}
        draft={draft}
        onDraftChange={setDraft}
        focus={focus}
        now={comments.now}
        viewerId={comments.viewerId}
        canComment={canComment}
        canModerate={comments.canModerate}
        onCreateThread={comments.onCreateThread}
        onReply={comments.onReply}
        onSetThreadStatus={comments.onSetThreadStatus}
        onEditComment={comments.onEditComment}
        onDeleteComment={comments.onDeleteComment}
        onCompareThread={(id) => compareThread(id)}
      />
    ) : null;

  return (
    <Dialog open={Boolean(pos)} onOpenChange={(open) => !open && onSelectionChange(null)}>
      <DialogContent
        showCloseButton={false}
        initialFocus={stageRef}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 p-0 sm:max-w-none lg:grid lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:overflow-hidden"
      >
        {pos ? (
          <>
            <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-popover px-4 py-3 lg:static">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <StatusIcon status={pos.flow.outcome} />
                <div className="min-w-0">
                  <DialogTitle className="truncate text-title-s" title={label}>
                    {pos.checkpoint.sequence + 1}. {label}
                  </DialogTitle>
                  <DialogDescription className="truncate text-xs text-muted-foreground" title={pos.flow.titlePath.join(' › ')}>
                    {pos.flow.titlePath.join(' › ')} · {pos.index + 1} of {pos.flow.checkpoints.length} shown
                  </DialogDescription>
                </div>
              </div>
              <ToggleGroup
                variant="segment"
                size="sm"
                value={[variant ?? 'all']}
                onValueChange={(v) => {
                  const next = v[0];
                  if (next) onSelectionChange({ checkpointId: pos.checkpoint.id, variant: next === 'all' ? null : String(next) });
                }}
                aria-label="Variant"
              >
                {captures.map((c) => (
                  <ToggleGroupItem key={c.variant} value={c.variant} className="gap-1.5 capitalize">
                    {library ? null : <ReviewStatusDot status={c.status} />}
                    {c.variant}
                  </ToggleGroupItem>
                ))}
                {captures.length > 1 ? <ToggleGroupItem value="all">All</ToggleGroupItem> : null}
              </ToggleGroup>
              {current && reference ? (
                <ToggleGroup variant="segment" size="sm" value={[effectiveStage]} onValueChange={(v) => v[0] && setStage(v[0] as StageMode)} aria-label="Comparison">
                  <ToggleGroupItem value="image">Image</ToggleGroupItem>
                  {hasChanges ? <ToggleGroupItem value="changes">Changes</ToggleGroupItem> : null}
                  {COMPARE_MODES.map((m) => (
                    <ToggleGroupItem key={m} value={m}>
                      {COMPARE_MODE_LABELS[m]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              ) : null}
              <div className="ml-auto flex items-center gap-3">
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label="Previous checkpoint" disabled={at <= 0} onClick={() => move(-1)}>
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-9 text-center text-xs text-muted-foreground tabular-nums">
                    {at + 1} / {all.length}
                  </span>
                  <Button variant="ghost" size="icon-sm" aria-label="Next checkpoint" disabled={at >= all.length - 1} onClick={() => move(1)}>
                    <ChevronRight />
                  </Button>
                </div>
                <div className="h-5 w-px bg-border" aria-hidden />
                <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
                  <X />
                </DialogClose>
              </div>
            </header>

            <div className="grid shrink-0 grow grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <section className="flex min-h-0 flex-col bg-surface" aria-label="Checkpoint image">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2">
                  <FrameToolbar value={frameSettings} onChange={setFrame} captured={current ? captureViewport(current) : null} />
                  <div className="flex items-center gap-3">
                    {effectiveStage === 'changes' && regions.length ? (
                      <div className="flex items-center gap-0.5" role="group" aria-label="Changes">
                        <Button variant="ghost" size="icon-sm" aria-label="Previous change" onClick={() => moveRegion(-1)}>
                          <ChevronLeft />
                        </Button>
                        <span className="min-w-24 text-center text-label-s text-muted-foreground tabular-nums" aria-live="polite">
                          {activeRegion == null ? `${regions.length} ${regions.length === 1 ? 'change' : 'changes'}` : `Change ${activeRegion + 1} of ${regions.length}`}
                        </span>
                        <Button variant="ghost" size="icon-sm" aria-label="Next change" onClick={() => moveRegion(1)}>
                          <ChevronRight />
                        </Button>
                      </div>
                    ) : null}
                    {canIgnore ? (
                      <Button variant={effectiveStage === 'ignore' ? 'secondary' : 'ghost'} size="sm" aria-pressed={effectiveStage === 'ignore'} onClick={() => setStage(effectiveStage === 'ignore' ? 'changes' : 'ignore')}>
                        <EyeOff /> Leave out areas
                      </Button>
                    ) : null}
                    {shownThreads.some((t) => t.anchor.kind !== 'image') && pinsOn ? (
                      <Button variant="ghost" size="xs" aria-pressed={pinsHidden} onClick={() => setPinsHidden((h) => !h)}>
                        {pinsHidden ? <EyeOff /> : <Eye />} {pinsHidden ? 'Pins hidden' : 'Pins'}
                      </Button>
                    ) : null}
                    <span className="text-label-s text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
                  </div>
                </div>
                <div
                  ref={(el) => {
                    stageRef.current = el;
                    setStageEl(el);
                  }}
                  tabIndex={0}
                  aria-label="Checkpoint screens"
                  className={cn(
                    'min-h-0 flex-1 overflow-auto p-6 outline-none transition-shadow duration-150 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/25',
                    commenting && 'shadow-[inset_0_0_0_2px_var(--accent-solid)]',
                  )}
                >
                  {comparedThread && comparedCapture ? (
                    <ThreadCompare
                      thread={comparedThread}
                      image={comparedCapture.image}
                      frame={frames[0]}
                      zoom={zoom}
                      label={label}
                      currentLabel={library ? `Now${comparedCapture.runNumber ? ` · run #${comparedCapture.runNumber}` : ''}` : 'This run'}
                      now={comments.now}
                      currentOverlay={pinLayer(comparedCapture, `${label}, now`)}
                      canResolve={canComment && Boolean(comments.onSetThreadStatus)}
                      onResolve={() => comments.onSetThreadStatus?.({ threadId: comparedThread.id, status: 'resolved', captureId: comparedCapture.id })}
                      onClose={() => compareThread(null)}
                    />
                  ) : current && effectiveStage === 'changes' && diff ? (
                    <div className="flex min-w-max justify-center">
                      <DiffHighlight image={current.image} diff={diff} frame={frames[0]} zoom={zoom} alt={label} active={activeRegion} onActiveChange={setActiveRegion}>
                        {pinLayer(current, label)}
                      </DiffHighlight>
                    </div>
                  ) : current && effectiveStage === 'ignore' && onIgnoreRegionsChange ? (
                    <IgnoreRegionsEditor
                      image={current.image}
                      imageSize={(measuredSize ?? ownSize)!}
                      frame={frames[0]}
                      zoom={zoom}
                      alt={label}
                      value={current.ignoreRegions ?? []}
                      pending={ignorePendingId === current.id}
                      onSave={(next) => {
                        onIgnoreRegionsChange({ captureId: current.id, regions: next });
                        setStage('changes');
                      }}
                      onCancel={() => setStage('changes')}
                    />
                  ) : current && reference && effectiveStage !== 'image' ? (
                    effectiveStage === 'side-by-side' ? (
                      <div className="flex min-w-max items-start justify-center gap-6">
                        {[
                          { key: 'reference', title: reference.label, image: reference.image },
                          { key: 'current', title: 'This run', image: current.image },
                        ].map((side) => (
                          <figure key={side.key} className="flex flex-col gap-1.5">
                            <figcaption className="text-label-s text-muted-foreground">{side.title}</figcaption>
                            <ScreenFrame
                              image={side.image}
                              frame={frames[0]}
                              zoom={zoom}
                              alt={`${label} — ${side.title}`}
                              overlay={side.key === 'current' && pinLayer(current, `${label}, this run`) ? () => pinLayer(current, `${label}, this run`) : undefined}
                            />
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <div role="region" aria-label={`${label}, comparison`} tabIndex={0} className="mx-auto overflow-x-hidden overflow-y-auto rounded-md ring-1 ring-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" style={{ width: frames[0].width * zoom, height: frames[0].height * zoom + 40 }}>
                        <ImageCompare current={current.image} reference={reference.image} mode={effectiveStage as CompareMode} referenceLabel={reference.label} currentLabel={library ? 'This one' : 'This run'} alt={label} />
                      </div>
                    )
                  ) : (
                    <div className="flex min-w-max items-start justify-center gap-6">
                      {shown.map((c, i) => (
                        <figure key={c.id} className="flex flex-col gap-1.5">
                          <figcaption className="flex items-center gap-2 text-label-s capitalize text-muted-foreground">
                            {c.variant}
                            <span className="normal-case tabular-nums">
                              {frames[i].width} × {frames[i].height}
                            </span>
                            {shown.length > 1 && !library ? <ReviewStatusBadge status={c.status} /> : null}
                          </figcaption>
                          <ScreenFrame
                            image={c.image}
                            frame={frames[i]}
                            zoom={zoom}
                            alt={`${label} — ${c.variant}`}
                            label={`${label}, ${c.variant} screen`}
                            overlay={pinLayer(c, `${label}, ${c.variant}`) ? () => pinLayer(c, `${label}, ${c.variant}`) : undefined}
                          />
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <aside className="flex min-h-0 flex-col gap-5 overflow-auto border-t border-border p-4 lg:border-t-0 lg:border-l" aria-label="Checkpoint details">
                <section className="flex flex-col gap-2">
                  {library ? null : (
                    <div className="flex flex-wrap gap-1.5">
                      {shown.map((c) => (
                        <ReviewStatusBadge key={c.id} status={c.status} label={shown.length > 1 ? `${c.variant}: ${statusWord(c)}` : undefined} />
                      ))}
                    </div>
                  )}
                  {library ? <LibraryStates captures={shown} /> : null}
                  {pos.checkpoint.origin ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <History className="size-3.5" /> Captured in run #{pos.checkpoint.origin.runNumber}: the newest run did not capture this screen.
                    </p>
                  ) : null}
                  {pos.checkpoint.description ? <p className="text-sm text-pretty">{pos.checkpoint.description}</p> : null}
                  {current?.decision && !library ? <DecisionNote capture={current} /> : null}
                  {current && reference && diff && !reference.same ? (
                    <DiffSummary diff={diff} referenceLabel={reference.label} />
                  ) : current && reference ? (
                    <p className="text-xs text-muted-foreground">{reference.same ? `Identical to ${reference.label.toLowerCase()}.` : `Differs from ${reference.label.toLowerCase()}.`}</p>
                  ) : current && !library ? (
                    <p className="text-xs text-muted-foreground">Nothing to compare with yet: this is the first capture of this checkpoint.</p>
                  ) : current?.previous?.same ? (
                    <p className="text-xs text-muted-foreground">Unchanged since run #{current.previous.runNumber}.</p>
                  ) : null}
                  {current?.ignoreRegions?.length && !library ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <EyeOff className="size-3.5" /> {current.ignoreRegions.length} {current.ignoreRegions.length === 1 ? 'area is' : 'areas are'} left out of the comparison.
                    </p>
                  ) : null}
                </section>

                {canDecide && onDecide && !library ? (
                  <section className="flex flex-col gap-2" aria-label="Decision">
                    {confirmApprove ? (
                      <div className="flex animate-rise-in flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-2.5" role="group" aria-label="Open comments">
                        <p className="text-label-s">
                          {openCount} open {openCount === 1 ? 'comment' : 'comments'} on {shown.length > 1 ? 'these images' : 'this image'}.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button ref={approveRef} size="sm" disabled={busy} onClick={() => decide('approved', shown.map((c) => c.id), true)}>
                            <Check /> Resolve and approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('approved', shown.map((c) => c.id))}>
                            Approve, keep open
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmApprove(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy} onClick={approve}>
                          <Check /> {busy ? 'Saving…' : shown.length > 1 ? `Approve ${shown.length} images` : 'Approve'}
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('changes_requested', shown.map((c) => c.id))}>
                          <MessageSquareWarning /> Request changes
                        </Button>
                      </div>
                    )}
                  </section>
                ) : null}

                {canComment || shownThreads.length ? (
                  <ThreadList
                    groups={threadGroups}
                    filter={threadFilter}
                    onFilterChange={setThreadFilter}
                    openThreadId={openThreadId}
                    onOpenThreadChange={(id) => {
                      const t = id ? shownThreads.find((x) => x.id === id) : null;
                      // A thread with a pin opens at its pin; one about the whole image opens in the list.
                      if (t && t.anchor.kind !== 'image') {
                        setPinsHidden(false);
                        if (!pinsOn) setStage('image');
                      }
                      openThread(id, { focus: Boolean(t && t.anchor.kind !== 'image') });
                    }}
                    onHighlight={(id) => (id ? setFocus((f) => ({ threadId: id, nonce: (f?.nonce ?? 0) + 1, ping: true, scroll: false })) : undefined)}
                    commenting={commenting}
                    onCommentingChange={canComment ? toggleCommenting : undefined}
                    composing={composing}
                    onComposingChange={setComposing}
                    now={comments.now}
                    viewerId={comments.viewerId}
                    canComment={canComment}
                    canModerate={comments.canModerate}
                    onCreateThread={comments.onCreateThread}
                    onReply={comments.onReply}
                    onSetThreadStatus={comments.onSetThreadStatus}
                    onEditComment={comments.onEditComment}
                    onDeleteComment={comments.onDeleteComment}
                    onCompareThread={(id) => compareThread(id)}
                  />
                ) : null}

                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                  {pos.checkpoint.stepPath.length ? (
                    <>
                      <dt className="text-muted-foreground">Step</dt>
                      <dd className="min-w-0 break-words">{pos.checkpoint.stepPath.join(' › ')}</dd>
                    </>
                  ) : null}
                  {pos.checkpoint.url ? (
                    <>
                      <dt className="text-muted-foreground">URL</dt>
                      <dd className="min-w-0 truncate text-code-s" title={pos.checkpoint.url}>
                        {pos.checkpoint.url}
                      </dd>
                    </>
                  ) : null}
                  {pos.checkpoint.pageTitle ? (
                    <>
                      <dt className="text-muted-foreground">Page title</dt>
                      <dd className="min-w-0 break-words">{pos.checkpoint.pageTitle}</dd>
                    </>
                  ) : null}
                  {pos.checkpoint.offsetMs != null ? (
                    <>
                      <dt className="text-muted-foreground">Captured</dt>
                      <dd className="tabular-nums">{seconds(pos.checkpoint.offsetMs)} into the test</dd>
                    </>
                  ) : null}
                  {current?.viewport ? (
                    <>
                      <dt className="text-muted-foreground">Viewport</dt>
                      <dd className="tabular-nums">
                        {current.viewport.width} × {current.viewport.height}
                        {current.deviceScaleFactor && current.deviceScaleFactor !== 1 ? ` @${current.deviceScaleFactor}×` : ''}
                        {current.isMobile ? ' · mobile' : ''}
                      </dd>
                    </>
                  ) : null}
                  {current?.image.width && current.image.height ? (
                    <>
                      <dt className="text-muted-foreground">Image</dt>
                      <dd className="tabular-nums">
                        {current.image.width} × {current.image.height} px{current.fullPage === false ? ' · viewport only' : current.fullPage ? ' · full page' : ''}
                      </dd>
                    </>
                  ) : null}
                  {pos.checkpoint.tags.length ? (
                    <>
                      <dt className="text-muted-foreground">Tags</dt>
                      <dd className="flex flex-wrap gap-1">
                        {pos.checkpoint.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-label-xs">
                            {t}
                          </Badge>
                        ))}
                      </dd>
                    </>
                  ) : null}
                </dl>

                <nav className="flex flex-col gap-1" aria-label="Evidence">
                  {(pos.checkpoint.origin ? pos.checkpoint.origin.videoUrl : pos.flow.videoUrl) ? (
                    <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={`${pos.checkpoint.origin ? pos.checkpoint.origin.videoUrl : pos.flow.videoUrl}${pos.checkpoint.offsetMs != null ? `#t=${(pos.checkpoint.offsetMs / 1000).toFixed(1)}` : ''}`} target="_blank" rel="noreferrer">
                      <Film className="size-4" /> Watch the video{pos.checkpoint.offsetMs != null ? ` at ${seconds(pos.checkpoint.offsetMs)}` : ''}
                    </a>
                  ) : null}
                  {pos.flow.traceUrl ? (
                    <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={pos.flow.traceUrl} target="_blank" rel="noreferrer">
                      <Route className="size-4" /> Open the trace
                    </a>
                  ) : null}
                  <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={pos.checkpoint.origin?.resultHref ?? pos.flow.resultHref}>
                    <ExternalLink className="size-4" /> Test result
                  </a>
                </nav>

                <details className="mt-auto text-xs text-muted-foreground">
                  <summary className="inline-flex cursor-pointer items-center gap-1.5">
                    <Keyboard className="size-3.5" /> Keyboard shortcuts
                  </summary>
                  <ul className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {SHORTCUTS.filter(([keys]) => (!library || !['A', 'N'].includes(keys[0])) && (canComment || !['C', 'R', 'E'].includes(keys[0]))).map(([keys, what]) => (
                      <li key={what} className="contents">
                        <span className="flex gap-1">
                          {keys.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </span>
                        <span>{what}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </aside>
            </div>

            <footer className="border-t border-border px-4 py-2">
              <ol className="flex gap-2 overflow-x-auto pb-1" aria-label={`Checkpoints of ${pos.flow.title}`}>
                {pos.flow.checkpoints.map((cp) => {
                  const first = sortedCaptures(cp).find((c) => !variant || c.variant === variant) ?? sortedCaptures(cp)[0];
                  const active = cp.id === pos.checkpoint.id;
                  return (
                    <li key={cp.id}>
                      <button
                        type="button"
                        onClick={() => onSelectionChange({ checkpointId: cp.id, variant })}
                        aria-current={active ? 'step' : undefined}
                        aria-label={`${cp.sequence + 1}. ${checkpointLabel(cp.name, cp.title)}`}
                        className={cn('flex items-center gap-2 rounded-md p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25', active ? 'bg-accent-subtle ring-1 ring-accent-border' : 'hover:bg-muted')}
                      >
                        <span className="text-label-s tabular-nums text-muted-foreground">{cp.sequence + 1}</span>
                        {first ? <ScreenFrame image={first.image} frame={captureViewport(first)} zoom={56 / captureViewport(first).height} alt="" scroll={false} /> : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </footer>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['←', '→'], 'Previous / next checkpoint'],
  [['↑', '↓'], 'Previous / next test'],
  [['V'], 'Next variant'],
  [['M'], 'Next comparison'],
  [['N', 'P'], 'Next / previous change'],
  [['A'], 'Approve and go to the next image to review'],
  [['C'], 'Comment mode: click to pin, drag for an area'],
  [['R'], 'Comment on the whole image'],
  [['[', ']'], 'Previous / next comment'],
  [['E'], 'Resolve or reopen the open comment'],
  [['H'], 'Hide or show the pins'],
  [['O'], 'Compare the open comment with the version it was made on'],
  [['Esc'], 'Leave comment mode, then close'],
];


function statusWord(c: ReviewCaptureView) {
  return { approved: 'approved', changes_requested: 'changes requested', changed: 'changed', new: 'new' }[c.status];
}

function DecisionNote({ capture }: { capture: ReviewCaptureView }) {
  const d = capture.decision!;
  return (
    <div className="rounded-md border border-border bg-surface-sunken p-2 text-xs">
      <p className="text-muted-foreground">
        {d.source === 'tolerance' ? 'Approved automatically' : d.decision === 'approved' ? 'Approved' : 'Changes requested'}
        {d.by ? ` by ${d.by}` : ''} · {formatDateTime(d.at)}
        {d.runNumber ? ` · run #${d.runNumber}` : ''}
      </p>
      {/* A change request's comment lives on as a thread below. */}
      {d.comment && d.decision === 'approved' ? <p className="mt-1 text-sm text-pretty whitespace-pre-wrap">{d.comment}</p> : null}
    </div>
  );
}

/** The content box of an element, followed as it resizes; zero until it mounts. */
function useElementSize(el: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return size;
}

/** The window's height while the viewer is stacked (below `lg`, where it scrolls as a page); null beside the side panel. */
function useStackedHeight() {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const mql = window.matchMedia('(min-width: 64rem)');
    const measure = () => setHeight(mql.matches ? null : window.innerHeight);
    measure();
    mql.addEventListener('change', measure);
    window.addEventListener('resize', measure);
    return () => {
      mql.removeEventListener('change', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);
  return height;
}

/** Where the screens on show stand in the review loop, in the library (which has no decisions to show). */
function LibraryStates({ captures }: { captures: readonly ReviewCaptureView[] }) {
  const states = new Set<LibraryState>(captures.flatMap((c) => [...captureStates(c)]));
  const shown = (['waiting', 'verify', 'updated'] as const).filter((s) => states.has(s));
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <LibraryStateChip key={s} state={s} />
      ))}
    </div>
  );
}
