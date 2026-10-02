'use client';

import { useRef, useState } from 'react';
import { cn } from '../../lib/cn';

/** How far an arrow key moves the edge; with Shift, four times as far. */
const KEY_STEP = 16;

export interface PanelResizerProps {
  /** The panel's width in pixels. */
  width: number;
  min: number;
  max: number;
  /** Where a double click (or Enter) puts it back. */
  defaultWidth: number;
  /** While dragging, on every move. */
  onResize: (width: number) => void;
  /** Once a drag or a key press has settled on a width: what to keep. */
  onResizeEnd: (width: number) => void;
  /** Its accessible name: what it resizes. */
  label: string;
  className?: string;
}

/**
 * The edge on the left of a side panel, dragged to make it wider or
 * narrower: a hairline that thickens on hover, a separator a keyboard can
 * move with the arrow keys (Home and End for the limits), and a double click
 * that puts the default width back.
 */
export function PanelResizer({ width, min, max, defaultWidth, onResize, onResizeEnd, label, className }: PanelResizerProps) {
  const [dragging, setDragging] = useState(false);
  const last = useRef(width);
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)));
  const settle = (n: number) => {
    const next = clamp(n);
    last.current = next;
    onResize(next);
    onResizeEnd(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    const start = { x: e.clientX, width };
    last.current = width;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser does not track (a synthetic one) cannot be captured.
    }
    setDragging(true);
    // The panel is on the right: dragging its edge left widens it.
    const move = (ev: PointerEvent) => {
      last.current = clamp(start.width - (ev.clientX - start.x));
      onResize(last.current);
    };
    const end = () => {
      setDragging(false);
      onResizeEnd(last.current);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const to: Record<string, number> = { ArrowLeft: width + step, ArrowRight: width - step, Home: min, End: max, Enter: defaultWidth };
    if (!(e.key in to)) return;
    e.preventDefault();
    e.stopPropagation();
    settle(to[e.key]);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onDoubleClick={() => settle(defaultWidth)}
      onKeyDown={onKeyDown}
      className={cn(
        'group/resizer absolute inset-y-0 -left-1.5 z-20 flex w-3 cursor-col-resize touch-none justify-center outline-none',
        // While dragging, the whole page shows the resize cursor and selects nothing.
        dragging && 'select-none',
        className,
      )}
    >
      <span
        aria-hidden
        className="h-full w-px bg-transparent transition-[background-color,width] duration-150 group-hover/resizer:w-0.5 group-hover/resizer:bg-accent-solid group-focus-visible/resizer:w-0.5 group-focus-visible/resizer:bg-accent-solid group-data-dragging/resizer:w-0.5 group-data-dragging/resizer:bg-accent-solid"
      />
    </div>
  );
}
