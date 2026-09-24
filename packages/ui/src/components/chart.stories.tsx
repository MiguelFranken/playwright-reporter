import type { Meta, StoryObj } from '@storybook/react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from './chart';
import { ACTIVE_DOT, AreaGradient, SoloBar, StackSegment } from '../patterns/chart-marks';
import {
  CHART_AXIS,
  CHART_CURSOR,
  CHART_GRID,
  CHART_MARGIN,
  CHART_MARK,
  CHART_TICK_COUNT,
  CHART_Y_WIDTH,
  OUTCOME_SERIES,
  SERIES_ORDER,
  barRadiusFor,
  barSizeFor,
} from '../lib/chart';

const DATA = [
  { day: 'Mon', passed: 412, flaky: 8, failed: 3, skipped: 0 },
  { day: 'Tue', passed: 398, flaky: 14, failed: 11, skipped: 6 },
  { day: 'Wed', passed: 421, flaky: 6, failed: 1, skipped: 0 },
  { day: 'Thu', passed: 405, flaky: 19, failed: 22, skipped: 12 },
  { day: 'Fri', passed: 430, flaky: 4, failed: 0, skipped: 2 },
  { day: 'Sat', passed: 118, flaky: 1, failed: 0, skipped: 0 },
  { day: 'Sun', passed: 96, flaky: 0, failed: 2, skipped: 0 },
];

/** Seven categories, so the bars come out mid-weight. */
const BAR_SIZE = barSizeFor(DATA.length);

const config = Object.fromEntries(
  OUTCOME_SERIES.map((s) => [s.key, { label: s.label, color: s.color }]),
) satisfies ChartConfig;

/**
 * Recharts measures its container, so every chart story gives it a real size.
 * An unsized parent renders a zero-height chart that looks like a bug.
 *
 * These stories are the *primitive*: the container, the tooltip and the marks.
 * How a chart is framed — headline, delta, legend, table view — is
 * `Patterns/ChartFrame`, and a finished one is `Views/Dashboard/PassFailChart`.
 */
const meta = {
  title: 'Primitives/Chart',
  component: ChartContainer,
  // ChartContainer requires `config` and `children`, so they are declared here
  // and every story overrides them through its own `render`.
  args: {
    config,
    children: (
      <BarChart data={DATA}>
        <Bar dataKey="passed" fill="var(--color-passed)" />
      </BarChart>
    ),
  },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof ChartContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stack's segments are parted by a 2px gap in the surface colour, and only
 * the top-most segment that has a value is rounded — one data-end per bar,
 * wherever the data happens to stop. Nothing is stroked.
 */
export const StackedBars: Story = {
  render: () => (
    <ChartContainer config={config} className="h-72 w-full max-w-3xl">
      <BarChart data={DATA} margin={CHART_MARGIN} barCategoryGap={CHART_MARK.barCategoryGap} maxBarSize={BAR_SIZE}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="day" {...CHART_AXIS} />
        <YAxis width={CHART_Y_WIDTH} tickCount={CHART_TICK_COUNT} {...CHART_AXIS} />
        <ChartTooltip cursor={CHART_CURSOR.bar} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {OUTCOME_SERIES.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="a"
            fill={`var(--color-${s.key})`}
            shape={<StackSegment seriesKey={s.key} stackKeys={SERIES_ORDER} radius={barRadiusFor(BAR_SIZE)} />}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  ),
};

/** A lone series needs no legend: the title already names what is plotted. */
export const SingleBars: Story = {
  render: () => (
    <ChartContainer config={config} className="h-72 w-full max-w-3xl">
      <BarChart data={DATA} margin={CHART_MARGIN} barCategoryGap={CHART_MARK.barCategoryGap} maxBarSize={BAR_SIZE}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="day" {...CHART_AXIS} />
        <YAxis width={CHART_Y_WIDTH} tickCount={CHART_TICK_COUNT} {...CHART_AXIS} />
        <ChartTooltip cursor={CHART_CURSOR.bar} content={<ChartTooltipContent />} />
        <Bar
          dataKey="passed"
          fill="var(--color-passed)"
          shape={<SoloBar radius={barRadiusFor(BAR_SIZE)} />}
          background={{ fill: 'var(--chart-track)', radius: barRadiusFor(BAR_SIZE) }}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  ),
};

/** A 2px line over a wash that fades to nothing, and an 8px ringed marker. */
export const Area_: Story = {
  name: 'Area',
  render: () => (
    <ChartContainer config={config} className="h-72 w-full max-w-3xl">
      <AreaChart data={DATA} margin={CHART_MARGIN}>
        <defs>
          <AreaGradient id="story-passed" color="var(--color-passed)" />
        </defs>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="day" {...CHART_AXIS} />
        <YAxis width={CHART_Y_WIDTH} tickCount={CHART_TICK_COUNT} {...CHART_AXIS} />
        <ChartTooltip cursor={CHART_CURSOR.line} content={<ChartTooltipContent />} />
        <Area
          dataKey="passed"
          type="monotone"
          stroke="var(--color-passed)"
          strokeWidth={CHART_MARK.lineWidth}
          strokeLinecap="round"
          fill="url(#story-passed)"
          dot={false}
          activeDot={ACTIVE_DOT}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  ),
};

/** The colour tokens the config points at, resolved through ChartStyle. */
export const SeriesColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      {OUTCOME_SERIES.map((series) => (
        <div key={series.key} className="flex items-center gap-2">
          <span className="size-4 rounded-sm" style={{ background: series.color }} />
          <span className="text-body-s">{series.label}</span>
          <code className="text-code-xs text-muted-foreground">{series.color}</code>
        </div>
      ))}
    </div>
  ),
};
