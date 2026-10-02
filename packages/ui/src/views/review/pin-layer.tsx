'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/popover';
import { cn } from '../../lib/cn';
import {
  COMMENT_TOOL_LABELS,
  constrainDrag,
  DEFAULT_MARKUP_COLOR,
  isMarkupTool,
  isStroke,
  MAX_STROKE_POINTS,
  shapeDistance,
  shapeFromDrag,
  simplifyStroke,
  STREAMLINE,
  streamlinePoint,
  type CommentTool,
  type MarkupColor,
  type MarkupShape,
  type ReviewDrawingView,
} from '../../lib/review-markup';
import { anchorFromDrag, commentAuthorName, openingComment, type FractionAnchor, type ImageSize, type ReviewThreadView, type ThreadActions } from '../../lib/review-threads';
import { CommentComposer } from '../../patterns/comment-composer';
import { CommentPin } from '../../patterns/comment-pin';
import { HIGHLIGHTER_WIDTH, MarkupShapes, PEN_WIDTH } from '../../patterns/markup-shapes';
import { ThreadView } from './thread-view';

/** A pin or an area being written: where, on which capture, before it is a thread. */
export interface ThreadDraft {
  captureId: string;
  anchor: FractionAnchor;
  imageSize?: ImageSize | null;
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

export interface PinLayerProps extends Omit<ThreadActions, 'onCreateDrawings' | 'onDeleteDrawings'> {
  captureId: string;
  threads: readonly ReviewThreadView[];
  /** Drawings on the image, on their own. */
  drawings?: readonly ReviewDrawingView[];
  /** What the image is, for the placing surface's accessible name. */
  label: string;
  /** Comment mode: a click drops a pin, a drag marks an area — or, with a drawing tool, draws. */
  commenting?: boolean;
  /** What a click or drag does in comment mode (default `pin`). */
  tool?: CommentTool;
  /** The colour drawing tools draw in. */
  color?: MarkupColor;
  /** A shape was drawn: save it. `imageSize` is the image as the browser loaded it. */
  onDraw?: (shape: MarkupShape, imageSize: ImageSize | null) => void;
  /** The eraser went over these drawings: erase them. */
  onErase?: (drawings: ReviewDrawingView[]) => void;
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
/** How far a drawing tool must be dragged, in screen pixels, before the shape shows: a press alone draws nothing that jumps away. */
const DRAG_SHOWS = 3;
/** Stroke points closer than this, in screen pixels, add nothing to the line. */
const STROKE_STEP = 1.5;
/** How close to a drawing's ink the eraser must come, in screen pixels, beyond the ink's own half-width. */
const ERASER_REACH = 8;

/** A circle for the eraser's pointer: where it takes away, not a crosshair that suggests placing. */
const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="7" fill="white" fill-opacity="0.6" stroke="black" stroke-width="1.5"/></svg>')}") 10 10, cell`;

/** The frames a pin layer sits in, which scroll the image: a screen, or the changes view. */
const SCROLLER = '[data-slot="screen-frame"], [data-slot="diff-highlight"]';

/**
 * The pins and drawings of one screenshot, laid over the image inside its
 * scrolling frame so they scroll with it, at a fixed size whatever the zoom.
 * Hovering a pin shows its thread; clicking keeps it open. In comment mode
 * the layer takes the pointer:
 * - the pin: a click drops a draft pin with a composer beside it; from the
 *   keyboard, Enter puts a crosshair in the middle, the arrow keys move it
 *   (Shift for bigger steps) and Enter drops the pin;
 * - the area: a drag marks an area to comment on (from the keyboard, Enter
 *   twice, at two corners);
 * - the drawing tools draw, steadied as they go, and each shape is saved on
 *   its own, without a comment; Shift keeps an arrow at 45° steps and makes
 *   a box square and an ellipse round;
 * - the eraser takes away the drawings it is clicked on or dragged across.
 * Pins scrolled out of the frame are counted at its top and bottom edges.
 */
export function PinLayer({
  captureId,
  threads,
  drawings = [],
  label,
  commenting = false,
  tool = 'pin',
  color = DEFAULT_MARKUP_COLOR,
  onDraw,
  onErase,
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
  // A shape being drawn: a stroke's points so far, or an arrow's, box's or ellipse's two corners; `shown` once it was dragged far enough to see.
  const [stroke, setStroke] = useState<(MarkupShape & { shown: boolean }) | null>(null);
  // The eraser: the drawing under the pointer, and the ones a drag went over (gone from view until they are erased for real).
  const [hover, setHover] = useState<string | null>(null);
  const [erasing, setErasing] = useState<ReadonlySet<string> | null>(null);
  const lastEraser = useRef<{ x: number; y: number } | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  // The area's first corner, placed from the keyboard.
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null);
  const [draftEl, setDraftEl] = useState<HTMLElement | null>(null);
  const [ping, setPing] = useState<{ threadId: string; nonce: number } | null>(null);
  const pins = hidden ? [] : threads.filter((t) => t.anchor.kind !== 'image' && (showResolved || t.status === 'open' || t.id === openThreadId));
  const offscreen = useOffscreenPins(layerRef, pins);
  const ownDraft = draft && draft.captureId === captureId ? draft : null;
  const threadProps = { now, viewerId, canComment, canModerate, captureId, onOrigin, onReply, onSetThreadStatus, onEditComment, onDeleteComment, onCompareThread };
  const shownGhosts = hidden ? [] : ghosts.filter((t) => t.anchor.kind !== 'image' && (showResolved || t.status === 'open'));

  const drawing = commenting && isMarkupTool(tool);
  const erasingTool = commenting && tool === 'eraser';
  const placing = commenting && (tool === 'pin' || tool === 'area');
  const erasable = (d: ReviewDrawingView) => canModerate || Boolean(d.pending) || (Boolean(viewerId) && d.authorId === viewerId);
  const shownDrawings = hidden ? [] : drawings.filter((d) => !erasing?.has(d.id));

  // Leaving comment mode, or picking another tool, drops what was half done.
  useEffect(() => {
    setDrag(null);
    setStroke(null);
    setCrosshair(null);
    setCorner(null);
    setHover(null);
    setErasing(null);
  }, [commenting, tool]);

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
  const box = () => layerRef.current!.getBoundingClientRect();
  const fractionAt = (e: { clientX: number; clientY: number }) => {
    const r = box();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const toPx = (p: { x: number; y: number }, r = box()) => ({ x: p.x * r.width, y: p.y * r.height });
  const toFraction = (p: { x: number; y: number }, r = box()) => ({ x: clamp(p.x / r.width), y: clamp(p.y / r.height) });
  const place = (anchor: FractionAnchor) => {
    onOpenThreadChange?.(null);
    onDraftChange?.({ captureId, anchor, imageSize: imageSize() });
  };

  /** The drawings the eraser reaches at `at` (screen pixels from the layer's corner), nearest first. */
  const drawingsAt = (at: { x: number; y: number }, r = box()) =>
    shownDrawings
      .map((d) => {
        const px = { ...d, points: d.points.map((n, i) => n * (i % 2 === 0 ? r.width : r.height)) };
        const half = (d.tool === 'highlighter' ? HIGHLIGHTER_WIDTH : PEN_WIDTH) / 2;
        return { d, dist: shapeDistance(px, at) - half };
      })
      .filter((x) => x.dist <= ERASER_REACH)
      .sort((a, b) => a.dist - b.dist)
      .map((x) => x.d);
  /** The eraser moved from `from` to `to`: every drawing along the way joins the ones to erase. */
  const sweep = (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
    const r = box();
    const steps = from ? Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4)) : 1;
    const hit: string[] = [];
    for (let i = 1; i <= steps; i++) {
      const at = from ? { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps } : to;
      for (const d of drawingsAt(at, r)) if (erasable(d)) hit.push(d.id);
    }
    setErasing((prev) => (hit.every((id) => prev?.has(id)) && prev ? prev : new Set([...(prev ?? []), ...hit])));
  };

  /** The stroke under way, with the pointer's path since the last event, steadied. */
  const extendStroke = (current: MarkupShape & { shown: boolean }, events: readonly { clientX: number; clientY: number }[]) => {
    const r = box();
    const streamline = STREAMLINE[current.tool as 'pen' | 'highlighter'];
    const points = [...current.points];
    let shown = current.shown;
    for (const ev of events) {
      if (points.length / 2 >= MAX_STROKE_POINTS) break;
      const n = points.length;
      const last = toPx({ x: points[n - 2], y: points[n - 1] }, r);
      const pointer = toPx(fractionAt(ev), r);
      if (!shown && Math.hypot(pointer.x - last.x, pointer.y - last.y) < DRAG_SHOWS) continue;
      shown = true;
      const next = streamlinePoint(last, pointer, streamline);
      if (Math.hypot(next.x - last.x, next.y - last.y) < STROKE_STEP) continue;
      const f = toFraction(next, r);
      points.push(f.x, f.y);
    }
    return points.length === current.points.length && shown === current.shown ? current : { ...current, points, shown };
  };
  /** The shape under way, finished at the pointer: a stroke caught up with it and simplified, an arrow or box only when it was dragged. */
  const finishShape = (current: MarkupShape & { shown: boolean }, at: { x: number; y: number }): MarkupShape | null => {
    const { shown, ...shape } = current;
    const r = box();
    if (isStroke(shape.tool)) {
      // The steadied line lags the pointer: it ends where the pointer let go.
      const n = shape.points.length;
      const end = toPx(at, r);
      const last = toPx({ x: shape.points[n - 2], y: shape.points[n - 1] }, r);
      const px = shape.points.map((v, i) => v * (i % 2 === 0 ? r.width : r.height));
      if (shown && Math.hypot(end.x - last.x, end.y - last.y) >= 1) px.push(end.x, end.y);
      // Simplified in screen pixels, where a mouse's jitter is measured; finely, so the line does not change as it is let go.
      const points = simplifyStroke(px, 0.35).map((v, i) => clamp(v / (i % 2 === 0 ? r.width : r.height)));
      return { ...shape, points };
    }
    return shapeFromDrag(shape.tool as 'arrow' | 'rect' | 'ellipse', shape.color, { x: shape.points[0], y: shape.points[1] }, { x: shape.points[2], y: shape.points[3] });
  };

  const draftAnchor = drag && tool === 'area' ? anchorFromDrag(drag.start, drag.end) : corner && crosshair ? anchorFromDrag(corner, crosshair) : null;
  const hovered = erasingTool && hover ? (shownDrawings.find((d) => d.id === hover) ?? null) : null;

  return (
    <div
      ref={layerRef}
      data-slot="pin-layer"
      data-tool={commenting ? tool : undefined}
      className={cn('absolute inset-0', commenting ? 'cursor-crosshair touch-none' : 'pointer-events-none')}
      style={erasingTool ? { cursor: ERASER_CURSOR } : undefined}
      role={commenting ? 'application' : undefined}
      tabIndex={commenting ? 0 : undefined}
      aria-label={
        drawing
          ? `Draw on ${label} with the ${COMMENT_TOOL_LABELS[tool].toLowerCase()}: drag to draw. Drawings are saved as you draw.`
          : erasingTool
            ? `Erase drawings on ${label}: click a drawing or drag across drawings`
            : tool === 'area' && commenting
              ? `Comment on an area of ${label}: drag over it, or press Enter at one corner and again at the other`
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
        if (erasingTool) {
          const px = toPx(at);
          lastEraser.current = px;
          sweep(null, px);
        } else if (drawing) {
          // A stroke shows its dot at once, where the pointer went down; an arrow, box or ellipse waits to be dragged.
          setStroke({ tool: tool as MarkupShape['tool'], color, points: [at.x, at.y, ...(isStroke(tool as MarkupShape['tool']) ? [] : [at.x, at.y])], shown: isStroke(tool as MarkupShape['tool']) });
        } else setDrag({ start: at, end: at });
      }}
      onPointerMove={(e) => {
        if (erasingTool) {
          const px = toPx(fractionAt(e));
          if (erasing) {
            sweep(lastEraser.current, px);
            lastEraser.current = px;
          } else {
            const under = drawingsAt(px).find(erasable);
            setHover(under?.id ?? null);
          }
          return;
        }
        if (drag) setDrag({ ...drag, end: fractionAt(e) });
        if (!stroke) return;
        if (isStroke(stroke.tool)) {
          const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
          setStroke(extendStroke(stroke, events.length ? events : [e]));
          return;
        }
        const r = box();
        const start = toPx({ x: stroke.points[0], y: stroke.points[1] }, r);
        let end = toPx(fractionAt(e), r);
        if (e.shiftKey) end = constrainDrag(stroke.tool as 'arrow' | 'rect' | 'ellipse', start, end);
        const shown = stroke.shown || Math.hypot(end.x - start.x, end.y - start.y) >= DRAG_SHOWS;
        const f = toFraction(end, r);
        setStroke({ ...stroke, points: [stroke.points[0], stroke.points[1], f.x, f.y], shown });
      }}
      onPointerUp={(e) => {
        if (erasingTool) {
          const gone = drawings.filter((d) => erasing?.has(d.id));
          lastEraser.current = null;
          if (gone.length) onErase?.(gone);
          setErasing(null);
          return;
        }
        if (stroke) {
          const shape = finishShape(stroke, fractionAt(e));
          setStroke(null);
          if (shape) onDraw?.(shape, imageSize());
          return;
        }
        if (!drag) return;
        setDrag(null);
        if (tool === 'pin') return place({ kind: 'point', x: drag.start.x, y: drag.start.y });
        const anchor = anchorFromDrag(drag.start, fractionAt(e));
        // An area is dragged: a click with the area tool marks nothing.
        if (anchor.kind === 'area') place(anchor);
      }}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => {
        setDrag(null);
        setStroke(null);
        setErasing(null);
        lastEraser.current = null;
      }}
      onKeyDown={(e) => {
        if (!placing || e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!crosshair) setCrosshair(visibleCenter(layerRef.current!));
          else if (tool === 'pin') {
            place({ kind: 'point', x: crosshair.x, y: crosshair.y });
            setCrosshair(null);
          } else if (!corner) setCorner(crosshair);
          else {
            const anchor = anchorFromDrag(corner, crosshair);
            if (anchor.kind === 'area') {
              place(anchor);
              setCorner(null);
              setCrosshair(null);
            }
          }
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
          setCorner(null);
        }
      }}
    >
      {shownDrawings.length ? <MarkupShapes shapes={hovered ? shownDrawings.filter((d) => d !== hovered) : shownDrawings} /> : null}
      {/* The drawing the eraser would take: faded, the way it will go. */}
      {hovered ? <MarkupShapes shapes={[hovered]} className="opacity-30" /> : null}

      {shownGhosts.map((t) => (
        <GhostPin key={`ghost-${t.id}`} thread={t} active={openThreadId === t.id} />
      ))}

      {pins.map((t) => (
        <ThreadPin key={t.id} thread={t} open={openThreadId === t.id} ping={ping?.threadId === t.id ? ping.nonce : null} onOpenThreadChange={onOpenThreadChange} actions={renderActions?.(t)} {...threadProps} />
      ))}

      {stroke?.shown ? <MarkupShapes shapes={[stroke]} /> : null}

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
          {ownDraft.anchor.kind === 'area' ? (
            <div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-accent-solid bg-accent-solid/10" style={{ left: pct(ownDraft.anchor.x), top: pct(ownDraft.anchor.y), width: pct(ownDraft.anchor.w ?? 0), height: pct(ownDraft.anchor.h ?? 0) }} />
          ) : null}
          <div ref={setDraftEl} className="pointer-events-none absolute z-30 -translate-y-full" style={pinPosition(ownDraft.anchor)}>
            <CommentPin state="draft" tabIndex={-1} aria-hidden className="pointer-events-none" />
          </div>
          {draftEl ? (
            <Popover
              open
              onOpenChange={(next) => {
                if (!next) onDraftChange?.(null);
              }}
            >
              <PopoverContent anchor={draftEl} side="right" align="start" sideOffset={8} className="w-80" aria-label="New comment">
                <CommentComposer
                  label="New comment"
                  placeholder={ownDraft.anchor.kind === 'area' ? 'What should change in this area?' : 'What should change here?'}
                  autoFocus
                  onCancel={() => onDraftChange?.(null)}
                  onSubmit={(body) => {
                    onCreateThread?.({ captureId, anchor: ownDraft.anchor, body, imageSize: ownDraft.imageSize });
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
      const view = shownPart(scroller);
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

/**
 * The part of its frame a screen shows: the frame less its padding, which is
 * the room bars laid over a frame running under them keep clear.
 */
function shownPart(scroller: Element) {
  const r = scroller.getBoundingClientRect();
  const style = getComputedStyle(scroller);
  return { top: r.top + (parseFloat(style.paddingTop) || 0), bottom: r.bottom - (parseFloat(style.paddingBottom) || 0) };
}

/** The middle of the part of the layer its frame shows, in fractions of the layer. */
function visibleCenter(layer: HTMLElement) {
  const r = layer.getBoundingClientRect();
  const scroller = layer.closest(SCROLLER);
  const view = scroller ? shownPart(scroller) : r;
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
