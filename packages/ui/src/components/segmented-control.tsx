'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * A segmented control: one track, one thumb that travels between segments.
 *
 * The thumb is a single absolutely-positioned element driven entirely by the
 * `translate` and `width` properties — no Tailwind transform utilities, because
 * in Tailwind 4 those compile to `translate` too and would fight the inline
 * value. Both the thumb and the segments are laid out from the track's padding
 * box, so `offsetLeft`/`offsetTop` and `left: 0; top: 0` share one origin.
 *
 * Radii are concentric: inner = outer − track padding.
 */

type Size = 'sm' | 'default';

const SIZES: Record<Size, { pad: number; track: string; item: string; thumb: string }> = {
  // 10px outer − 2px padding = 8px inner.
  sm: { pad: 2, track: 'h-9 rounded-[10px] p-0.5', item: 'px-3 text-label-s', thumb: 'rounded-[8px]' },
  // 14px outer − 4px padding = 10px inner.
  default: { pad: 4, track: 'h-11 rounded-[14px] p-1', item: 'px-3.5 text-label-m', thumb: 'rounded-[10px]' },
};

export interface SegmentedItem {
  value: string;
  label: React.ReactNode;
  'aria-label'?: string;
}

export function SegmentedControl({
  value,
  onValueChange,
  items,
  size = 'sm',
  className,
  ...props
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: SegmentedItem[];
  size?: Size;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'onChange'>) {
  const s = SIZES[size];
  const trackRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [thumb, setThumb] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // The thumb must not fly in from the origin on first paint: it is placed
  // without a transition, and every later move animates. A ref read during
  // render (flipped in a layout effect after the first paint) is used rather
  // than state or rAF, so a throttled background tab cannot skip the flag.
  const placed = React.useRef(false);

  const measure = React.useCallback(() => {
    const track = trackRef.current;
    const active = itemRefs.current.get(value);
    if (!track || !active) return;
    // Rects rather than offsetLeft/offsetWidth: those round to whole pixels and
    // leave the thumb a fraction wider than the segment it sits on.
    const style = getComputedStyle(track);
    const trackBox = track.getBoundingClientRect();
    const itemBox = active.getBoundingClientRect();
    const next = {
      x: itemBox.left - trackBox.left - parseFloat(style.borderLeftWidth),
      y: itemBox.top - trackBox.top - parseFloat(style.borderTopWidth),
      w: itemBox.width,
      h: itemBox.height,
    };
    setThumb((prev) =>
      prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next,
    );
  }, [value]);

  React.useLayoutEffect(measure, [measure, items.length]);

  React.useLayoutEffect(() => {
    if (thumb) placed.current = true;
  });

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    for (const el of itemRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const move = (delta: number) => {
    const i = items.findIndex((item) => item.value === value);
    const next = items[(i + delta + items.length) % items.length];
    if (!next) return;
    onValueChange(next.value);
    itemRefs.current.get(next.value)?.focus();
  };

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      className={cn(
        'relative isolate inline-flex w-fit shrink-0 items-stretch border border-border bg-surface-sunken',
        s.track,
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
      {...props}
    >
      {thumb ? (
        <span
          aria-hidden
          className={cn('pointer-events-none absolute top-0 left-0 border border-border/70 bg-surface shadow-xs', s.thumb)}
          style={{
            translate: `${thumb.x}px ${thumb.y}px`,
            width: `${thumb.w}px`,
            height: `${thumb.h}px`,
            // Named inline rather than via a utility class: only these three
            // properties animate, and a CSS transition stays interruptible when
            // the selection changes mid-travel.
            transitionProperty: placed.current ? 'translate, width, height' : 'none',
            transitionDuration: '200ms',
            transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
          }}
        />
      ) : null}

      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={item['aria-label']}
            tabIndex={active ? 0 : -1}
            ref={(el) => {
              if (el) itemRefs.current.set(item.value, el);
              else itemRefs.current.delete(item.value);
            }}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'relative z-10 inline-flex shrink-0 items-center justify-center whitespace-nowrap outline-none',
              'transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
              'focus-visible:ring-[3px] focus-visible:ring-ring/25',
              s.thumb,
              s.item,
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
