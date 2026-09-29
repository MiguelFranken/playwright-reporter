'use client';

import { useState } from 'react';
import { cn } from '../../lib/cn';
import type { ReviewImage } from '../../lib/review';
import { UnavailableImage } from './review-frame';

/**
 * How two images are put next to each other:
 * - `side-by-side`: both, in two columns.
 * - `slider`: one over the other, split at a handle you drag.
 * - `difference`: blended so identical pixels turn black and every change lights up.
 * - `onion`: the new image faded over the old one.
 */
export const COMPARE_MODES = ['side-by-side', 'slider', 'difference', 'onion'] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export const COMPARE_MODE_LABELS: Record<CompareMode, string> = {
  'side-by-side': 'Side by side',
  slider: 'Slider',
  difference: 'Difference',
  onion: 'Overlay',
};

function Picture({ image, alt, className, style }: { image: ReviewImage; alt: string; className?: string; style?: React.CSSProperties }) {
  if (!image.available) return <UnavailableImage image={image} className={cn('min-h-48 rounded-md border', className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.url} alt={alt} className={cn('block h-auto w-full', className)} style={style} draggable={false} />;
}

/**
 * The capture under review against a reference — the approved baseline or the
 * run before. Pure CSS: the difference mode is a `mix-blend-mode`, so no pixel
 * is read back and it works on any image the browser can show.
 */
export function ImageCompare({
  current,
  reference,
  mode,
  currentLabel = 'This run',
  referenceLabel = 'Baseline',
  alt,
}: {
  current: ReviewImage;
  reference: ReviewImage;
  mode: CompareMode;
  currentLabel?: string;
  referenceLabel?: string;
  alt: string;
}) {
  const [position, setPosition] = useState(50);
  const [opacity, setOpacity] = useState(50);

  if (mode === 'side-by-side') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { label: referenceLabel, image: reference },
          { label: currentLabel, image: current },
        ].map((side) => (
          <figure key={side.label} className="flex min-w-0 flex-col gap-1.5">
            <figcaption className="text-label-s text-muted-foreground">{side.label}</figcaption>
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <Picture image={side.image} alt={`${alt} — ${side.label}`} />
            </div>
          </figure>
        ))}
      </div>
    );
  }

  if (!current.available || !reference.available) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Picture image={reference} alt={`${alt} — ${referenceLabel}`} />
        <Picture image={current} alt={`${alt} — ${currentLabel}`} />
      </div>
    );
  }

  const control =
    mode === 'slider' ? (
      <label className="flex items-center gap-3 text-label-s text-muted-foreground">
        <span className="shrink-0">{referenceLabel}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label="Split position"
          className="w-full accent-[var(--accent-solid)]"
        />
        <span className="shrink-0">{currentLabel}</span>
      </label>
    ) : mode === 'onion' ? (
      <label className="flex items-center gap-3 text-label-s text-muted-foreground">
        <span className="shrink-0">{referenceLabel}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          aria-label="Opacity of this run's image"
          className="w-full accent-[var(--accent-solid)]"
        />
        <span className="shrink-0">{currentLabel}</span>
      </label>
    ) : (
      <p className="text-label-s text-muted-foreground">Identical pixels are black; everything that changed lights up.</p>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 rounded-md bg-background/90 py-1 backdrop-blur">{control}</div>
      <div className={cn('relative overflow-hidden rounded-md border border-border', mode === 'difference' ? 'bg-black' : 'bg-surface')}>
        <Picture image={reference} alt={`${alt} — ${referenceLabel}`} />
        <div
          className="absolute inset-0"
          style={
            mode === 'slider'
              ? { clipPath: `inset(0 0 0 ${position}%)` }
              : mode === 'onion'
                ? { opacity: opacity / 100 }
                : { mixBlendMode: 'difference' }
          }
        >
          <Picture image={current} alt={`${alt} — ${currentLabel}`} />
        </div>
        {mode === 'slider' ? <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent-solid shadow-e2" style={{ left: `${position}%` }} /> : null}
      </div>
    </div>
  );
}
