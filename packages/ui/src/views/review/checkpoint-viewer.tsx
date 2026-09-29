'use client';

import { Check, ChevronLeft, ChevronRight, ExternalLink, Film, Keyboard, MessageSquareWarning, Route, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../components/dialog';
import { Kbd } from '../../components/kbd';
import { Textarea } from '../../components/textarea';
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
import { COMPARE_MODE_LABELS, COMPARE_MODES, ImageCompare, type CompareMode } from './image-compare';
import { FrameToolbar } from './frame-toolbar';
import { ScreenFrame } from './screen-frame';

/** What the viewer shows: a checkpoint, and one of its variants or (`null`) all of them side by side. */
export interface ReviewSelection {
  checkpointId: string;
  variant: string | null;
}

type StageMode = 'image' | CompareMode;

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

/** The reference a capture is compared with: the approved baseline, else the run before. */
function referenceOf(capture: ReviewCaptureView): { image: ReviewImage; label: string; same: boolean } | null {
  if (capture.baseline) return { image: capture.baseline.image, label: `Approved${capture.baseline.runNumber ? ` (#${capture.baseline.runNumber})` : ''}`, same: capture.baseline.same };
  if (capture.previous) return { image: capture.previous.image, label: `Run #${capture.previous.runNumber}`, same: capture.previous.same };
  return null;
}

/**
 * The full-screen review of one checkpoint at a time: its image at full
 * resolution (or every variant side by side), a comparison with the approved
 * baseline, what was captured where and when, and the decision.
 *
 * Built for going through a run with the keyboard: ← → move between
 * checkpoints, ↑ ↓ between flows, V switches the variant, C the comparison,
 * A approves and moves on to the next image that needs review, R asks for
 * changes. Controlled: the host owns the selection (it may live in the URL)
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
}) {
  const library = mode === 'library';
  const all = useMemo(() => positions(flows), [flows]);
  const at = selection ? all.findIndex((p) => p.checkpoint.id === selection.checkpointId) : -1;
  const pos = at >= 0 ? all[at] : null;
  const [stage, setStage] = useState<StageMode>('image');
  const [comment, setComment] = useState('');
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // The dialog mounts its content in a portal after opening; state follows the element itself.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);

  const captures = pos ? sortedCaptures(pos.checkpoint) : [];
  const variant = selection?.variant ?? null;
  const shown = variant ? captures.filter((c) => c.variant === variant) : captures;
  const current = shown.length === 1 ? shown[0] : null;
  const reference = current && !library ? referenceOf(current) : null;
  const effectiveStage: StageMode = current && reference ? stage : 'image';
  const [ownFrame, setOwnFrame] = useState<FrameSettings>(DEFAULT_FRAME);
  const frameSettings = frameProp ?? ownFrame;
  const setFrame = (next: FrameSettings) => {
    setOwnFrame(next);
    onFrameChange?.(next);
  };
  const stageSize = useElementSize(stageEl);
  const comparing = Boolean(current && reference && effectiveStage !== 'image');
  const frames = (comparing && current ? [current] : shown).map((c) => frameFor(frameSettings, c));
  const zoomFrames = comparing && effectiveStage === 'side-by-side' ? [frames[0], frames[0]] : frames;
  // Room for the captions above the screens and the stage's padding.
  const zoom = frameSettings.zoom === 'fit' ? fitZoom(zoomFrames, { width: stageSize.width - 48, height: stageSize.height - 48 - 28 }) : frameSettings.zoom;
  const pending = new Set(pendingIds);
  const busy = shown.some((c) => pending.has(c.id));

  // A new checkpoint starts without a half-written comment.
  useEffect(() => setComment(''), [selection?.checkpointId, selection?.variant]);

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
    const modes: StageMode[] = ['image', ...COMPARE_MODES];
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

  const decide = (decision: ReviewDecisionInput['decision'], ids: string[]) => {
    if (!onDecide || ids.length === 0) return;
    onDecide({ captureIds: ids, decision, comment: comment.trim() || undefined });
    setComment('');
    if (decision === 'approved') advance(ids);
  };

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Arrow keys inside a toggle group move between its options.
      if (e.key.startsWith('Arrow') && target?.closest('[data-slot="toggle-group"]')) return;
      const key = e.key.toLowerCase();
      if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowDown') moveFlow(1);
      else if (e.key === 'ArrowUp') moveFlow(-1);
      else if (key === 'v') cycleVariant();
      else if (key === 'c') cycleStage();
      else if (library) return;
      else if (key === 'a' && canDecide && !busy) decide('approved', shown.map((c) => c.id));
      else if (key === 'r' && canDecide) {
        commentRef.current?.focus();
      } else return;
      e.preventDefault();
    };
    // Capture phase: the dialog's own handlers stop arrow keys before they bubble.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const label = pos ? checkpointLabel(pos.checkpoint.name, pos.checkpoint.title) : '';

  return (
    <Dialog open={Boolean(pos)} onOpenChange={(open) => !open && onSelectionChange(null)}>
      <DialogContent
        showCloseButton={false}
        initialFocus={stageRef}
        className="top-0 left-0 grid h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-none border-0 p-0 sm:max-w-none"
      >
        {pos ? (
          <>
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
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

            <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <section className="flex min-h-0 flex-col bg-surface" aria-label="Checkpoint image">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2">
                  <FrameToolbar value={frameSettings} onChange={setFrame} captured={current ? captureViewport(current) : null} />
                  <span className="text-label-s text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
                </div>
                <div
                  ref={(el) => {
                    stageRef.current = el;
                    setStageEl(el);
                  }}
                  tabIndex={0}
                  aria-label="Checkpoint screens"
                  className="min-h-0 flex-1 overflow-auto p-6 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/25"
                >
                  {current && reference && effectiveStage !== 'image' ? (
                    effectiveStage === 'side-by-side' ? (
                      <div className="flex min-w-max items-start justify-center gap-6">
                        {[
                          { key: 'reference', title: reference.label, image: reference.image },
                          { key: 'current', title: 'This run', image: current.image },
                        ].map((side) => (
                          <figure key={side.key} className="flex flex-col gap-1.5">
                            <figcaption className="text-label-s text-muted-foreground">{side.title}</figcaption>
                            <ScreenFrame image={side.image} frame={frames[0]} zoom={zoom} alt={`${label} — ${side.title}`} />
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <div role="region" aria-label={`${label}, comparison`} tabIndex={0} className="mx-auto overflow-x-hidden overflow-y-auto rounded-md ring-1 ring-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" style={{ width: frames[0].width * zoom, height: frames[0].height * zoom + 40 }}>
                        <ImageCompare current={current.image} reference={reference.image} mode={effectiveStage as CompareMode} referenceLabel={reference.label} alt={label} />
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
                          <ScreenFrame image={c.image} frame={frames[i]} zoom={zoom} alt={`${label} — ${c.variant}`} label={`${label}, ${c.variant} screen`} />
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
                  {pos.checkpoint.description ? <p className="text-sm text-pretty">{pos.checkpoint.description}</p> : null}
                  {current?.decision && !library ? <DecisionNote capture={current} /> : null}
                  {library ? null : current && reference ? (
                    <p className="text-xs text-muted-foreground">{reference.same ? `Identical to ${reference.label.toLowerCase()}.` : `Differs from ${reference.label.toLowerCase()}.`}</p>
                  ) : current ? (
                    <p className="text-xs text-muted-foreground">Nothing to compare with yet: this is the first capture of this checkpoint.</p>
                  ) : null}
                </section>

                {canDecide && onDecide && !library ? (
                  <section className="flex flex-col gap-2" aria-label="Decision">
                    <label htmlFor="review-comment" className="text-label-s text-muted-foreground">
                      Comment <span className="font-normal">(optional)</span>
                    </label>
                    <Textarea
                      id="review-comment"
                      ref={commentRef}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="What should change?"
                      rows={2}
                      maxLength={4000}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy} onClick={() => decide('approved', shown.map((c) => c.id))}>
                        <Check /> {busy ? 'Saving…' : shown.length > 1 ? `Approve ${shown.length} images` : 'Approve'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('changes_requested', shown.map((c) => c.id))}>
                        <MessageSquareWarning /> Request changes
                      </Button>
                    </div>
                  </section>
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
                  {pos.flow.videoUrl ? (
                    <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={`${pos.flow.videoUrl}${pos.checkpoint.offsetMs != null ? `#t=${(pos.checkpoint.offsetMs / 1000).toFixed(1)}` : ''}`} target="_blank" rel="noreferrer">
                      <Film className="size-4" /> Watch the video{pos.checkpoint.offsetMs != null ? ` at ${seconds(pos.checkpoint.offsetMs)}` : ''}
                    </a>
                  ) : null}
                  {pos.flow.traceUrl ? (
                    <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={pos.flow.traceUrl} target="_blank" rel="noreferrer">
                      <Route className="size-4" /> Open the trace
                    </a>
                  ) : null}
                  <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={pos.flow.resultHref}>
                    <ExternalLink className="size-4" /> Test result
                  </a>
                </nav>

                <details className="mt-auto text-xs text-muted-foreground">
                  <summary className="inline-flex cursor-pointer items-center gap-1.5">
                    <Keyboard className="size-3.5" /> Keyboard shortcuts
                  </summary>
                  <ul className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {SHORTCUTS.filter(([keys]) => !library || !['A', 'R', 'C'].includes(keys[0])).map(([keys, what]) => (
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
  [['C'], 'Next comparison'],
  [['A'], 'Approve and go to the next image to review'],
  [['R'], 'Write a change request'],
  [['Esc'], 'Close'],
];


function statusWord(c: ReviewCaptureView) {
  return { approved: 'approved', changes_requested: 'changes requested', changed: 'changed', new: 'new' }[c.status];
}

function DecisionNote({ capture }: { capture: ReviewCaptureView }) {
  const d = capture.decision!;
  return (
    <div className="rounded-md border border-border bg-surface-sunken p-2 text-xs">
      <p className="text-muted-foreground">
        {d.decision === 'approved' ? 'Approved' : 'Changes requested'}
        {d.by ? ` by ${d.by}` : ''} · {formatDateTime(d.at)}
        {d.runNumber ? ` · run #${d.runNumber}` : ''}
      </p>
      {d.comment ? <p className="mt-1 text-sm text-pretty whitespace-pre-wrap">{d.comment}</p> : null}
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
