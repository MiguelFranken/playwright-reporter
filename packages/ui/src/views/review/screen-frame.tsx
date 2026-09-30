'use client';

import { useCallback, useState } from 'react';
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
  overlay,
  eager = false,
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
  /** Drawn over the image (marks, boxes), told whether the full image or the first-screen preview is shown. */
  overlay?: (shown: 'full' | 'preview') => React.ReactNode;
  /** Load at once rather than when scrolled near: the screen a viewer opened on. */
  eager?: boolean;
}) {
  const width = Math.max(24, Math.round(frame.width * zoom));
  const height = Math.max(24, Math.round(frame.height * zoom));
  const picture = image.available ? <FrameImage image={image} alt={alt} shownWidth={width} eager={eager} /> : null;
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
      style={live ? { width: liveLength(frame.width, zoom), height: liveLength(frame.height, zoom) } : { width, height }}
    >
      {picture && overlay ? (
        <div className="relative">
          {picture}
          {overlay('full')}
        </div>
      ) : (
        (picture ?? <UnavailableImage image={image} />)
      )}
    </div>
  );
}

/**
 * The image of a frame, and its placeholder until the browser can paint it:
 * a cached image counts as loaded the moment it mounts, a new one once it is
 * decoded, so the shimmer never gives way to a half-drawn picture.
 */
export function FrameImage({ image, alt, shownWidth, eager = false, className }: { image: ReviewImage; alt: string; shownWidth: number; eager?: boolean; className?: string }) {
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
  return (
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
}

/** `px` CSS pixels at the live zoom, never below the 24px a frame keeps. */
function liveLength(px: number, zoom: number): string {
  return `max(24px, calc(${px}px * var(${SCREEN_ZOOM_VAR}, ${zoom})))`;
}
