'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/button';
import { cn } from '../../lib/cn';
import type { DiffRegion, FrameSize, ReviewImage } from '../../lib/review';
import { DiffMarks } from './diff-summary';
import { UnavailableImage } from './review-frame';

export type IgnoreRect = Pick<DiffRegion, 'x' | 'y' | 'width' | 'height'>;

/** Smaller than this (image pixels) is a click, not a rectangle. */
const MIN_SIDE = 4;
export const MAX_IGNORE_REGIONS = 20;

/**
 * Areas of a checkpoint's image to leave out of its comparisons — a clock, a
 * carousel, a generated id. Drag on the image to draw one; the list below
 * removes them. Saving measures the checkpoint's images again without them.
 * Coordinates are the image's own pixels, whatever the zoom.
 */
export function IgnoreRegionsEditor({
  image,
  imageSize,
  frame,
  zoom,
  alt,
  value,
  onSave,
  onCancel,
  pending = false,
}: {
  image: ReviewImage;
  imageSize: { width: number; height: number };
  frame: FrameSize;
  zoom: number;
  alt: string;
  value: readonly IgnoreRect[];
  onSave: (regions: IgnoreRect[]) => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const [rects, setRects] = useState<IgnoreRect[]>(() => [...value]);
  const [draft, setDraft] = useState<IgnoreRect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => setRects([...value]), [value]);

  const width = Math.max(24, Math.round(frame.width * zoom));
  const height = Math.max(24, Math.round(frame.height * zoom));
  const toImage = (e: React.PointerEvent) => {
    const box = surface.current!.getBoundingClientRect();
    const x = Math.min(imageSize.width, Math.max(0, ((e.clientX - box.left) / box.width) * imageSize.width));
    const y = Math.min(imageSize.height, Math.max(0, ((e.clientY - box.top) / box.height) * imageSize.height));
    return { x, y };
  };
  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): IgnoreRect => ({
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    width: Math.round(Math.abs(a.x - b.x)),
    height: Math.round(Math.abs(a.y - b.y)),
  });
  const full = rects.length >= MAX_IGNORE_REGIONS;
  const changed = JSON.stringify(rects) !== JSON.stringify(value);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-label-s text-muted-foreground" id="ignore-help">
        {full ? `At most ${MAX_IGNORE_REGIONS} areas.` : 'Drag on the image to leave an area out of the comparison.'}
      </p>
      <div
        role="region"
        aria-label={`${alt}, areas left out`}
        aria-describedby="ignore-help"
        tabIndex={0}
        className="relative shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md bg-surface shadow-e1 ring-1 ring-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        style={{ width, height }}
      >
        {image.available ? (
          <div
            ref={surface}
            className={cn('relative touch-none select-none', full ? 'cursor-not-allowed' : 'cursor-crosshair')}
            onPointerDown={(e) => {
              if (full || e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              start.current = toImage(e);
              setDraft(null);
            }}
            onPointerMove={(e) => start.current && setDraft(rectFrom(start.current, toImage(e)))}
            onPointerUp={(e) => {
              if (!start.current) return;
              const r = rectFrom(start.current, toImage(e));
              start.current = null;
              setDraft(null);
              if (r.width >= MIN_SIDE && r.height >= MIN_SIDE) setRects((list) => [...list, r]);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={alt} draggable={false} className="block h-auto w-full" />
            <DiffMarks regions={draft ? [...rects, draft] : rects} width={imageSize.width} height={imageSize.height} kind="ignore" />
          </div>
        ) : (
          <UnavailableImage image={image} />
        )}
      </div>
      <div className="flex w-full max-w-md flex-col gap-2">
        {rects.length ? (
          <ol className="flex flex-col gap-1 text-sm" aria-label="Areas left out">
            {rects.map((r, i) => (
              <li key={`${r.x}-${r.y}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-2 py-1">
                <span className="tabular-nums">
                  {r.width} × {r.height} px at {r.x}, {r.y}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove area ${i + 1}`} onClick={() => setRects((list) => list.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing is left out yet.</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!changed || pending} onClick={() => onSave(rects)}>
            {pending ? 'Saving…' : 'Save and measure again'}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
