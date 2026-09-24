import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Activity, TrendingUp } from 'lucide-react';
import { ChartDelta, ChartFrame, ChartLegendChips } from './chart-frame';
import { OUTCOME_SERIES } from '../lib/chart';

/**
 * The frame on its own, with a plain box standing in for the plot: the anatomy
 * is what these stories are about, and a real chart would only argue with it.
 */
const meta = {
  title: 'Patterns/ChartFrame',
  component: ChartFrame,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    label: 'Pass rate',
    icon: TrendingUp,
    children: <div className="h-48 w-full rounded-lg bg-surface-sunken" />,
  },
} satisfies Meta<typeof ChartFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: '94.2%',
    delta: <ChartDelta value={2.1} direction="up" unit=" pts" comparedTo="vs the earlier half" />,
    caption: 'Across the last 30 finished runs.',
    legend: (
      <ChartLegendChips
        items={OUTCOME_SERIES.map((s, i) => ({ label: s.label, color: s.color, value: [3_412, 86, 21, 140][i] }))}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('94.2%')).toBeVisible();
    await expect(canvas.getByText('Passed')).toBeVisible();
  },
};

/** A chart whose story is its shape: no headline, no legend, just the frame. */
export const PlotOnly: Story = { args: { label: 'Run duration' } };

/**
 * Direction and judgement are separate. Every one of these is *rising*; only
 * `goodWhen` decides whether that is welcome.
 */
export const Deltas: Story = {
  args: { label: 'Deltas', value: '1,284' },
  render: (args) => (
    <ChartFrame {...args} icon={Activity}>
      <div className="flex flex-col gap-3 py-2">
        <ChartDelta value={2.1} direction="up" goodWhen="up" unit=" pts" comparedTo="pass rate — good" />
        <ChartDelta value={12} direction="up" goodWhen="down" comparedTo="failures — bad" />
        <ChartDelta value={4.4} direction="down" goodWhen="up" unit="%" comparedTo="pass rate — bad" />
        <ChartDelta value={0} direction="flat" comparedTo="unchanged" />
        <ChartDelta value={31} direction="up" goodWhen="none" comparedTo="tests tracked — neither" />
      </div>
    </ChartFrame>
  ),
};

/** A series with nothing in it stays in the legend, dimmed: absence is data. */
export const EmptySeries: Story = {
  args: {
    value: '100%',
    caption: 'Across the last 12 finished runs.',
    legend: (
      <ChartLegendChips
        items={OUTCOME_SERIES.map((s, i) => ({ label: s.label, color: s.color, value: [980, 0, 0, 12][i], muted: i === 1 || i === 2 }))}
      />
    ),
  },
};
