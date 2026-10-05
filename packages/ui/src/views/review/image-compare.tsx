'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Slider } from '../../components/slider';
import { GLIDE_MS, useGlide } from '../../hooks/use-glide';
import { cn } from '../../lib/cn';
import type { ReviewImage } from '../../lib/review';
import { UnavailableImage } from './review-frame';
import { ScaledLayer } from './screen-frame';

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
  scaled,
  overlay,
}: {
  current: ReviewImage;
  reference: ReviewImage;
  mode: CompareMode;
  currentLabel?: string;
  referenceLabel?: string;
  alt: string;
  /** Lays the images out at `width` CSS pixels and scales them by `zoom`, so a zoom changing lays nothing out: see `ScaledLayer`. */
  scaled?: { width: number; zoom: string };
  /** Drawn over the images where they lie one on the other (marks in this run's pixels): slider, onion, difference. */
  overlay?: ReactNode;
}) {
  const [opacity, setOpacity] = useState(50);
  const layer = scaledLayer(scaled, reference.width && reference.height ? reference : current);

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

  if (mode === 'slider') return <SplitCompare current={current} reference={reference} currentLabel={currentLabel} referenceLabel={referenceLabel} alt={alt} layer={layer} overlay={overlay} />;

  const control =
    mode === 'onion' ? (
      <label className="flex items-center gap-3 text-label-s text-muted-foreground">
        <span className="shrink-0">{referenceLabel}</span>
        <Slider min={0} max={100} value={opacity} onValueChange={(v) => setOpacity(Array.isArray(v) ? v[0] : v)} thumbLabel="Opacity of this run's image" valueText={(v) => `${v}% opaque`} />
        <span className="shrink-0">{currentLabel}</span>
      </label>
    ) : (
      <p className="text-label-s text-muted-foreground">Identical pixels are black; everything that changed lights up.</p>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 rounded-md bg-background/90 py-1 backdrop-blur">{control}</div>
      <div className={cn('relative overflow-hidden rounded-md border border-border', mode === 'difference' ? 'bg-black' : 'bg-surface')}>
        {layer(
          <>
            <Picture image={reference} alt={`${alt} — ${referenceLabel}`} />
            <div
              className="absolute inset-0"
              style={mode === 'onion' ? { opacity: opacity / 100 } : { mixBlendMode: 'difference' }}
            >
              <Picture image={current} alt={`${alt} — ${currentLabel}`} />
            </div>
            {overlay}
          </>,
        )}
      </div>
    </div>
  );
}

/** Wraps the images in a `ScaledLayer` of `shape`'s proportions when asked to and the shape is known; as they are otherwise. */
function scaledLayer(scaled: { width: number; zoom: string } | undefined, shape: ReviewImage): (children: ReactNode) => ReactNode {
  if (!scaled || !shape.width || !shape.height) return (children) => children;
  const aspect = { width: shape.width, height: shape.height };
  return (children) => (
    <ScaledLayer width={scaled.width} zoom={scaled.zoom} aspect={aspect}>
      {children}
    </ScaledLayer>
  );
}

/** Arrow keys move the split by 1%, with Shift by 10%; Page Up/Down by 10%. */
const SPLIT_KEYS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
const clampSplit = (v: number) => Math.min(100, Math.max(0, v));

/**
 * The reference with this run's image over it, split at a line you drag —
 * anywhere on the images, or the line's handle with the keyboard. The labels
 * and the handle stay in view while a tall capture scrolls. The split
 * eases toward the pointer in one `requestAnimationFrame` loop (`useGlide`)
 * that writes a CSS variable, so dragging renders nothing; the handle's value
 * is rendered once the split comes to rest.
 */
function SplitCompare({ current, reference, currentLabel, referenceLabel, alt, layer, overlay }: { current: ReviewImage; reference: ReviewImage; currentLabel: string; referenceLabel: string; alt: string; layer: (children: ReactNode) => ReactNode; overlay?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // The split at rest, for the handle's value; the CSS variable carries it while it moves.
  const [split, setSplit] = useState(50);
  const glide = useGlide(50, { onFrame: (x) => root.current?.style.setProperty('--split', `${x}%`), onRest: setSplit, epsilon: 0.05 });
  const at = (clientX: number) => {
    const r = root.current!.getBoundingClientRect();
    return clampSplit(((clientX - r.left) / r.width) * 100);
  };
  const end = (e: React.PointerEvent) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={root}
      data-slot="compare-surface"
      className="relative cursor-ew-resize touch-pan-y overflow-clip rounded-md border border-border bg-surface select-none"
      style={{ '--split': `${split}%` } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        glide.to(at(e.clientX), GLIDE_MS.jump);
      }}
      onPointerMove={(e) => {
        if (dragging.current) glide.to(at(e.clientX), GLIDE_MS.drag);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* Stays in view while the images scroll under it: which side is which, and the handle. */}
      <div className="pointer-events-none sticky top-0 z-10 h-0">
        <span aria-hidden className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/85 px-1.5 py-0.5 text-label-xs text-muted-foreground shadow-e1 backdrop-blur">
          {referenceLabel}
        </span>
        <span aria-hidden className="pointer-events-none absolute top-2 right-2 rounded-md bg-background/85 px-1.5 py-0.5 text-label-xs text-muted-foreground shadow-e1 backdrop-blur">
          {currentLabel}
        </span>
        <div
          role="slider"
          tabIndex={0}
          data-slot="compare-split"
          aria-label="Split position"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split)}
          aria-valuetext={`${Math.round(split)}% ${referenceLabel}, ${100 - Math.round(split)}% ${currentLabel}`}
          className="pointer-events-auto absolute top-10 left-(--split) flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-accent-border bg-background text-accent-text shadow-e2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          onKeyDown={(e) => {
            const n = SPLIT_KEYS[e.key];
            const to = e.key === 'Home' ? 0 : e.key === 'End' ? 100 : n ? clampSplit(Math.round(glide.target() + n * (e.shiftKey && Math.abs(n) === 1 ? 10 : 1))) : null;
            if (to === null) return;
            e.preventDefault();
            glide.to(to, GLIDE_MS.jump);
          }}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
            <path d="M6 4 2 8l4 4zM10 4l4 4-4 4z" />
          </svg>
        </div>
      </div>
      {layer(
        <>
          <Picture image={reference} alt={`${alt} — ${referenceLabel}`} />
          <div className="absolute inset-0 [clip-path:inset(0_0_0_var(--split))]">
            <Picture image={current} alt={`${alt} — ${currentLabel}`} />
          </div>
          {overlay}
        </>,
      )}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-(--split) w-0.5 -translate-x-1/2 bg-accent-solid shadow-e2" />
    </div>
  );
}
