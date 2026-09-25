'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Skeleton } from '../../components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../../components/chart';
import { SegmentedControl } from '../../components/segmented-control';
import { ChartDelta, ChartFrame, ChartStats } from '../../patterns/chart-frame';
import { ACTIVE_DOT, AreaGradient, SoloBar, SoloBarRight } from '../../patterns/chart-marks';
import {
  CHART_AXIS,
  CHART_CURSOR,
  CHART_GRID,
  CHART_MARGIN,
  CHART_MARK,
  CHART_TICK_COUNT,
  CHART_Y_WIDTH,
  barRadiusFor,
  barSizeFor,
  compactNumber,
  halfOverHalf,
} from '../../lib/chart';
import { formatBytes } from '../../lib/format';

/**
 * Admin → Database, charted.
 *
 * Every plot here carries one series in the accent colour. The breakdowns a
 * reader asks for next — retries inside results, indexes and TOAST inside a
 * table's size — are in the tooltip, the stats strip and the table view,
 * where they can be read exactly, rather than as extra hues a reader would
 * have to match to a legend.
 */

// ---------------------------------------------------------------- ingest

export interface IngestDayValue {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  runs: number;
  results: number;
  /** Every attempt, first tries and retries. */
  attempts: number;
  artifactBytes: number;
}

type Range = '30' | '90' | '365';
type IngestView = 'results' | 'artifacts' | 'table';

const RANGES = [
  { value: '30', label: '30d', 'aria-label': 'Last 30 days' },
  { value: '90', label: '90d', 'aria-label': 'Last 90 days' },
  { value: '365', label: '1y', 'aria-label': 'Last year' },
];

const INGEST_VIEWS = [
  { value: 'results', label: 'Results' },
  { value: 'artifacts', label: 'Artifacts' },
  { value: 'table', label: 'Table' },
];

/** A bar: one day, or one week in the year view, so the plot keeps a readable count of bars. */
interface Bucket extends IngestDayValue {
  label: string;
  /** The last day the bucket covers; the same as `day` for a daily bucket. */
  until: string;
  retries: number;
}

const ingestConfig = {
  results: { label: 'Results', color: 'var(--accent-solid)' },
  artifactBytes: { label: 'Artifacts', color: 'var(--accent-solid)' },
} satisfies ChartConfig;

function dayLabel(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function bucketIngest(days: readonly IngestDayValue[], range: number): Bucket[] {
  const window = days.slice(-range);
  const size = range > 120 ? 7 : 1;
  const out: Bucket[] = [];
  // Weeks are counted back from today, so only the oldest bar may be partial.
  for (let i = window.length - size * Math.ceil(window.length / size); i < window.length; i += size) {
    const part = window.slice(Math.max(0, i), i + size);
    if (part.length === 0) continue;
    const sum = (pick: (d: IngestDayValue) => number) => part.reduce((a, d) => a + pick(d), 0);
    const first = part[0];
    const last = part[part.length - 1];
    const results = sum((d) => d.results);
    const attempts = sum((d) => d.attempts);
    out.push({
      day: first.day,
      until: last.day,
      label: dayLabel(first.day),
      runs: sum((d) => d.runs),
      results,
      attempts,
      retries: Math.max(0, attempts - results),
      artifactBytes: sum((d) => d.artifactBytes),
    });
  }
  return out;
}

/**
 * How much the reporters are writing: test results per day, or artifact
 * bytes per day, over the last 30 days, 90 days or year (by week).
 */
export function DatabaseIngestChart({ data, defaultRange = '30' }: { data: IngestDayValue[]; defaultRange?: Range }) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [view, setView] = useState<IngestView>('results');
  const gradientId = `ingest-${useId().replace(/:/g, '')}`;

  const buckets = useMemo(() => bucketIngest(data, Number(range)), [data, range]);
  const weekly = Number(range) > 120;

  const totals = useMemo(() => {
    const sum = (pick: (b: Bucket) => number) => buckets.reduce((a, b) => a + pick(b), 0);
    return { runs: sum((b) => b.runs), results: sum((b) => b.results), retries: sum((b) => b.retries), bytes: sum((b) => b.artifactBytes) };
  }, [buckets]);

  const series = view === 'artifacts' ? buckets.map((b) => b.artifactBytes) : buckets.map((b) => b.results);
  const delta = halfOverHalf(series);
  const per = weekly ? 'week' : 'day';
  const empty = totals.runs === 0;
  const barSize = barSizeFor(buckets.length);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <ChartFrame
      label={view === 'artifacts' ? 'Artifacts uploaded' : 'Results ingested'}
      value={view === 'artifacts' ? formatBytes(totals.bytes) : totals.results.toLocaleString('en-US')}
      delta={
        delta ? (
          <ChartDelta
            value={view === 'artifacts' ? delta.value / 1024 ** 2 : delta.value}
            direction={delta.direction}
            goodWhen="none"
            unit={view === 'artifacts' ? ` MB / ${per}` : ` / ${per}`}
            comparedTo="vs the earlier half"
          />
        ) : null
      }
      caption={`${range === '365' ? 'Over the last year, by week' : `Over the last ${range} days`}, by the day each run started (UTC).`}
      stats={
        <ChartStats
          items={[
            { label: 'Runs', value: totals.runs.toLocaleString('en-US') },
            { label: 'Results', value: totals.results.toLocaleString('en-US') },
            { label: 'Retries', value: totals.retries.toLocaleString('en-US'), tone: totals.retries > 0 ? 'warning' : undefined },
            { label: 'Artifacts', value: formatBytes(totals.bytes) },
          ]}
        />
      }
      actions={
        <div className="flex flex-wrap justify-end gap-2">
          <SegmentedControl aria-label="Time range" value={range} items={RANGES} onValueChange={(v) => setRange(v as Range)} />
          <SegmentedControl aria-label="Chart view" value={view} items={INGEST_VIEWS} onValueChange={(v) => setView(v as IngestView)} />
        </div>
      }
    >
      {view === 'table' ? (
        <IngestTable buckets={buckets} weekly={weekly} />
      ) : empty ? (
        <p className="flex h-64 items-center justify-center text-body-s text-muted-foreground">Nothing was ingested in this window.</p>
      ) : !mounted ? (
        <Skeleton className="h-64 w-full" />
      ) : view === 'artifacts' ? (
        <ChartContainer config={ingestConfig} className="aspect-auto h-64 w-full">
          <AreaChart data={buckets} margin={CHART_MARGIN}>
            <defs>
              <AreaGradient id={gradientId} color="var(--color-artifactBytes)" />
            </defs>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="label" {...CHART_AXIS} />
            <YAxis width={CHART_Y_WIDTH} tickCount={CHART_TICK_COUNT} tickFormatter={shortBytes} {...CHART_AXIS} />
            <ChartTooltip
              cursor={CHART_CURSOR.line}
              content={
                <ChartTooltipContent
                  labelFormatter={bucketLabel}
                  formatter={(value) => <span className="tabular-nums">{formatBytes(Number(value))} uploaded</span>}
                />
              }
            />
            <Area
              dataKey="artifactBytes"
              type="monotone"
              stroke="var(--color-artifactBytes)"
              strokeWidth={CHART_MARK.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={ACTIVE_DOT}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={ingestConfig} className="aspect-auto h-64 w-full">
          <BarChart data={buckets} margin={CHART_MARGIN} barCategoryGap={CHART_MARK.barCategoryGap} maxBarSize={barSize}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="label" {...CHART_AXIS} />
            <YAxis allowDecimals={false} width={CHART_Y_WIDTH} tickCount={CHART_TICK_COUNT} tickFormatter={compactNumber} {...CHART_AXIS} />
            <ChartTooltip
              cursor={CHART_CURSOR.bar}
              content={
                <ChartTooltipContent
                  labelFormatter={bucketLabel}
                  formatter={(_value, _name, item) => {
                    const b = item.payload as Bucket;
                    return (
                      <span className="flex flex-col gap-0.5 tabular-nums">
                        <span>{b.results.toLocaleString('en-US')} results</span>
                        <span className="text-muted-foreground">
                          {b.runs.toLocaleString('en-US')} {b.runs === 1 ? 'run' : 'runs'} · {b.retries.toLocaleString('en-US')} retries
                        </span>
                      </span>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="results"
              fill="var(--color-results)"
              shape={<SoloBar radius={barRadiusFor(barSize)} />}
              background={{ fill: 'var(--chart-track)', radius: barRadiusFor(barSize) }}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      )}
    </ChartFrame>
  );
}

function IngestTable({ buckets, weekly }: { buckets: Bucket[]; weekly: boolean }) {
  const rows = [...buckets].reverse();
  return (
    <div className="max-h-64 overflow-auto scrollbar-slim">
      <Table>
        <TableHeader className="sticky top-0 bg-surface">
          <TableRow className="hover:bg-transparent">
            <TableHead>{weekly ? 'Week of' : 'Day'}</TableHead>
            <TableHead className="text-right">Runs</TableHead>
            <TableHead className="text-right">Results</TableHead>
            <TableHead className="text-right">Retries</TableHead>
            <TableHead className="text-right">Artifacts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.day}>
              <TableCell className="tabular-nums">{b.label}</TableCell>
              <TableCell className="text-right tabular-nums">{b.runs.toLocaleString('en-US')}</TableCell>
              <TableCell className="text-right tabular-nums">{b.results.toLocaleString('en-US')}</TableCell>
              <TableCell className="text-right tabular-nums">{b.retries.toLocaleString('en-US')}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBytes(b.artifactBytes)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function bucketLabel(_: unknown, payload: readonly { payload?: Bucket }[] | undefined) {
  const b = payload?.[0]?.payload;
  if (!b) return null;
  return <span>{b.day === b.until ? dayLabel(b.day) : `${dayLabel(b.day)} – ${dayLabel(b.until)}`}</span>;
}

/** Axis ticks: one token wide, like `compactNumber`. */
function shortBytes(n: number) {
  if (n <= 0) return '0';
  if (n < 1024 ** 2) return `${Math.round(n / 1024)}K`;
  if (n < 1024 ** 3) return `${Math.round((n / 1024 ** 2) * 10) / 10}M`;
  return `${Math.round((n / 1024 ** 3) * 10) / 10}G`;
}

// ---------------------------------------------------------------- size

export interface TableSizeValue {
  name: string;
  /** Postgres' live-row estimate. */
  rows: number;
  tableBytes: number;
  indexBytes: number;
  toastBytes: number;
  totalBytes: number;
}

export interface DatabaseSizeChartProps {
  /** The whole database, catalogue and other schemas included. */
  totalBytes: number;
  /** What the run-history tables take together. */
  historyBytes: number;
  /** Every table in the app's schema, largest first. */
  tables: TableSizeValue[];
  /** What one more test result costs, indexes included. */
  bytesPerResult: number;
  /** Results ingested over the last 30 days: with `bytesPerResult`, the growth projection. */
  resultsLast30Days: number;
}

type SizeView = 'chart' | 'table';

const SIZE_VIEWS = [
  { value: 'chart', label: 'Largest' },
  { value: 'table', label: 'All tables' },
];

const sizeConfig = { totalBytes: { label: 'Size', color: 'var(--accent-solid)' } } satisfies ChartConfig;

/** How much disk the database takes, and which tables take it. */
export function DatabaseSizeChart({ totalBytes, historyBytes, tables, bytesPerResult, resultsLast30Days }: DatabaseSizeChartProps) {
  const [view, setView] = useState<SizeView>('chart');
  const largest = useMemo(() => tables.slice(0, 8), [tables]);
  const growth = bytesPerResult * resultsLast30Days;
  const share = totalBytes > 0 ? Math.round((historyBytes / totalBytes) * 100) : 0;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <ChartFrame
      label="Database size"
      value={formatBytes(totalBytes)}
      caption={`Run history takes ${share}% of it. Postgres reuses the space of deleted rows before it grows again.`}
      stats={
        <ChartStats
          items={[
            { label: 'Run history', value: formatBytes(historyBytes) },
            { label: 'Per result', value: bytesPerResult > 0 ? `≈ ${formatBytes(bytesPerResult)}` : '–' },
            { label: 'Growth', value: growth > 0 ? `≈ ${formatBytes(growth)} / mo` : '–' },
            { label: 'Tables', value: tables.length.toLocaleString('en-US') },
          ]}
        />
      }
      actions={<SegmentedControl aria-label="Size view" value={view} items={SIZE_VIEWS} onValueChange={(v) => setView(v as SizeView)} />}
    >
      {view === 'table' ? (
        <SizeTable tables={tables} />
      ) : largest.length === 0 ? (
        <p className="flex h-40 items-center justify-center text-body-s text-muted-foreground">No tables yet.</p>
      ) : !mounted ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ChartContainer config={sizeConfig} className="aspect-auto w-full" style={{ height: 40 + largest.length * 30 }}>
          <BarChart data={largest} layout="vertical" margin={{ ...CHART_MARGIN, right: 16 }} barCategoryGap="28%">
            <CartesianGrid {...CHART_GRID} vertical horizontal={false} />
            <XAxis type="number" tickCount={CHART_TICK_COUNT} tickFormatter={shortBytes} {...CHART_AXIS} />
            <YAxis type="category" dataKey="name" width={120} {...CHART_AXIS} minTickGap={0} />
            <ChartTooltip
              cursor={CHART_CURSOR.bar}
              content={
                <ChartTooltipContent
                  hideIndicator
                  formatter={(_value, _name, item) => {
                    const t = item.payload as TableSizeValue;
                    return (
                      <span className="flex flex-col gap-0.5 tabular-nums">
                        <span className="font-medium">{formatBytes(t.totalBytes)}</span>
                        <span className="text-muted-foreground">
                          {formatBytes(t.tableBytes)} rows · {formatBytes(t.indexBytes)} indexes · {formatBytes(t.toastBytes)} large values
                        </span>
                        <span className="text-muted-foreground">≈ {t.rows.toLocaleString('en-US')} rows</span>
                      </span>
                    );
                  }}
                />
              }
            />
            <Bar dataKey="totalBytes" fill="var(--color-totalBytes)" shape={<SoloBarRight />} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartFrame>
  );
}

function SizeTable({ tables }: { tables: TableSizeValue[] }) {
  return (
    <div className="max-h-80 overflow-auto scrollbar-slim">
      <Table>
        <TableHeader className="sticky top-0 bg-surface">
          <TableRow className="hover:bg-transparent">
            <TableHead>Table</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">Data</TableHead>
            <TableHead className="text-right">Indexes</TableHead>
            <TableHead className="text-right">Large values</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tables.map((t) => (
            <TableRow key={t.name}>
              <TableCell className="font-mono text-code-xs">{t.name}</TableCell>
              <TableCell className="text-right tabular-nums">≈ {t.rows.toLocaleString('en-US')}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBytes(t.tableBytes)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBytes(t.indexBytes)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBytes(t.toastBytes)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatBytes(t.totalBytes)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
