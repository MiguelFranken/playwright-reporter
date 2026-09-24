import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { CountTabs } from './count-tabs';

const items = [
  { value: 'all', label: 'All', count: 240, href: '#all' },
  { value: 'passed', label: 'Passed', count: 213, tone: 'success' as const, href: '#passed' },
  { value: 'failed', label: 'Failed', count: 14, tone: 'danger' as const, href: '#failed' },
  { value: 'flaky', label: 'Flaky', count: 9, tone: 'warning' as const, href: '#flaky' },
  { value: 'skipped', label: 'Skipped', count: 4, tone: 'neutral' as const, href: '#skipped' },
];

const meta = {
  title: 'Patterns/CountTabs',
  component: CountTabs,
  args: { items, value: 'all' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof CountTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /all 240/i })).toHaveAttribute('aria-current', 'true');
    await expect(canvas.getByRole('link', { name: /failed 14/i })).toHaveAttribute('href', '#failed');
  },
};

export const FilteredToFailed: Story = { args: { value: 'failed' } };

/** A clean run: the empty options stay put and stay readable. */
export const AllPassed: Story = {
  args: {
    items: items.map((i) => (i.value === 'all' || i.value === 'passed' ? { ...i, count: 240 } : { ...i, count: 0 })),
  },
};
