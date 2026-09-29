'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/popover';
import { cn } from '../../lib/cn';
import { anchorFromDrag, openingComment, type FractionAnchor, type ImageSize, type ReviewThreadView, type ThreadActions } from '../../lib/review-threads';
import { CommentComposer } from '../../patterns/comment-composer';
import { CommentPin } from '../../patterns/comment-pin';
import { ThreadView } from './thread-view';

/** A pin being written: where, on which capture, before it is a thread. */
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

export interface PinLayerProps extends ThreadActions {
  captureId: string;
  threads: readonly ReviewThreadView[];
  /** What the image is, for the placing surface's accessible name. */
  label: string;
  /** Comment mode: a click drops a pin, a drag marks an area. */
  commenting?: boolean;
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
  onCreateThread,
  onReply,
  onSetThreadStatus,
  onEditComment,
  onDeleteComment,
}: PinLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const [draftEl, setDraftEl] = useState<HTMLElement | null>(null);
  const [ping, setPing] = useState<{ threadId: string; nonce: number } | null>(null);
  const pins = hidden ? [] : threads.filter((t) => t.anchor.kind !== 'image' && (showResolved || t.status === 'open' || t.id === openThreadId));
  const offscreen = useOffscreenPins(layerRef, pins);
  const ownDraft = draft && draft.captureId === captureId ? draft : null;
  const threadProps = { now, viewerId, canComment, canModerate, captureId, onReply, onSetThreadStatus, onEditComment, onDeleteComment };

  // Leaving comment mode drops a half-placed pin.
  useEffect(() => {
    if (!commenting) {
      setDrag(null);
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

  const draftAnchor = drag ? anchorFromDrag(drag.start, drag.end) : null;

  return (
    <div
      ref={layerRef}
      data-slot="pin-layer"
      className={cn('absolute inset-0', commenting ? 'cursor-crosshair touch-none' : 'pointer-events-none')}
      role={commenting ? 'application' : undefined}
      tabIndex={commenting ? 0 : undefined}
      aria-label={commenting ? `Place a comment on ${label}: press Enter, move with the arrow keys, Enter again to drop the pin` : undefined}
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
        setDrag({ start: at, end: at });
      }}
      onPointerMove={(e) => {
        if (drag) setDrag({ ...drag, end: fractionAt(e) });
      }}
      onPointerUp={(e) => {
        if (!drag) return;
        const anchor = anchorFromDrag(drag.start, fractionAt(e));
        setDrag(null);
        place(anchor);
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        if (!commenting || e.target !== e.currentTarget) return;
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
      {pins.map((t) => (
        <ThreadPin key={t.id} thread={t} open={openThreadId === t.id} ping={ping?.threadId === t.id ? ping.nonce : null} onOpenThreadChange={onOpenThreadChange} {...threadProps} />
      ))}

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
            <Popover open onOpenChange={(next) => !next && onDraftChange?.(null)}>
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
  const first = openingComment(t);
  return (
    <div className="pointer-events-none absolute inset-0">
      {t.anchor.kind === 'area' && t.anchor.w != null && t.anchor.h != null ? (
        <div
          aria-hidden
          className={cn(
            'absolute rounded-sm border-2 transition-[background-color,border-color] duration-150',
            t.status === 'resolved' ? 'border-muted-foreground/40' : 'border-accent-solid',
            t.placement === 'outdated' && 'border-dashed',
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
                state={t.status === 'resolved' ? 'resolved' : t.placement === 'outdated' ? 'outdated' : 'open'}
                selected={open}
                pending={t.pending}
                aria-label={`Thread ${t.number}${t.status === 'resolved' ? ', resolved' : ''}${first ? `: ${first.author?.name ?? 'AI assistant'} — ${excerpt(first.body)}` : ''}`}
              />
            }
          />
          <PopoverContent
            anchor={anchorRef}
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

const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
const excerpt = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);
