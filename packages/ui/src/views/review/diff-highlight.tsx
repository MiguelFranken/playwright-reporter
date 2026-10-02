'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../components/hover-card';
import { liveHeight, liveWidth, ScaledLayer, SCREEN_ZOOM_VAR } from './screen-frame';
import { cn } from '../../lib/cn';
import type { DiffRegion, FrameSize, ReviewDiffView, ReviewImage } from '../../lib/review';
import { closeUpWindow, type ImageSize } from '../../lib/review-threads';
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
 * viewer's pager) scrolls it into view; hovering a mark on the strip shows
 * a close-up of it first.
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
  live = false,
  room = false,
  minimapLabel,
  children,
  className,
}: {
  image: ReviewImage;
  diff: ReviewDiffView;
  frame: FrameSize;
  zoom: number;
  alt: string;
  /** Sized by CSS from the viewer's stage (`SCREEN_ZOOM_VAR`), `zoom` otherwise; see `ScreenFrame`. */
  live?: boolean;
  /** Live, as tall as the room the stage gives it, whatever the zoom. */
  room?: boolean;
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
  const box = live ? { width: liveWidth(frame.width, zoom), height: liveHeight(frame.height, zoom, room) } : { width, height };
  // The images are laid out once, at the frame's width, and scaled to the zoom: see `MOVING_ATTR` in `screen-frame`.
  const scale = live ? `var(${SCREEN_ZOOM_VAR}, ${zoom})` : `${zoom}`;
  const images = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt={alt} decoding="async" draggable={false} className="block h-auto w-full" />
      {overlay && diff.overlayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={diff.overlayUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 block h-full w-full opacity-80" />
      ) : null}
    </>
  );

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
        style={box}
      >
        {image.available ? (
          <div className="relative">
            {size ? (
              <ScaledLayer width={frame.width} zoom={scale} aspect={size}>
                {images}
              </ScaledLayer>
            ) : (
              images
            )}
            {size ? <DiffMarks regions={diff.regions} width={size.width} height={size.height} active={active} numbered onSelect={onActiveChange} /> : null}
            {children}
          </div>
        ) : (
          <UnavailableImage image={image} />
        )}
      </div>
      {tall && size ? <ChangeMinimap diff={diff} image={image} imageSize={size} height={box.height} active={active} onSelect={onActiveChange} label={minimapLabel} /> : null}
    </div>
  );
}

/**
 * Where on a long page the changes are: a strip as tall as the screen, a
 * mark per changed region at its place on the page, and the bands content
 * was inserted into when it moved. Hovering (or focusing) a mark grows it
 * and shows a close-up of that change beside the strip, so a reviewer can
 * tell what changed before scrolling there.
 */
export function ChangeMinimap({
  diff,
  image,
  imageSize,
  height,
  active,
  onSelect,
  label = 'Where the changes are',
}: {
  diff: ReviewDiffView;
  /** This run's image, for the close-ups; without it the marks only scroll. */
  image?: ReviewImage;
  imageSize: ImageSize;
  /** As tall as the screen beside it: pixels, or the CSS length that sizes it. */
  height: number | string;
  active: number | null;
  onSelect: (index: number) => void;
  /** Its name, distinct for each of several screens. */
  label?: string;
}) {
  const pct = (y: number) => `${(y / imageSize.height) * 100}%`;
  const closeUps = image?.available ?? false;
  return (
    <nav aria-label={label} className="relative w-3 shrink-0 rounded-full bg-surface-sunken ring-1 ring-border" style={{ height }}>
      {diff.shift?.inserted.map((b, i) => (
        <span key={`band-${i}`} aria-hidden className="absolute inset-x-0 bg-info-solid/40" style={{ top: pct(b.y), height: `max(2px, ${pct(b.height)})` }} />
      ))}
      {diff.regions.map((r, i) => {
        const label = `Change ${i + 1} of ${diff.regions.length}`;
        const mark = (
          <button
            key={i}
            type="button"
            aria-label={label}
            aria-current={active === i ? 'true' : undefined}
            onClick={() => onSelect(i)}
            className={cn(
              // The hit area reaches past the thin mark; hovering grows the mark itself, so it reads as clickable.
              'absolute inset-x-0 min-h-1 rounded-full outline-none transition-[left,right,min-height,background-color,box-shadow] duration-150 ease-out',
              'before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[""]',
              'hover:-inset-x-1 hover:min-h-2 hover:shadow-e1 focus-visible:-inset-x-1 focus-visible:ring-[3px] focus-visible:ring-ring/40 data-popup-open:-inset-x-1 data-popup-open:min-h-2 data-popup-open:shadow-e1',
              'motion-reduce:transition-none',
              active === i ? 'bg-danger-text' : 'bg-danger-solid/70 hover:bg-danger-solid data-popup-open:bg-danger-solid',
            )}
            style={{ top: pct(r.y), height: `max(4px, ${pct(r.height)})` }}
          />
        );
        if (!closeUps || !image) return mark;
        return (
          <HoverCard key={i}>
            <HoverCardTrigger delay={80} closeDelay={60} render={mark} />
            <HoverCardContent side="right" align="center" sideOffset={10} className="w-auto p-1.5">
              <ChangeCloseUp image={image} overlayUrl={diff.overlayUrl} imageSize={imageSize} region={r} alt={`Close-up of change ${i + 1}`} />
              <p className="px-1 pt-1.5 text-body-xs text-muted-foreground">
                {label} · {r.pixels.toLocaleString('en')} px
              </p>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </nav>
  );
}

/**
 * One changed region, magnified: the part of this run's image around it,
 * its changed pixels painted, and the region's box.
 */
export function ChangeCloseUp({
  image,
  overlayUrl,
  imageSize,
  region,
  width = 288,
  height = 180,
  alt,
}: {
  image: ReviewImage;
  overlayUrl?: string | null;
  imageSize: ImageSize;
  region: DiffRegion;
  /** The close-up's box, in CSS pixels. */
  width?: number;
  height?: number;
  alt: string;
}) {
  const box = { width, height };
  const anchor = { kind: 'area' as const, x: region.x / imageSize.width, y: region.y / imageSize.height, w: region.width / imageSize.width, h: region.height / imageSize.height };
  const view = closeUpWindow(anchor, imageSize, box, { maxScale: 2 });
  const placed = { width: imageSize.width * view.scale, height: imageSize.height * view.scale, transform: `translate(${-view.left * view.scale}px, ${-view.top * view.scale}px)` };
  // Just outside the region, so the box stays visible over the painted pixels.
  const frame = {
    left: (region.x - view.left) * view.scale - 3,
    top: (region.y - view.top) * view.scale - 3,
    width: region.width * view.scale + 6,
    height: region.height * view.scale + 6,
  };
  return (
    <div data-slot="change-close-up" className="relative shrink-0 overflow-hidden rounded-md bg-surface ring-1 ring-border" style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt={alt} decoding="async" draggable={false} className="absolute top-0 left-0 block max-w-none origin-top-left" style={placed} />
      {overlayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={overlayUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute top-0 left-0 block max-w-none origin-top-left opacity-80" style={placed} />
      ) : null}
      <div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-danger-solid" style={frame} />
    </div>
  );
}
