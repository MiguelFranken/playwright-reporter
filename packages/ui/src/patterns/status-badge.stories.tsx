import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { ALL_STATUSES } from '../lib/tone';
import { StatusBadge, StatusDot } from './status-badge';

const meta = {
  title: 'Patterns/StatusBadge',
  component: StatusBadge,
  args: { status: 'passed' },
  argTypes: { status: { control: 'select', options: ALL_STATUSES } },
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The whole vocabulary at once. `timedout` and `timedOut` are both here on
 * purpose — the run status and the attempt status spell it differently and both
 * reach the UI.
 */
export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {ALL_STATUSES.map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Colour is never the only carrier: every badge also reads as words.
    await expect(within(canvasElement).getAllByText(/passed|failed|flaky|skipped|running|timed out|interrupted|abandoned/i))
      .toHaveLength(ALL_STATUSES.length);
  },
};

/** An unknown status degrades to neutral and shows its raw value rather than vanishing. */
export const UnknownStatus: Story = {
  args: { status: 'quarantined' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('quarantined')).toBeVisible();
  },
};

export const Dots: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      {ALL_STATUSES.map((status) => (
        <StatusDot key={status} status={status} />
      ))}
    </div>
  ),
};

/** The dot carries its meaning in a title, since it has no text of its own. */
export const DotIsLabelled: Story = {
  render: () => <StatusDot status="flaky" />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[title="Flaky"]')).not.toBeNull();
  },
};
