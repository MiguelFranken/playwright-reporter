'use client';

import { useState } from 'react';
import { cn } from '../../lib/cn';
import type { ReviewImage } from '../../lib/review';
import { closeUpWindow, type FractionAnchor, type ImageSize } from '../../lib/review-threads';
import type { MarkupShape } from '../../lib/review-markup';
import { CommentPin, type CommentPinState } from '../../patterns/comment-pin';
import { MarkupShapes } from '../../patterns/markup-shapes';
import { useImage } from '../../provider';
import { UnavailableImage } from './review-frame';

/**
 * The part of a screenshot a comment points at, magnified: the pin (or the
 * area) and enough of the page around it to see what it is about. Two of
 * them — the version commented on and the screen now — answer "was it
 * fixed?" without scrolling two full pages to the same spot.
 */
export function PinCloseUp({
  image,
  anchor,
  markup,
  number,
  state = 'open',
  width = 440,
  height = 280,
  alt,
  className,
}: {
  image: ReviewImage;
  /** Where the comment points, in fractions of this image. */
  anchor: FractionAnchor;
  /** What was drawn with the comment, in fractions of this image: drawn instead of the area. */
  markup?: readonly MarkupShape[] | null;
  number?: number;
  state?: CommentPinState;
  /** The close-up's box, in CSS pixels. */
  width?: number;
  height?: number;
  alt: string;
  className?: string;
}) {
  const Image = useImage();
  const known = image.width && image.height ? { width: image.width, height: image.height } : null;
  const [loaded, setLoaded] = useState<ImageSize | null>(null);
  const size = known ?? loaded;
  const box = { width, height };

  if (!image.available)
    return (
      <div className={cn('shrink-0 overflow-hidden rounded-md ring-1 ring-border', className)} style={box}>
        <UnavailableImage image={image} />
      </div>
    );

  const view = size && anchor.kind !== 'image' ? closeUpWindow(anchor, size, box) : null;
  const at = (fx: number, fy: number) => (view && size ? { left: (fx * size.width - view.left) * view.scale, top: (fy * size.height - view.top) * view.scale } : null);
  const pin = anchor.kind !== 'image' ? at(anchor.x, anchor.y) : null;
  const area = anchor.kind === 'area' && anchor.w != null && anchor.h != null && view && size ? { ...at(anchor.x, anchor.y)!, width: anchor.w * size.width * view.scale, height: anchor.h * size.height * view.scale } : null;

  return (
    <div data-slot="pin-close-up" className={cn('relative shrink-0 overflow-hidden rounded-md bg-surface shadow-e1 ring-1 ring-border', className)} style={box}>
      <Image
        src={image.url}
        alt={alt}
        width={known?.width}
        height={known?.height}
        sizes={`${Math.round(size && view ? size.width * view.scale : width)}px`}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (!known && img.naturalWidth) setLoaded({ width: img.naturalWidth, height: img.naturalHeight });
        }}
        className={cn('absolute top-0 left-0 max-w-none origin-top-left', !view && anchor.kind !== 'image' && 'opacity-0')}
        style={
          view && size
            ? { width: size.width * view.scale, height: size.height * view.scale, transform: `translate(${-view.left * view.scale}px, ${-view.top * view.scale}px)` }
            : { width: '100%', height: 'auto' }
        }
      />
      {markup?.length && view && size ? (
        <div aria-hidden className="pointer-events-none absolute" style={{ left: -view.left * view.scale, top: -view.top * view.scale, width: size.width * view.scale, height: size.height * view.scale }}>
          <MarkupShapes shapes={markup} dashed={state === 'outdated'} />
        </div>
      ) : area ? <div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-accent-solid bg-accent-solid/10" style={area} /> : null}
      {pin ? (
        <div aria-hidden className="pointer-events-none absolute -translate-y-full" style={pin}>
          <CommentPin number={number} state={state} tabIndex={-1} className="pointer-events-none animate-none" />
        </div>
      ) : null}
    </div>
  );
}
