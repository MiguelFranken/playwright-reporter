import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { CommentCountBadge } from './comment-count-badge';

const meta = {
  title: 'Patterns/Status/CommentCountBadge',
  component: CommentCountBadge,
  args: { count: 3 },
  decorators: [(Story) => <div className="relative h-24 w-40 rounded-md bg-surface ring-1 ring-border">{Story()}</div>],
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof CommentCountBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('3 open comments')).toBeInTheDocument();
  },
};

export const One: Story = { args: { count: 1 } };

/** None open: nothing to show. */
export const None: Story = {
  args: { count: 0 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="comment-count-badge"]')).toBeNull();
  },
};

/** Every open comment was made on an earlier version: the screen is ready to verify. */
export const AllOnAnEarlierVersion: Story = {
  args: { count: 2, outdated: 2 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('2 open comments, all on an earlier version')).toBeInTheDocument();
  },
};

export const SomeOnAnEarlierVersion: Story = {
  args: { count: 3, outdated: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('3 open comments, 1 on an earlier version')).toBeInTheDocument();
  },
};
