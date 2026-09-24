import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Badge } from '../components/badge';
import { MetaChip } from './meta-chip';
import { ScoreMeter } from './score-meter';

const meta = {
  title: 'Patterns/ScoreMeter',
  component: ScoreMeter,
  args: { score: 82 },
  parameters: { layout: 'padded' },
  tags: ['themed'],
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof ScoreMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('meter')).toHaveAttribute('aria-valuenow', '82');
  },
};

export const Shaky: Story = { args: { score: 61 } };

export const Unreliable: Story = {
  args: {
    score: 24,
    risk: (
      <Badge variant="outline" className="border-danger-border bg-danger-subtle font-medium text-danger-text">
        Chronic
      </Badge>
    ),
  },
};

/** No runs is not a score of zero, so the track claims no measurement at all. */
export const NoData: Story = {
  args: { score: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('meter')).toBeNull();
    await expect(within(canvasElement).getByText('No data')).toBeVisible();
  },
};

export const WithContext: Story = {
  args: {
    score: 74,
    trailing: (
      <>
        <MetaChip>chromium</MetaChip>
        <MetaChip>30-day window</MetaChip>
      </>
    ),
  },
};
