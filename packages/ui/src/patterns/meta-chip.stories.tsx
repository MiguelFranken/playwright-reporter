import type { Meta, StoryObj } from '@storybook/react';
import { Timer } from 'lucide-react';
import { MetaChip } from './meta-chip';

const meta = {
  title: 'Patterns/MetaChip',
  component: MetaChip,
  args: { children: 'chromium' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof MetaChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = { args: { icon: Timer, children: '8.4s', title: 'Duration' } };

/** A row of them — the point is that five together still read as one line. */
export const Row: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <MetaChip>chromium</MetaChip>
      <MetaChip icon={Timer}>8.4s</MetaChip>
      <MetaChip className="border-warning-border bg-warning-subtle text-warning-text">2× retried</MetaChip>
      <MetaChip>staging</MetaChip>
      <MetaChip>30-day window</MetaChip>
    </div>
  ),
};
