'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/popover';
import { cn } from '../../lib/cn';
import {
  anchorForMarkup,
  COMMENT_TOOL_LABELS,
  DEFAULT_MARKUP_COLOR,
  isStroke,
  MAX_MARKUP_SHAPES,
  MAX_STROKE_POINTS,
  shapeFromDrag,
  simplifyStroke,
  type CommentTool,
  type MarkupColor,
  type MarkupShape,
} from '../../lib/review-markup';
import { anchorFromDrag, commentAuthorName, openingComment, type FractionAnchor, type ImageSize, type ReviewThreadView, type ThreadActions } from '../../lib/review-threads';
import { CommentComposer } from '../../patterns/comment-composer';
import { CommentPin } from '../../patterns/comment-pin';
import { MarkupShapes } from '../../patterns/markup-shapes';
import { ThreadView } from './thread-view';

/** A pin being written: where, on which capture, before it is a thread. With `markup`, a drawing; `anchor` is the area it covers. */
export interface ThreadDraft {
  captureId: string;
  anchor: FractionAnchor;
  markup?: MarkupShape[] | null;
  imageSize?: ImageSize | null;
}

/** The draft with its last shape taken back: `null` once nothing is left. */
export function undoDraftShape(draft: ThreadDraft | null): ThreadDraft | null {
  if (!draft?.markup?.length) return draft;
  const markup = draft.markup.slice(0, -1);
  const anchor = anchorForMarkup(markup);
  return anchor ? { ...draft, markup, anchor } : null;
}

/** Ask a layer to bring one of its pins into view; `nonce` repeats the request. */
export interface PinFocusRequest {
  threadId: string;
  nonce: number;
  /** Ping the pin once it is there. */
  ping?: boolean;
  /** Scroll it into view first (default); off when a list row is only hovered. */
  scroll?: boolean;
}

export interface PinLayerProps extends ThreadActions {
  captureId: string;
  threads: readonly ReviewThreadView[];
  /** What the image is, for the placing surface's accessible name. */
  label: string;
  /** Comment mode: a click drops a pin, a drag marks an area — or, with a drawing tool, draws. */
  commenting?: boolean;
  /** What a click or drag does in comment mode (default `pin`). */
  tool?: CommentTool;
  /** The colour drawing tools draw in. */
  color?: MarkupColor;
  showResolved?: boolean;
  /** Hide every pin, to look at the image unmarked. */
  hidden?: boolean;
  openThreadId?: string | null;
  /** `from`: the thread whose popover asked to close, so a late close cannot shut the next one. */
  onOpenThreadChange?: (threadId: string | null, from?: string) => void;
  draft?: ThreadDraft | null;
  onDraftChange?: (draft: ThreadDraft | null) => void;
  focus?: PinFocusRequest | null;
  now?: Date;
  viewerId?: string | null;
  canComment?: boolean;
  canModerate?: boolean;
  /**
   * The threads are drawn on the image they were placed on (the version
   * commented on, shown beside the screen now): their anchors are where they
   * were placed, and their popovers say so.
   */
  onOrigin?: boolean;
  /**
   * Threads drawn for real on the other image beside this one: a faint,
   * dashed marker here shows where they land on this image, without a
   * second pin to click.
   */
  ghosts?: readonly ReviewThreadView[];
  /** Tools in a thread's popover, beside resolve (an AI hand-off). */
  renderActions?: (thread: ReviewThreadView) => React.ReactNode;
}

const KEY_STEP = 0.01;

/** The frames a pin layer sits in, which scroll the image: a screen, or the changes view. */
const SCROLLER = '[data-slot="screen-frame"], [data-slot="diff-highlight"]';

/**
 * The pins of one screenshot, laid over the image inside its scrolling frame
 * so they scroll with it, at a fixed size whatever the zoom. Hovering a pin
 * shows its thread; clicking keeps it open. In comment mode the layer takes
 * the pointer: a click drops a draft pin with a composer beside it, a drag
 * marks an area. From the keyboard, Enter puts a crosshair in the middle,
 * the arrow keys move it (Shift for bigger steps) and Enter drops the pin.
 * Pins scrolled out of the frame are counted at its top and bottom edges.
 */
export function PinLayer({
  captureId,
  threads,
  label,
  commenting = false,
  tool = 'pin',
  color = DEFAULT_MARKUP_COLOR,
  showResolved = false,
  hidden = false,
  openThreadId = null,
  onOpenThreadChange,
  draft = null,
  onDraftChange,
  focus = null,
  now,
  viewerId,
  canComment = false,
  canModerate = false,
  onOrigin = false,
  ghosts = [],
  renderActions,
  onCreateThread,
  onReply,
  onSetThreadStatus,
  onEditComment,
  onDeleteComment,
  onCompareThread,
}: PinLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  // A shape being drawn: a stroke's points so far, or an arrow's, box's or ellipse's two corners.
  const [stroke, setStroke] = useState<MarkupShape | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const [draftEl, setDraftEl] = useState<HTMLElement | null>(null);
  const [ping, setPing] = useState<{ threadId: string; nonce: number } | null>(null);
  const pins = hidden ? [] : threads.filter((t) => t.anchor.kind !== 'image' && (showResolved || t.status === 'open' || t.id === openThreadId));
  const offscreen = useOffscreenPins(layerRef, pins);
  const ownDraft = draft && draft.captureId === captureId ? draft : null;
  const threadProps = { now, viewerId, canComment, canModerate, captureId, onOrigin, onReply, onSetThreadStatus, onEditComment, onDeleteComment, onCompareThread };
  const shownGhosts = hidden ? [] : ghosts.filter((t) => t.anchor.kind !== 'image' && (showResolved || t.status === 'open'));

  const drawing = commenting && tool !== 'pin';

  // Leaving comment mode drops a half-placed pin.
  useEffect(() => {
    if (!commenting) {
      setDrag(null);
      setStroke(null);
      setCrosshair(null);
    }
  }, [commenting]);

  useEffect(() => {
    if (!focus || !threads.some((t) => t.id === focus.threadId)) return;
    const el = layerRef.current?.querySelector<HTMLElement>(`[data-thread-id="${focus.threadId}"]`);
    if (!el) return;
    if (focus.ping) setPing({ threadId: focus.threadId, nonce: focus.nonce });
    if (focus.scroll === false) return;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const bring = () => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
    // Until the image loads the layer has no height, and every pin sits at the top.
    const img = layerRef.current?.parentElement?.querySelector('img');
    if (img && !img.complete) {
      img.addEventListener('load', bring, { once: true });
      return () => img.removeEventListener('load', bring);
    }
    bring();
  }, [focus, threads]);

  const imageSize = (): ImageSize | null => {
    const img = layerRef.current?.parentElement?.querySelector('img');
    return img?.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null;
  };
  const fractionAt = (e: { clientX: number; clientY: number }) => {
    const r = layerRef.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const place = (anchor: FractionAnchor) => {
    onOpenThreadChange?.(null);
    onDraftChange?.({ captureId, anchor, imageSize: imageSize() });
  };
  /** Adds a finished shape to the drawing being written here, or starts one; a pin being written gives way to it. */
  const addShape = (shape: MarkupShape) => {
    const prior = ownDraft?.markup?.length ? ownDraft.markup : [];
    if (prior.length >= MAX_MARKUP_SHAPES) return;
    const markup = [...prior, shape];
    if (!prior.length) onOpenThreadChange?.(null);
    onDraftChange?.({ captureId, anchor: anchorForMarkup(markup)!, markup, imageSize: ownDraft?.imageSize ?? imageSize() });
  };
  /** The shape under way, finished at the pointer: a stroke smoothed, an arrow or box only when it was dragged. */
  const finishShape = (current: MarkupShape, at: { x: number; y: number }) => {
    if (isStroke(current.tool)) {
      const r = layerRef.current!.getBoundingClientRect();
      // Simplified in screen pixels, where a mouse's jitter is measured.
      const px = current.points.map((n, i) => n * (i % 2 === 0 ? r.width : r.height));
      const points = simplifyStroke(px, 0.8).map((n, i) => clamp(n / (i % 2 === 0 ? r.width : r.height)));
      return { ...current, points };
    }
    return shapeFromDrag(current.tool as 'arrow' | 'rect' | 'ellipse', current.color, { x: current.points[0], y: current.points[1] }, at);
  };

  const draftAnchor = drag ? anchorFromDrag(drag.start, drag.end) : null;

  return (
    <div
      ref={layerRef}
      data-slot="pin-layer"
      className={cn('absolute inset-0', commenting ? 'cursor-crosshair touch-none' : 'pointer-events-none')}
      role={commenting ? 'application' : undefined}
      tabIndex={commenting ? 0 : undefined}
      aria-label={
        drawing
          ? `Draw on ${label} with the ${COMMENT_TOOL_LABELS[tool].toLowerCase()}: drag to draw, then write what should change`
          : commenting
            ? `Place a comment on ${label}: press Enter, move with the arrow keys, Enter again to drop the pin`
            : undefined
      }
      onPointerDown={(e) => {
        // React events bubble through portals: a click in a thread's or the draft's popover is not a click on the image.
        if (!commenting || e.button !== 0 || !e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest('[data-slot="comment-pin"], button')) return;
        try {
          // Keeps a drag that leaves the image drawing its area.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // A pointer the browser does not track (a synthetic one) cannot be captured.
        }
        const at = fractionAt(e);
        if (drawing) setStroke({ tool: tool as MarkupShape['tool'], color, points: [at.x, at.y, ...(isStroke(tool as MarkupShape['tool']) ? [] : [at.x, at.y])] });
        else setDrag({ start: at, end: at });
      }}
      onPointerMove={(e) => {
        if (drag) setDrag({ ...drag, end: fractionAt(e) });
        if (!stroke) return;
        const at = fractionAt(e);
        if (!isStroke(stroke.tool)) {
          setStroke({ ...stroke, points: [stroke.points[0], stroke.points[1], at.x, at.y] });
          return;
        }
        // A point every couple of screen pixels is enough for a smooth line.
        const r = layerRef.current!.getBoundingClientRect();
        const n = stroke.points.length;
        const moved = Math.hypot((at.x - stroke.points[n - 2]) * r.width, (at.y - stroke.points[n - 1]) * r.height);
        if (moved >= 2 && n / 2 < MAX_STROKE_POINTS) setStroke({ ...stroke, points: [...stroke.points, at.x, at.y] });
      }}
      onPointerUp={(e) => {
        if (stroke) {
          const shape = finishShape(stroke, fractionAt(e));
          setStroke(null);
          if (shape) addShape(shape);
          return;
        }
        if (!drag) return;
        const anchor = anchorFromDrag(drag.start, fractionAt(e));
        setDrag(null);
        place(anchor);
      }}
      onPointerCancel={() => {
        setDrag(null);
        setStroke(null);
      }}
      onKeyDown={(e) => {
        if (!commenting || drawing || e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (crosshair) {
            place({ kind: 'point', x: crosshair.x, y: crosshair.y });
            setCrosshair(null);
          } else setCrosshair(visibleCenter(layerRef.current!));
        } else if (crosshair && e.key.startsWith('Arrow')) {
          e.preventDefault();
          e.stopPropagation();
          const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          setCrosshair({ x: clamp(crosshair.x + dx), y: clamp(crosshair.y + dy) });
        } else if (crosshair && e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setCrosshair(null);
        }
      }}
    >
      {shownGhosts.map((t) => (
        <GhostPin key={`ghost-${t.id}`} thread={t} active={openThreadId === t.id} />
      ))}

      {pins.map((t) => (
        <ThreadPin key={t.id} thread={t} open={openThreadId === t.id} ping={ping?.threadId === t.id ? ping.nonce : null} onOpenThreadChange={onOpenThreadChange} actions={renderActions?.(t)} {...threadProps} />
      ))}

      {stroke ? <MarkupShapes shapes={[stroke]} /> : null}

      {draftAnchor?.kind === 'area' ? (
        <div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-accent-solid bg-accent-solid/10" style={{ left: pct(draftAnchor.x), top: pct(draftAnchor.y), width: pct(draftAnchor.w ?? 0), height: pct(draftAnchor.h ?? 0) }} />
      ) : null}

      {crosshair ? (
        <div aria-hidden data-slot="pin-crosshair" className="pointer-events-none absolute size-6 -translate-1/2 rounded-full border-2 border-accent-solid bg-accent-solid/15 shadow-e2" style={{ left: pct(crosshair.x), top: pct(crosshair.y) }}>
          <span className="absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full bg-accent-solid" />
        </div>
      ) : null}

      {ownDraft ? (
        <>
          {ownDraft.markup?.length ? (
            <MarkupShapes shapes={ownDraft.markup} />
          ) : ownDraft.anchor.kind === 'area' ? (
            <div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-accent-solid bg-accent-solid/10" style={{ left: pct(ownDraft.anchor.x), top: pct(ownDraft.anchor.y), width: pct(ownDraft.anchor.w ?? 0), height: pct(ownDraft.anchor.h ?? 0) }} />
          ) : null}
          <div ref={ownDraft.markup?.length ? undefined : setDraftEl} className="pointer-events-none absolute z-30 -translate-y-full" style={pinPosition(ownDraft.anchor)}>
            <CommentPin state="draft" tabIndex={-1} aria-hidden className="pointer-events-none" />
          </div>
          {/* A drawing's composer sits beside it, not over it, so the reviewer can keep drawing while writing. */}
          {ownDraft.markup?.length ? <div ref={setDraftEl} aria-hidden className="pointer-events-none absolute size-0" style={besideArea(ownDraft.anchor)} /> : null}
          {draftEl ? (
            <Popover
              open
              onOpenChange={(next, details) => {
                if (next) return;
                // Drawing another shape, or picking another tool or colour, presses outside the composer: that adds to the comment, it does not drop it.
                if (ownDraft.markup?.length && (details.reason === 'outside-press' || details.reason === 'focus-out')) {
                  const event = details.event as (Event & { relatedTarget?: EventTarget | null }) | undefined;
                  const to = details.reason === 'focus-out' ? event?.relatedTarget : event?.target;
                  if (to instanceof Element && (layerRef.current?.contains(to) || to.closest('[data-slot="markup-toolbar"]'))) return;
                }
                onDraftChange?.(null);
              }}
            >
              <PopoverContent anchor={draftEl} side="right" align="start" sideOffset={8} className="w-80" aria-label="New comment">
                <CommentComposer
                  label="New comment"
                  placeholder={
                    ownDraft.markup?.length
                      ? 'What should change? Name the colours — “the blue area should be larger”.'
                      : ownDraft.anchor.kind === 'area'
                        ? 'What should change in this area?'
                        : 'What should change here?'
                  }
                  autoFocus
                  onCancel={() => onDraftChange?.(null)}
                  onSubmit={(body) => {
                    onCreateThread?.({ captureId, anchor: ownDraft.anchor, ...(ownDraft.markup?.length ? { markup: ownDraft.markup } : {}), body, imageSize: ownDraft.imageSize });
                    onDraftChange?.(null);
                  }}
                />
              </PopoverContent>
            </Popover>
          ) : null}
        </>
      ) : null}

      {/* Zero-height sticky rails at the top and bottom of the image keep the counts at the frame's edges. */}
      <div className="pointer-events-none absolute inset-0 z-30 flex flex-col">
        <div className="sticky top-2 flex h-0 justify-center">
          <EdgeChip direction="up" count={offscreen.above.length} onClick={() => offscreen.above.at(-1)?.scrollIntoView({ block: 'center', behavior: 'smooth' })} />
        </div>
        <div className="flex-1" />
        <div className="sticky bottom-2 flex h-0 items-end justify-center">
          <EdgeChip direction="down" count={offscreen.below.length} onClick={() => offscreen.below[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' })} />
        </div>
      </div>
    </div>
  );
}

/**
 * One thread's pin (and area), with its thread in a popover. The popover is
 * anchored to the pin's unscaled wrapper, not the pin: the pin grows on hover
 * and when selected, and following it would make the popover jump.
 */
function ThreadPin({
  thread: t,
  open,
  ping,
  onOpenThreadChange,
  ...threadProps
}: {
  thread: ReviewThreadView;
  open: boolean;
  /** A nonce: ping the pin once for each new value. */
  ping: number | null;
  onOpenThreadChange?: PinLayerProps['onOpenThreadChange'];
} & Omit<React.ComponentProps<typeof ThreadView>, 'thread' | 'onClose'>) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const besideRef = useRef<HTMLDivElement>(null);
  const first = openingComment(t);
  // On the image it was placed on, a pin is where it was put: not outdated there.
  const outdated = t.placement === 'outdated' && !threadProps.onOrigin;
  const markup = t.markup?.length ? t.markup : null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {markup ? (
        <>
          <MarkupShapes shapes={markup} muted={t.status === 'resolved'} dashed={outdated} emphasis={open} />
          {/* The thread's popover opens beside the drawing, so it does not cover what it is about. */}
          <div ref={besideRef} aria-hidden className="absolute size-0" style={besideArea(t.anchor)} />
          {open ? <div aria-hidden className="absolute rounded-sm outline-1 outline-offset-4 outline-accent-solid/50 outline-dashed" style={{ left: pct(t.anchor.x), top: pct(t.anchor.y), width: pct(t.anchor.w ?? 0), height: pct(t.anchor.h ?? 0) }} /> : null}
        </>
      ) : t.anchor.kind === 'area' && t.anchor.w != null && t.anchor.h != null ? (
        <div
          aria-hidden
          className={cn(
            'absolute rounded-sm border-2 transition-[background-color,border-color] duration-150',
            t.status === 'resolved' ? 'border-muted-foreground/40' : 'border-accent-solid',
            outdated && 'border-dashed',
            open ? 'bg-accent-solid/15' : 'bg-accent-solid/5',
          )}
          style={{ left: pct(t.anchor.x), top: pct(t.anchor.y), width: pct(t.anchor.w), height: pct(t.anchor.h) }}
        />
      ) : null}
      <div ref={anchorRef} className={cn('pointer-events-auto absolute -translate-y-full', open ? 'z-20' : 'z-10')} style={pinPosition(t.anchor)} data-thread-id={t.id}>
        {ping != null ? <span key={ping} aria-hidden className="pointer-events-none absolute inset-0 animate-pin-ping rounded-full rounded-bl-[3px]" /> : null}
        <Popover open={open} onOpenChange={(next) => onOpenThreadChange?.(next ? t.id : null, t.id)}>
          <PopoverTrigger
            openOnHover
            delay={200}
            closeDelay={150}
            render={
              <CommentPin
                number={t.number}
                state={t.status === 'resolved' ? 'resolved' : outdated ? 'outdated' : 'open'}
                selected={open}
                pending={t.pending}
                aria-label={`Thread ${t.number}${t.status === 'resolved' ? ', resolved' : ''}${markup ? ', with a drawing' : ''}${first ? `: ${commentAuthorName(first)} — ${excerpt(first.body)}` : ''}`}
              />
            }
          />
          <PopoverContent
            anchor={markup ? besideRef : anchorRef}
            side="right"
            align="start"
            sideOffset={8}
            className="w-80"
            aria-label={`Thread ${t.number}`}
            initialFocus={(type) => type === 'keyboard'}
            finalFocus={(type) => type === 'keyboard'}
          >
            <ThreadView thread={t} {...threadProps} onClose={() => onOpenThreadChange?.(null, t.id)} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/** Where a thread drawn on the other image lands on this one: a marker, not a control. */
function GhostPin({ thread: t, active }: { thread: ReviewThreadView; active: boolean }) {
  return (
    <div aria-hidden data-slot="ghost-pin" className="pointer-events-none absolute inset-0">
      {t.markup?.length ? (
        <MarkupShapes shapes={t.markup} dashed className={cn('transition-opacity', active ? 'opacity-90' : 'opacity-40')} />
      ) : t.anchor.kind === 'area' && t.anchor.w != null && t.anchor.h != null ? (
        <div
          className={cn('absolute rounded-sm border-2 border-dashed transition-colors duration-150', active ? 'border-accent-solid bg-accent-solid/10' : 'border-accent-solid/40')}
          style={{ left: pct(t.anchor.x), top: pct(t.anchor.y), width: pct(t.anchor.w), height: pct(t.anchor.h) }}
        />
      ) : null}
      <div className="absolute -translate-y-full" style={pinPosition(t.anchor)}>
        <span
          className={cn(
            'inline-flex h-6 min-w-6 items-center justify-center rounded-full rounded-bl-[3px] bg-surface/80 px-1.5 text-label-xs text-accent-text tabular-nums outline-2 outline-dashed -outline-offset-2 backdrop-blur-sm transition-opacity duration-150',
            active ? 'opacity-100 outline-accent-solid' : 'opacity-60 outline-accent-solid/60',
          )}
        >
          {t.number}
        </span>
      </div>
    </div>
  );
}

function EdgeChip({ direction, count, onClick }: { direction: 'up' | 'down'; count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
        <button
          type="button"
          onClick={onClick}
          className="pointer-events-auto inline-flex h-6 animate-rise-in items-center gap-1 rounded-full bg-foreground px-2 text-label-xs text-background shadow-e2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {direction === 'up' ? <ChevronUp aria-hidden className="size-3.5" /> : <ChevronDown aria-hidden className="size-3.5" />}
          {count} more {direction === 'up' ? 'above' : 'below'}
        </button>
  );
}

/** The pins of `layer` scrolled above and below its frame, in page order; followed on scroll and resize. */
function useOffscreenPins(layer: React.RefObject<HTMLDivElement | null>, pins: readonly unknown[]) {
  const [state, setState] = useState<{ above: HTMLElement[]; below: HTMLElement[] }>({ above: [], below: [] });
  useLayoutEffect(() => {
    const el = layer.current;
    const scroller = el?.closest<HTMLElement>(SCROLLER);
    if (!el || !scroller) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const view = scroller.getBoundingClientRect();
      const all = [...el.querySelectorAll<HTMLElement>('[data-thread-id]')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const above = all.filter((p) => p.getBoundingClientRect().bottom < view.top + 4);
      const below = all.filter((p) => p.getBoundingClientRect().top > view.bottom - 4);
      setState((cur) => (cur.above.length === above.length && cur.below.length === below.length && cur.above.every((p, i) => p === above[i]) && cur.below.every((p, i) => p === below[i]) ? cur : { above, below }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(el);
    return () => {
      scroller.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [layer, pins]);
  return state;
}

/** The middle of the part of the layer its frame shows, in fractions of the layer. */
function visibleCenter(layer: HTMLElement) {
  const r = layer.getBoundingClientRect();
  const view = layer.closest(SCROLLER)?.getBoundingClientRect() ?? r;
  const top = Math.max(r.top, view.top);
  const bottom = Math.min(r.bottom, view.bottom);
  return { x: 0.5, y: clamp(((top + bottom) / 2 - r.top) / r.height) };
}

/**
 * Where a pin's tip goes. A pin rises from its point, so one near the top or
 * the right edge of the image is nudged inside, or the frame would cut it off.
 */
const pinPosition = (a: { x: number; y: number }) => ({ left: `min(${pct(a.x)}, calc(100% - 1.75rem))`, top: `max(${pct(a.y)}, 1.75rem)` });

/** A point just right of an area's top edge: where a popover about the area opens. */
const besideArea = (a: FractionAnchor) => ({ left: pct(Math.min(1, a.x + (a.w ?? 0))), top: pct(a.y) });

const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
const excerpt = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);
