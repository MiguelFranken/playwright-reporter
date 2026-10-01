'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { FrameSize, ReviewDiffView, ReviewImage } from '../../lib/review';
import { DiffMarks } from './diff-summary';
import { UnavailableImage } from './review-frame';

/** The image's own size: what the diff measured, else what the capture recorded. */
export function diffImageSize(image: ReviewImage, diff: ReviewDiffView): { width: number; height: number } | null {
  if (diff.head) return diff.head;
  return image.width && image.height ? { width: image.width, height: image.height } : null;
}

/**
 * This run's image with its changes marked: the changed pixels in red over
 * it, a numbered box around each changed region, and — for a page taller
 * than the screen — a strip beside it that shows where on the page the
 * changes are. Selecting a region (a box, a mark on the strip, or the
 * viewer's pager) scrolls it into view.
 */
export function DiffHighlight({
  image,
  diff,
  frame,
  zoom,
  alt,
  active,
  onActiveChange,
  overlay = true,
  minimapLabel,
  children,
  className,
}: {
  image: ReviewImage;
  diff: ReviewDiffView;
  frame: FrameSize;
  zoom: number;
  alt: string;
  active: number | null;
  onActiveChange: (index: number) => void;
  /** Paint the changed pixels; the boxes stay either way. */
  overlay?: boolean;
  /** The name of the strip beside a long screen, when several screens are shown. */
  minimapLabel?: string;
  /** More over the image, scrolling with it: comment pins. */
  children?: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const size = diffImageSize(image, diff);
  const width = Math.max(24, Math.round(frame.width * zoom));
  const height = Math.max(24, Math.round(frame.height * zoom));
  const shownHeight = size ? (width * size.height) / size.width : height;
  const tall = shownHeight > height + 1;

  useEffect(() => {
    const el = scroller.current;
    const region = active != null ? diff.regions[active] : null;
    if (!el || !region || !size) return;
    const top = (region.y / size.height) * el.scrollHeight;
    const bottom = ((region.y + region.height) / size.height) * el.scrollHeight;
    if (top >= el.scrollTop && bottom <= el.scrollTop + el.clientHeight) return;
    el.scrollTo({ top: Math.max(0, top - el.clientHeight / 3), behavior: 'smooth' });
  }, [active, diff.regions, size]);

  return (
    <div className={cn('flex items-start gap-2', className)}>
      <div
        ref={scroller}
        data-slot="diff-highlight"
        role="region"
        aria-label={`${alt}, changes marked`}
        tabIndex={0}
        className="relative shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md bg-surface shadow-e1 ring-1 ring-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        style={{ width, height }}
      >
        {image.available ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={alt} decoding="async" draggable={false} className="block h-auto w-full" />
            {overlay && diff.overlayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={diff.overlayUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 block h-full w-full opacity-80" />
            ) : null}
            {size ? <DiffMarks regions={diff.regions} width={size.width} height={size.height} active={active} numbered onSelect={onActiveChange} /> : null}
            {children}
          </div>
        ) : (
          <UnavailableImage image={image} />
        )}
      </div>
      {tall && size ? <ChangeMinimap diff={diff} imageHeight={size.height} height={height} active={active} onSelect={onActiveChange} label={minimapLabel} /> : null}
    </div>
  );
}

/**
 * Where on a long page the changes are: a strip as tall as the screen, a
 * mark per changed region at its place on the page, and the bands content
 * was inserted into when it moved.
 */
export function ChangeMinimap({
  diff,
  imageHeight,
  height,
  active,
  onSelect,
  label = 'Where the changes are',
}: {
  diff: ReviewDiffView;
  imageHeight: number;
  height: number;
  active: number | null;
  onSelect: (index: number) => void;
  /** Its name, distinct for each of several screens. */
  label?: string;
}) {
  const pct = (y: number) => `${(y / imageHeight) * 100}%`;
  return (
    <nav aria-label={label} className="relative w-3 shrink-0 rounded-full bg-surface-sunken ring-1 ring-border" style={{ height }}>
      {diff.shift?.inserted.map((b, i) => (
        <span key={`band-${i}`} aria-hidden className="absolute inset-x-0 bg-info-solid/40" style={{ top: pct(b.y), height: `max(2px, ${pct(b.height)})` }} />
      ))}
      {diff.regions.map((r, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Change ${i + 1} of ${diff.regions.length}`}
          aria-current={active === i ? 'true' : undefined}
          onClick={() => onSelect(i)}
          className={cn(
            'absolute inset-x-0 min-h-1 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
            active === i ? 'bg-danger-text' : 'bg-danger-solid/70 hover:bg-danger-solid',
          )}
          style={{ top: pct(r.y), height: `max(4px, ${pct(r.height)})` }}
        />
      ))}
    </nav>
  );
}
