import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { StatGrid } from './stat-grid';

const meta = {
  title: 'Patterns/StatGrid',
  component: StatGrid,
  args: {
    stats: [
      { label: 'Runs', value: 48 },
      { label: 'Failure rate', value: '27.1%', tone: 'danger' as const },
      { label: 'Flaky rate', value: '10.4%', tone: 'warning' as const },
      { label: 'Failure streak', value: 5, tone: 'danger' as const },
      { label: 'Avg duration', value: '8.4s', hint: 'p95 21.8s' },
    ],
  },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof StatGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    // A hint belongs inside its own `dd`, not beside it — the list would be
    // invalid otherwise, and axe would say so.
    await expect(within(canvasElement).getByText('p95 21.8s')).toBeVisible();
  },
};

/** Mono values for the identifiers — branch names, hosts, SHAs. */
export const WithMonoValues: Story = {
  args: {
    stats: [
      { label: 'Branches', value: 3 },
      { label: 'Top failing branch', value: 'feat/checkout-redesign', mono: true, tone: 'danger' as const },
      { label: 'Duration trend', value: 'Slower', tone: 'warning' as const, hint: '134% of earlier average' },
    ],
    columns: 3 as const,
  },
};

/** Nothing to report renders nothing at all, rather than a row of dashes. */
export const Empty: Story = { args: { stats: [] } };
