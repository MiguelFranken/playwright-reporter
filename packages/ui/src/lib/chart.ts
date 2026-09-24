/**
 * The chart system's vocabulary: geometry, chrome and series identity in one
 * place, so every chart in the product is the same chart with different data.
 *
 * Layer 0 — no JSX and no `recharts` import, so server code can read the series
 * definitions (a query that produces a series can name it) without pulling a
 * charting library into the bundle.
 *
 * The three rules the numbers below encode:
 *
 *   1. Chrome recedes. Axes draw no line, the grid is horizontal only and one
 *      step off the surface, tick text is small and muted. Ink belongs to marks.
 *   2. White does the separating. Touching marks — the segments of a stack, two
 *      adjacent bars, a dot crossing its line — are parted by a 2px gap or ring
 *      in the *surface* colour, never by a stroke drawn around the mark.
 *   3. Marks stay thin. A bar is capped well under its slot so the band keeps
 *      its air; a line is 2px; a marker is at least 8px across so it can be hit.
 */

/** Horizontal rules only: vertical ones fight the bars they sit behind. */
export const CHART_GRID = {
  vertical: false,
  stroke: 'var(--chart-grid)',
  strokeDasharray: undefined,
} as const;

/** No axis line, no tick line — the labels are the axis. */
export const CHART_AXIS = {
  tickLine: false,
  axisLine: false,
  tickMargin: 10,
  minTickGap: 24,
  fontSize: 11,
  stroke: 'var(--chart-axis)',
} as const;

/** The hover band behind a bar, and the crosshair on a line. */
export const CHART_CURSOR = {
  bar: { fill: 'var(--chart-cursor)', radius: 6 },
  line: { stroke: 'var(--chart-axis)', strokeWidth: 1, strokeOpacity: 0.5 },
} as const;

export const CHART_MARK = {
  barCategoryGap: '30%',
  /** The rounded data-end. Square where it meets the baseline. */
  radius: 4,
  /** The surface-coloured spacer between touching marks. */
  gap: 2,
  lineWidth: 2,
  /** Diameter, not radius: a target smaller than this cannot be hit. */
  dotSize: 8,
  /** An area wash, never a saturated block. */
  areaOpacity: { top: 0.12, bottom: 0 },
} as const;

/**
 * A bar's width has to follow how many of them there are.
 *
 * A fixed cap is what makes a chart look broken: ten runs across a full-width
 * card give each one a ~190px band, and a 22px bar in it reads as a stick
 * floating in an empty room. Thirty runs in the same card need the opposite.
 * The band is the constraint, so the cap scales with the count and Recharts
 * takes whichever is smaller.
 */
export function barSizeFor(count: number): number {
  if (count <= 6) return 56;
  if (count <= 10) return 44;
  if (count <= 16) return 34;
  if (count <= 26) return 26;
  return 18;
}

/** A fat bar takes a bigger corner; a thin one would swallow its own end. */
export function barRadiusFor(size: number): number {
  return size >= 40 ? 8 : size >= 26 ? 6 : 4;
}

/**
 * Plot insets. Small and symmetric: the axis labels live inside the Y axis's own
 * width, so pulling the plot left with a negative inset only clips them.
 */
export const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 } as const;

/** The same, with room at the right edge for a direct label on the last point. */
export const CHART_MARGIN_LABELLED = { top: 16, right: 48, left: 0, bottom: 0 } as const;

/** Four rules across the plot. More is chrome; fewer stops being a scale. */
export const CHART_TICK_COUNT = 4;

/**
 * Ticks a reader can do arithmetic with.
 *
 * Asked for four ticks between 80 and 100, Recharts obliges with 80, 86.67,
 * 93.33, 100. An axis exists to be read off, so the step is rounded to a 1-2-5
 * multiple first and the ticks are handed over explicitly.
 */
export function niceTicks(min: number, max: number, count = CHART_TICK_COUNT): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rough = span / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step / 1000; t += step) {
    ticks.push(Math.round(t * 1000) / 1000);
  }
  return ticks;
}

/** Enough for a compacted tick ("12.9K") at 11px, and no wider. */
export const CHART_Y_WIDTH = 44;

/* ---------------------------------------------------------------------------
 * Series identity.
 *
 * These are *status* colours, not categorical slots: green means passed
 * everywhere in the product, so a bar and the badge beside it always agree.
 * Reserved palettes come with obligations, and this system meets all of them —
 * a legend is always present, the stack carries direct totals, and every chart
 * has a table view, which is what covers "skipped" reading as an inert grey and
 * "flaky" amber sitting under 3:1 against a white card.
 * ------------------------------------------------------------------------ */

export type OutcomeKey = 'passed' | 'flaky' | 'failed' | 'skipped';

export interface SeriesDef {
  key: OutcomeKey;
  label: string;
  /** The CSS variable the mark is filled with. */
  color: string;
}

/**
 * Stacking order, bottom to top: the good news sits on the baseline where it is
 * easiest to compare across runs, the bad news rides on top where a change in
 * it is what the eye catches, and "skipped" — which is not an outcome so much as
 * an absence — caps the stack.
 */
export const OUTCOME_SERIES: readonly SeriesDef[] = [
  { key: 'passed', label: 'Passed', color: 'var(--success-solid)' },
  { key: 'flaky', label: 'Flaky', color: 'var(--warning-solid)' },
  { key: 'failed', label: 'Failed', color: 'var(--danger-solid)' },
  { key: 'skipped', label: 'Skipped', color: 'var(--neutral-solid)' },
] as const;

export const SERIES_ORDER: readonly OutcomeKey[] = OUTCOME_SERIES.map((s) => s.key);

/* ---------------------------------------------------------------------------
 * Number shapes charts need.
 * ------------------------------------------------------------------------ */

/** 1,284 · 12.9K · 4.2M — axis ticks and headline values stay one token wide. */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1_000) return String(n);
  if (abs < 1_000_000) return `${trim(n / 1_000)}K`;
  return `${trim(n / 1_000_000)}M`;
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export interface Delta {
  /** Signed difference in the value's own unit. */
  value: number;
  /** Whether the movement is a good thing, once the metric's polarity is known. */
  direction: 'up' | 'down' | 'flat';
}

/**
 * The change between the first and second half of a window — the comparison a
 * headline number needs when there is no explicit previous period to read.
 * `null` when either half has nothing in it to average.
 */
export function halfOverHalf(values: readonly number[]): Delta | null {
  if (values.length < 4) return null;
  const mid = Math.floor(values.length / 2);
  const older = mean(values.slice(0, mid));
  const newer = mean(values.slice(mid));
  if (older === null || newer === null) return null;
  const value = newer - older;
  return { value, direction: Math.abs(value) < 0.05 ? 'flat' : value > 0 ? 'up' : 'down' };
}

function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
