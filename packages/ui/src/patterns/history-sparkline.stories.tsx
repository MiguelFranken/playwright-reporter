import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { HistorySparkline } from './history-sparkline';

const HEALTHY = Array.from({ length: 12 }, () => 'passed');
const MIXED = ['failed', 'passed', 'passed', 'flaky', 'passed', 'failed', 'passed', 'passed', 'skipped', 'passed'];

const meta = {
  title: 'Patterns/HistorySparkline',
  component: HistorySparkline,
  args: { history: MIXED },
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof HistorySparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllPassing: Story = { args: { history: HEALTHY } };

/** The current run is the last cell, taller and ringed so it reads as "now". */
export const WithCurrent: Story = { args: { history: MIXED, current: 'failed' } };

/**
 * Fewer runs than cells. The gap is padded on the left with empty cells so the
 * newest outcome stays pinned to the right across every row of a table.
 */
export const SparseHistory: Story = { args: { history: ['passed', 'failed', 'passed'] } };

export const NoHistory: Story = {
  args: { history: [] },
  play: async ({ canvasElement }) => {
    const strip = within(canvasElement).getByLabelText('Recent history');
    await expect(strip.children).toHaveLength(10);
  },
};

/** An outcome the UI has no colour for falls back to neutral rather than blank. */
export const UnknownOutcome: Story = { args: { history: ['passed', 'quarantined', 'failed'] } };

export const Widths: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      {[5, 10, 20].map((cells) => (
        <HistorySparkline key={cells} {...args} cells={cells} history={MIXED.concat(HEALTHY)} />
      ))}
    </div>
  ),
};
