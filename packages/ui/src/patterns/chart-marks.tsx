'use client';

import { CHART_MARK } from '../lib/chart';

/**
 * The marks themselves: the shapes Recharts cannot draw the way this system
 * wants them drawn.
 *
 * Recharts stacks bars edge to edge and rounds whichever segment you tell it to,
 * which produces a stack with a rounded seam in the middle of it and no space
 * between colours. Both rules the system cares about — *white does the
 * separating* and *only the data-end is round* — therefore need a custom shape.
 */

/** The row a stacked bar is drawn from: series key → value. */
type StackRow = Record<string, unknown>;

interface SegmentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: StackRow;
  /** The series this segment belongs to. */
  seriesKey?: string;
  /** Every series in the stack, bottom to top. */
  stackKeys?: readonly string[];
  /** The data-end's corner. Scales with the bar's width — see `barRadiusFor`. */
  radius?: number;
}

/**
 * One segment of a stacked bar.
 *
 * Only the top-most segment that actually has a value is rounded — the stack has
 * exactly one data-end, and it is wherever the data happens to stop. Every
 * segment above the baseline also gives back 2px of its own height, which is
 * what opens the surface-coloured gap under it. The gap is the separator; no
 * segment is ever stroked.
 */
export function StackSegment({
  x,
  y,
  width,
  height,
  fill,
  payload,
  seriesKey,
  stackKeys,
  radius = CHART_MARK.radius,
}: SegmentProps) {
  if (x === undefined || y === undefined || !width || !height || height <= 0) return null;

  const present = (stackKeys ?? []).filter((k) => Number(payload?.[k] ?? 0) > 0);
  const isBottom = present[0] === seriesKey;
  const isTop = present[present.length - 1] === seriesKey;

  // A segment sitting on another one loses 2px off its bottom edge, opening the
  // gap. The bottom segment keeps its full height so the stack stays anchored to
  // the baseline — a floating stack misreads as a range.
  const h = isBottom ? height : Math.max(height - CHART_MARK.gap, 1);
  const top = y;

  return <path d={isTop ? roundedTop(x, top, width, h, radius) : rect(x, top, width, h)} fill={fill} />;
}

/**
 * A single (unstacked) bar: square where it meets the baseline, rounded at the
 * data-end, whichever end that is.
 */
export function SoloBar({ x, y, width, height, fill, radius = CHART_MARK.radius }: SegmentProps) {
  if (x === undefined || y === undefined || !width || !height || height <= 0) return null;
  return <path d={roundedTop(x, y, width, height, radius)} fill={fill} />;
}

function rect(x: number, y: number, w: number, h: number): string {
  return `M${x},${y}h${w}v${h}h${-w}Z`;
}

function roundedTop(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h));
  return `M${x},${y + h}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h}Z`;
}

/**
 * The wash under an area line: the series hue fading to nothing. Rendered into
 * the chart's own `<defs>`; `id` has to be unique on the page, so derive it from
 * a `useId()` rather than hard-coding one.
 */
export function AreaGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={CHART_MARK.areaOpacity.top} />
      <stop offset="100%" stopColor={color} stopOpacity={CHART_MARK.areaOpacity.bottom} />
    </linearGradient>
  );
}

/**
 * The marker a line shows under the cursor: 8px across, ringed in the surface
 * colour so it stays legible wherever it lands. The ring is part of the hit
 * target, not decoration.
 */
export const ACTIVE_DOT = {
  r: CHART_MARK.dotSize / 2,
  strokeWidth: CHART_MARK.gap,
  stroke: 'var(--chart-surface)',
} as const;
