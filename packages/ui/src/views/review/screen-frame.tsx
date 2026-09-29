import { cn } from '../../lib/cn';
import type { FrameSize, ReviewImage } from '../../lib/review';
import { UnavailableImage } from './review-frame';

/** Below this width a frame shows the small preview; above it the full image, which can scroll. */
const PREVIEW_MAX_WIDTH = 360;

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
}) {
  const width = Math.max(24, Math.round(frame.width * zoom));
  const height = Math.max(24, Math.round(frame.height * zoom));
  const full = scroll || width > PREVIEW_MAX_WIDTH;
  const src = full ? image.url : (image.thumbnailUrl ?? image.url);
  return (
    <div
      role={scroll ? 'region' : undefined}
      aria-label={scroll ? (label ?? alt) : undefined}
      tabIndex={scroll ? 0 : undefined}
      className={cn(
        'relative shrink-0 overscroll-contain rounded-md bg-surface shadow-e1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        tone ? TONE_RING[tone] : 'ring-1 ring-border',
        scroll ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden',
        className,
      )}
      style={{ width, height }}
    >
      {image.available ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} className="block h-auto w-full" />
      ) : (
        <UnavailableImage image={image} />
      )}
    </div>
  );
}
