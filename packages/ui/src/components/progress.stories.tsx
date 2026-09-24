import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Progress, ProgressLabel, ProgressValue } from './progress';

const meta = {
  title: 'Primitives/Progress',
  component: Progress,
  args: { value: 64 },
  argTypes: { value: { control: { type: 'range', min: 0, max: 100 } } },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <Progress {...args} className="max-w-md" aria-label="Shards reported" />,
};

export const Labelled: Story = {
  render: (args) => (
    <Progress {...args} className="max-w-md">
      <ProgressLabel>Shards reported</ProgressLabel>
      <ProgressValue />
    </Progress>
  ),
};

export const Extremes: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-6">
      {[0, 50, 100].map((value) => (
        <Progress key={value} value={value}>
          <ProgressLabel>{value}%</ProgressLabel>
          <ProgressValue />
        </Progress>
      ))}
    </div>
  ),
};

/** `value={null}` is the indeterminate state — a run whose shard count is unknown. */
export const Indeterminate: Story = {
  args: { value: null },
  render: (args) => (
    <Progress {...args} className="max-w-md">
      <ProgressLabel>Waiting for the first shard</ProgressLabel>
    </Progress>
  ),
};

export const ReportsItsValue: Story = {
  render: (args) => <Progress {...args} className="max-w-md" aria-label="Shards reported" />,
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole('progressbar', { name: /shards reported/i });
    await expect(bar).toHaveAttribute('aria-valuenow', '64');
  },
};
