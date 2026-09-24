'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '../../components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../../components/chart';
import { SegmentedControl } from '../../components/segmented-control';
import { ChartDelta, ChartFrame, ChartLegendChips, ChartStats } from '../../patterns/chart-frame';
import { ACTIVE_DOT, AreaGradient, StackSegment } from '../../patterns/chart-marks';
import {
  CHART_AXIS,
  CHART_CURSOR,
  CHART_GRID,
  CHART_MARGIN,
  CHART_MARGIN_LABELLED,
  CHART_MARK,
  CHART_TICK_COUNT,
  niceTicks,
  CHART_Y_WIDTH,
  OUTCOME_SERIES,
  SERIES_ORDER,
  barRadiusFor,
  barSizeFor,
  compactNumber,
  halfOverHalf,
} from '../../lib/chart';
import { formatDateTime } from '../../lib/format';

export interface TrendDatum {
  runNumber: number;
  startedAt: string;
  status: string;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

/**
 * How the suite has behaved over its recent runs.
 *
 * The card leads with the pass rate, and so does the plot: the rate *is* the
 * question, and a line answers it in one glance where a stack of four colours
 * makes you do arithmetic first. The outcome counts are one click away, and the
 * strip under the headline carries the totals both views would otherwise have to
 * label — which is what lets each plot stay as quiet as it is.
 *
 * The table is not a fallback. It is the same data in the form that survives a
 * screen reader, a greyscale print and a colour-vision deficiency, and that is
 * what licenses the two series (amber flaky, grey skipped) that sit under 3:1
 * against a white card.
 */

/** A run, widened with the values the chart derives from it. */
interface TrendRow extends TrendDatum {
  /** The x-axis category: the run number, as a label. */
  label: string;
  /** Passed + failed + flaky — skipped tests never ran, so they are not a denominator. */
  executed: number;
  passRate: number;
}

const outcomeConfig = Object.fromEntries(
  OUTCOME_SERIES.map((s) => [s.key, { label: s.label, color: s.color }]),
) satisfies ChartConfig;

const rateConfig = {
  passRate: { label: 'Pass rate', color: 'var(--accent-solid)' },
} satisfies ChartConfig;

type View = 'rate' | 'outcomes' | 'table';

const VIEWS = [
  { value: 'rate', label: 'Pass rate' },
  { value: 'outcomes', label: 'Outcomes' },
  { value: 'table', label: 'Table' },
];

export function PassFailChart({ data }: { data: TrendDatum[] }) {
  const [view, setView] = useState<View>('rate');
  const gradientId = `pass-rate-${useId().replace(/:/g, '')}`;

  const rows: TrendRow[] = useMemo(
    () =>
      data.map((d) => {
        const executed = d.passed + d.failed + d.flaky;
        return {
          ...d,
          label: `#${d.runNumber}`,
          executed,
          passRate: executed > 0 ? Math.round((d.passed / executed) * 100) : 0,
        };
      }),
    [data],
  );

  const totals = useMemo(() => {
    const sum = (pick: (r: TrendRow) => number) => rows.reduce((a, r) => a + pick(r), 0);
    const executed = sum((r) => r.executed);
    return {
      passed: sum((r) => r.passed),
      flaky: sum((r) => r.flaky),
      failed: sum((r) => r.failed),
      skipped: sum((r) => r.skipped),
      executed,
      rate: executed > 0 ? (sum((r) => r.passed) / executed) * 100 : null,
    };
  }, [rows]);

  const delta = useMemo(() => halfOverHalf(rows.map((r) => r.passRate)), [rows]);
  const average = useMemo(
    () => (rows.length ? rows.reduce((a, r) => a + r.passRate, 0) / rows.length : 0),
    [rows],
  );
  const latest = rows[rows.length - 1];

  /**
   * A healthy suite lives between 90% and 100%, and against a 0–100 axis that is
   * a flat line pinned to the ceiling — the axis spends nine tenths of its height
   * on a region the data never visits. The floor therefore follows the data, and
   * the axis labels say where it ended up.
   */
  const floor = useMemo(() => {
    if (rows.length === 0) return 0;
    const min = Math.min(...rows.map((r) => r.passRate));
    return Math.max(0, Math.min(90, Math.floor((min - 6) / 10) * 10));
  }, [rows]);

  const barSize = barSizeFor(rows.length);

  // Recharts measures its container in the browser; rendering on the server produces a
  // differently sized SVG and a hydration mismatch, so mount the chart client-side only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <ChartFrame
      label="Pass rate"
      value={totals.rate === null ? '–' : `${totals.rate.toFixed(1)}%`}
      delta={
        delta ? (
          <ChartDelta value={delta.value} direction={delta.direction} unit=" pts" comparedTo="vs the earlier half" />
        ) : null
      }
      caption={`Across the last ${rows.length} finished ${rows.length === 1 ? 'run' : 'runs'}.`}
      stats={
        rows.length > 0 ? (
          <ChartStats
            items={[
              { label: 'Runs', value: rows.length.toLocaleString() },
              { label: 'Tests run', value: totals.executed.toLocaleString() },
              { label: 'Failed', value: totals.failed.toLocaleString(), tone: totals.failed > 0 ? 'danger' : undefined },
              { label: 'Flaky', value: totals.flaky.toLocaleString(), tone: totals.flaky > 0 ? 'warning' : undefined },
            ]}
          />
        ) : null
      }
      actions={
        <SegmentedControl
          aria-label="Chart view"
          value={view}
          items={VIEWS}
          onValueChange={(next) => setView(next as View)}
        />
      }
      legend={
        view === 'table' ? null : view === 'outcomes' ? (
          <ChartLegendChips
            items={OUTCOME_SERIES.map((s) => ({
              label: s.label,
              color: s.color,
              value: compactNumber(totals[s.key]),
              muted: totals[s.key] === 0,
            }))}
          />
        ) : (
          // The rate plot has one series, so it needs no legend for identity —
          // but the rule across it is not self-explanatory, and a key is the one
          // place to say what it is without writing on the plot.
          <ChartLegendChips
            items={[
              { label: 'Pass rate', color: 'var(--accent-solid)' },
              { label: 'Window average', color: 'var(--border-strong)', shape: 'line', value: `${Math.round(average)}%` },
            ]}
          />
        )
      }
    >
      {view === 'table' ? (
        <TrendTable rows={rows} />
      ) : !mounted ? (
        <Skeleton className="h-64 w-full" />
      ) : view === 'outcomes' ? (
        <ChartContainer config={outcomeConfig} className="aspect-auto h-64 w-full">
          <BarChart data={rows} margin={CHART_MARGIN} barCategoryGap={CHART_MARK.barCategoryGap} maxBarSize={barSize}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="label" {...CHART_AXIS} />
            <YAxis allowDecimals={false} width={CHART_Y_WIDTH} tickCount={CHART_TICK_COUNT} tickFormatter={compactNumber} {...CHART_AXIS} />
            <ChartTooltip cursor={CHART_CURSOR.bar} content={<ChartTooltipContent labelFormatter={runLabel} />} />
            {OUTCOME_SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="outcome"
                fill={`var(--color-${s.key})`}
                shape={<StackSegment seriesKey={s.key} stackKeys={SERIES_ORDER} radius={barRadiusFor(barSize)} />}
                // The slot each stack stands in, drawn once, behind everything.
                // It gives the plot its rhythm — without it a short run reads as
                // a stub in an empty room rather than as a small bar in its
                // place — and shows at a glance which runs carried fewer tests.
                background={i === 0 ? { fill: 'var(--chart-track)', radius: barRadiusFor(barSize) } : false}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={rateConfig} className="aspect-auto h-64 w-full">
          <AreaChart data={rows} margin={CHART_MARGIN_LABELLED}>
            <defs>
              <AreaGradient id={gradientId} color="var(--color-passRate)" />
            </defs>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="label" {...CHART_AXIS} />
            <YAxis
              domain={[floor, 100]}
              ticks={niceTicks(floor, 100)}
              width={CHART_Y_WIDTH}
              tickFormatter={(v: number) => `${v}%`}
              {...CHART_AXIS}
            />
            {/* The window's own average, so a point reads against its context
                rather than against the axis alone. Unlabelled on purpose: a
                line that hugs the data has nowhere to put text that the data
                is not already using, so the legend names it instead. */}
            <ReferenceLine y={average} stroke="var(--border-strong)" strokeWidth={1} />
            <ChartTooltip
              cursor={CHART_CURSOR.line}
              content={
                <ChartTooltipContent
                  labelFormatter={runLabel}
                  formatter={(value) => <span className="tabular-nums">{value}% passed</span>}
                />
              }
            />
            <Area
              dataKey="passRate"
              type="monotone"
              stroke="var(--color-passRate)"
              strokeWidth={CHART_MARK.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              // A wash, not a magnitude: the baseline is the truncated floor the
              // axis labels declare, so the fill reads as the line's shadow
              // rather than as an area to be measured.
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={ACTIVE_DOT}
              isAnimationActive={false}
            />
            {/* One direct label, on the point the reader came for. The axis and
                the tooltip carry every other value. */}
            {latest ? (
              <ReferenceDot
                x={latest.label}
                y={latest.passRate}
                r={CHART_MARK.dotSize / 2}
                fill="var(--color-passRate)"
                stroke="var(--chart-surface)"
                strokeWidth={CHART_MARK.gap}
                label={{
                  value: `${latest.passRate}%`,
                  position: 'right',
                  offset: 10,
                  fill: 'var(--foreground)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            ) : null}
          </AreaChart>
        </ChartContainer>
      )}
    </ChartFrame>
  );
}

/** The same window, read rather than looked at. */
function TrendTable({ rows }: { rows: TrendRow[] }) {
  return (
    <div className="max-h-64 overflow-auto scrollbar-slim">
      <Table>
        <TableHeader className="sticky top-0 bg-surface">
          <TableRow className="hover:bg-transparent">
            <TableHead>Run</TableHead>
            <TableHead>Started</TableHead>
            {OUTCOME_SERIES.map((s) => (
              <TableHead key={s.key} className="text-right">
                {s.label}
              </TableHead>
            ))}
            <TableHead className="text-right">Pass rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.runNumber}>
              <TableCell className="font-medium tabular-nums">#{r.runNumber}</TableCell>
              <TableCell className="text-muted-foreground" suppressHydrationWarning>
                {formatDateTime(new Date(r.startedAt))}
              </TableCell>
              {OUTCOME_SERIES.map((s) => (
                <TableCell key={s.key} className="text-right tabular-nums">
                  {r[s.key]}
                </TableCell>
              ))}
              <TableCell className="text-right font-medium tabular-nums">{r.passRate}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function runLabel(_: unknown, payload: readonly { payload?: TrendDatum }[] | undefined) {
  const p = payload?.[0]?.payload;
  if (!p) return null;
  return (
    <span>
      Run #{p.runNumber}{' '}
      <span className="font-normal text-muted-foreground" suppressHydrationWarning>
        · {new Date(p.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
    </span>
  );
}
