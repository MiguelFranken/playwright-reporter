'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { FrameSize, ReviewImage } from '../../lib/review';
import { useImage } from '../../provider';
import { UnavailableImage } from './review-frame';

/**
 * The CSS variable a `live` frame takes its zoom from, when an ancestor sets
 * it: the storyboard's size slider moves it on every frame of a drag without
 * re-rendering the screens.
 */
export const SCREEN_ZOOM_VAR = '--screen-zoom';

/**
 * The CSS variable with the height a `live` frame may fill, when an ancestor
 * (the viewer's stage) sets it: a longer screen ends there and scrolls
 * inside, and one asked to (`room`) is exactly that tall whatever the zoom.
 */
export const SCREEN_ROOM_VAR = '--screen-room';

/**
 * The attribute an ancestor carries while its size is changing (`data-moving`
 * on the viewer's stage: the panel's edge dragged, the panel opening or
 * closing, the window resized). The image of a frame is laid out once, at the
 * frame's own width, and scaled to the zoom by a transform; while this is set
 * it is a layer of its own, which the GPU scales without the image being
 * decoded and rastered again on every frame — the cost that made a large
 * screenshot drag. Taken off at rest, it is rastered once more, sharp.
 */
export const MOVING_ATTR = 'data-moving';

/**
 * `children` laid out at `width` CSS pixels and scaled by `zoom` (a number,
 * or a CSS expression of `SCREEN_ZOOM_VAR`) inside a box of `aspect`'s shape
 * at the zoomed size. The zoom changing then lays nothing inside out again,
 * and while an ancestor carries `MOVING_ATTR` the GPU does the scaling.
 */
export function ScaledLayer({ width, zoom, aspect, children }: { width: number; zoom: string; aspect: { width: number; height: number }; children: ReactNode }) {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="relative origin-top-left in-data-moving:will-change-transform" style={{ width, transform: `scale(${zoom})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** `px` CSS pixels at the live zoom (`zoom` where no ancestor sets one), never below the 24px a frame keeps. */
export function liveWidth(px: number, zoom: number): string {
  return `max(24px, calc(${px}px * var(${SCREEN_ZOOM_VAR}, ${zoom})))`;
}

/** As `liveWidth`, but no taller than the room an ancestor gives it; `room` makes it exactly that tall. */
export function liveHeight(px: number, zoom: number, room = false): string {
  if (room) return `var(${SCREEN_ROOM_VAR}, ${Math.round(px * zoom)}px)`;
  return `max(24px, min(calc(${px}px * var(${SCREEN_ZOOM_VAR}, ${zoom})), var(${SCREEN_ROOM_VAR}, 999999px)))`;
}

/** The one outline a screen carries: hairline grey, or the colour of what it asks of a reviewer. */
const TONE_RING = {
  info: 'ring-2 ring-info-border',
  warning: 'ring-2 ring-warning-border',
  danger: 'ring-2 ring-danger-border',
} as const;

/**
 * A capture on a screen: a frame of `frame` CSS pixels shown at `zoom`, the
 * image scaled to the frame's width and scrolling inside it — a phone is
 * tall and narrow, a laptop wide, and a full-page capture is read by
 * scrolling the screen, not by stretching the page.
 *
 * In a page of screens (`wheel="page"`) the wheel belongs to the page: a
 * frame under the pointer would otherwise swallow every scroll meant to
 * reach the next flow, and a full-page capture is thousands of pixels long.
 * The frame still scrolls, deliberately — by dragging the bar at its edge, by
 * scrolling with ⌥ / Alt (or ⌘ / Ctrl) held, or with the arrow keys once
 * focused — and a shadow at its foot says there is more below.
 *
 * The image is asked for at the width it is shown (`sizes`), so a host that
 * resizes images sends a small one to a small screen and a sharper one when
 * the screens grow. Until it has loaded and decoded, a shimmering placeholder
 * holds its place.
 */
export function ScreenFrame({
  image,
  frame,
  zoom = 1,
  alt,
  scroll = true,
  className,
  label,
  tone,
  live = false,
  room = false,
  overlay,
  eager = false,
  wheel = 'frame',
}: {
  image: ReviewImage;
  frame: FrameSize;
  zoom?: number;
  alt: string;
  /** Off for small previews, which show the top of the page only. */
  scroll?: boolean;
  className?: string;
  /** Accessible name of the scroll region; defaults to `alt`. */
  label?: string;
  /** Colours the outline: a new (info), changed (warning) or rejected/failed (danger) screen. */
  tone?: keyof typeof TONE_RING;
  /** Sizes the frame from `SCREEN_ZOOM_VAR` when an ancestor sets it, `zoom` otherwise (which still picks the image). */
  live?: boolean;
  /** Live, as tall as the room `SCREEN_ROOM_VAR` gives it, whatever the zoom: a screen filling the stage. */
  room?: boolean;
  /** Drawn over the image (marks, boxes), told whether the full image or the first-screen preview is shown. */
  overlay?: (shown: 'full' | 'preview') => React.ReactNode;
  /** Load at once rather than when scrolled near: the screen a viewer opened on. */
  eager?: boolean;
  /**
   * Who a plain wheel over a scrolling frame scrolls: the frame (a viewer,
   * where it is the one thing on screen), or the page (a storyboard of many).
   */
  wheel?: 'frame' | 'page';
}) {
  const width = Math.max(24, Math.round(frame.width * zoom));
  const height = Math.max(24, Math.round(frame.height * zoom));
  const picture = image.available ? <FrameImage image={image} alt={alt} shownWidth={width} eager={eager} scaled={{ width: frame.width, zoom: live ? `var(${SCREEN_ZOOM_VAR}, ${zoom})` : `${zoom}` }} /> : null;
  const content =
    picture && overlay ? (
      <div className="relative">
        {picture}
        {overlay('full')}
      </div>
    ) : (
      (picture ?? <UnavailableImage image={image} />)
    );
  const size = live ? { width: liveWidth(frame.width, zoom), height: liveHeight(frame.height, zoom, room) } : { width, height };
  if (scroll && wheel === 'page') {
    return (
      <PageFirstFrame label={label ?? alt} className={cn(tone ? TONE_RING[tone] : 'ring-1 ring-border', className)} style={size}>
        {content}
      </PageFirstFrame>
    );
  }
  return (
    <div
      data-slot="screen-frame"
      role={scroll ? 'region' : undefined}
      aria-label={scroll ? (label ?? alt) : undefined}
      tabIndex={scroll ? 0 : undefined}
      className={cn(
        'relative shrink-0 overscroll-y-contain rounded-md bg-surface shadow-e1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        tone ? TONE_RING[tone] : 'ring-1 ring-border',
        scroll ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden',
        className,
      )}
      style={size}
    >
      {content}
    </div>
  );
}

/** Lines and pages of a wheel event, in pixels. */
const wheelPixels = (e: WheelEvent, page: number) => (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * page : e.deltaY);

/** How far the keys move a focused frame. */
const KEY_STEP = 48;

/**
 * A frame that does not take the wheel from the page. It is not a scroll
 * container the browser can hand a wheel to (`overflow: hidden`), so a plain
 * wheel scrolls the page, smoothly and natively; the frame is moved by the
 * bar, a modified wheel and the keys.
 */
function PageFirstFrame({ label, className, style, children }: { label: string; className?: string; style: React.CSSProperties; children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  /** How far down the frame is (0–1), how much of it shows (0–1), and whether it is at the foot; null when it all fits. */
  const [bar, setBar] = useState<{ progress: number; size: number; end: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollHeight - el.clientHeight;
      setBar(max > 1 ? { progress: Math.min(1, el.scrollTop / max), size: el.clientHeight / el.scrollHeight, end: el.scrollTop >= max - 1 } : null);
    };
    measure();
    // Ctrl and a wheel is a trackpad's pinch on a Mac: that stays the browser's.
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const onWheel = (e: WheelEvent) => {
      if (!(e.altKey || e.metaKey || (e.ctrlKey && !mac))) return;
      if (el.scrollHeight - el.clientHeight <= 1) return;
      e.preventDefault();
      el.scrollTop += wheelPixels(e, el.clientHeight);
    };
    el.addEventListener('scroll', measure, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    // The image arriving (or the zoom changing) changes how much there is to scroll.
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    for (const child of el.children) resize.observe(child);
    return () => {
      el.removeEventListener('scroll', measure);
      el.removeEventListener('wheel', onWheel);
      resize.disconnect();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = scroller.current;
    if (!el || e.target !== e.currentTarget || el.scrollHeight - el.clientHeight <= 1) return;
    const page = el.clientHeight * 0.9;
    const to: Record<string, number> = { ArrowDown: el.scrollTop + KEY_STEP, ArrowUp: el.scrollTop - KEY_STEP, PageDown: el.scrollTop + page, PageUp: el.scrollTop - page, Home: 0, End: el.scrollHeight };
    if (!(e.key in to)) return;
    e.preventDefault();
    el.scrollTop = to[e.key];
  };

  /** Drags the bar: from where it was grabbed, or — on the track — from centring the thumb there. */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const track = e.currentTarget.getBoundingClientRect();
    const onThumb = (e.target as HTMLElement).dataset.slot === 'screen-scroll-thumb';
    if (!onThumb) el.scrollTop = ((e.clientY - track.top) / track.height) * el.scrollHeight - el.clientHeight / 2;
    const start = { y: e.clientY, top: el.scrollTop };
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => {
      el.scrollTop = start.top + ((ev.clientY - start.y) / track.height) * el.scrollHeight;
    };
    const end = () => {
      setDragging(false);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  return (
    <div
      data-slot="screen-frame"
      role="region"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn('group/frame relative shrink-0 overflow-hidden rounded-md bg-surface shadow-e1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40', className)}
      style={style}
    >
      <div ref={scroller} className="size-full overflow-hidden rounded-[inherit]">
        {children}
      </div>
      {bar ? (
        <>
          {bar.end ? null : <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-overlay to-transparent opacity-50" />}
          {/* A click on the bar scrolls; it never reaches the frame's own click, which opens the viewer. */}
          <div
            aria-hidden
            data-slot="screen-scroll-track"
            title="Drag to scroll this screen, or scroll with ⌥ / Alt held"
            onPointerDown={onPointerDown}
            onClick={(e) => e.stopPropagation()}
            data-dragging={dragging || undefined}
            className="absolute top-1 right-0.5 bottom-1 flex w-3 cursor-default touch-none justify-center opacity-0 transition-opacity group-hover/frame:opacity-100 group-focus-visible/frame:opacity-100 data-dragging:opacity-100 pointer-coarse:opacity-100"
          >
            <span
              data-slot="screen-scroll-thumb"
              className="absolute w-1.5 rounded-full bg-overlay ring-1 ring-surface/70 transition-[width] hover:w-2 in-data-dragging:w-2"
              style={{ height: `max(16px, ${bar.size * 100}%)`, top: `calc((100% - max(16px, ${bar.size * 100}%)) * ${bar.progress})` }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * The image of a frame, and its placeholder until the browser can paint it:
 * a cached image counts as loaded the moment it mounts, a new one once it is
 * decoded, so the shimmer never gives way to a half-drawn picture.
 *
 * `scaled` (and a recorded size) lays the image out at `width` CSS pixels —
 * the frame's at a zoom of 1 — inside a box of its own shape at the zoom, and
 * scales it there by `zoom` (a number, or a CSS expression of `SCREEN_ZOOM_VAR`):
 * the zoom changing then lays nothing out again, see `MOVING_ATTR`.
 */
export function FrameImage({ image, alt, shownWidth, eager = false, className, scaled }: { image: ReviewImage; alt: string; shownWidth: number; eager?: boolean; className?: string; scaled?: { width: number; zoom: string } }) {
  const Image = useImage();
  const [state, setState] = useState<{ src: string; status: 'loading' | 'ready' | 'failed' }>({ src: image.url, status: 'loading' });
  // Another image in the same frame starts over; a sharper copy of the same one (a new `sizes`) does not.
  const status = state.src === image.url ? state.status : 'loading';
  if (state.src !== image.url) setState({ src: image.url, status: 'loading' });
  const ready = useCallback(() => setState((s) => (s.src === image.url ? { ...s, status: 'ready' } : s)), [image.url]);
  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth > 0) ready();
    },
    [ready],
  );
  const known = image.width && image.height ? { width: image.width, height: image.height } : null;
  if (status === 'failed') return <UnavailableImage image={{ ...image, available: false, unavailableReason: 'failed' }} />;
  const scale = scaled && known ? scaled : null;
  const picture = (
    <>
      <Image
        ref={ref}
        src={image.url}
        alt={alt}
        width={known?.width}
        height={known?.height}
        sizes={`${Math.max(16, Math.round(shownWidth))}px`}
        loading={eager ? 'eager' : 'lazy'}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          // Painting a large screenshot takes a moment after it arrives; wait for it off the main thread.
          if (typeof img.decode === 'function') img.decode().then(ready, ready);
          else ready();
        }}
        onError={() => setState({ src: image.url, status: 'failed' })}
        className={cn('block h-auto w-full transition-opacity duration-200', status === 'ready' ? 'opacity-100' : 'opacity-0', className)}
        // Its own shape before it arrives; without one, the frame's height, so the placeholder has room.
        style={known ? { aspectRatio: `${known.width} / ${known.height}` } : status === 'ready' ? undefined : { minHeight: '100%' }}
      />
      {status === 'ready' ? null : (
        <span
          aria-hidden
          data-slot="image-skeleton"
          className="pointer-events-none absolute inset-x-0 top-0 block h-full min-h-full animate-shimmer bg-shimmer"
        />
      )}
    </>
  );
  if (!scale) return picture;
  return (
    <ScaledLayer width={scale.width} zoom={scale.zoom} aspect={known!}>
      {picture}
    </ScaledLayer>
  );
}
