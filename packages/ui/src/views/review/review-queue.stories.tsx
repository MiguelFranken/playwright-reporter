import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { NOW, reviewQueueRows } from '../../fixtures/review';
import { ReviewQueue } from './review-queue';

const meta = {
  title: 'Views/Review/ReviewQueue',
  component: ReviewQueue,
  args: { rows: reviewQueueRows, runHref: (n: number) => `#run-${n}/review`, now: NOW },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof ReviewQueue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('4 changed')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Review run #483' })).toHaveAttribute('href', '#run-483/review');
    await expect(canvas.getByRole('button', { name: 'View run #481' })).toBeInTheDocument();
  },
};

export const Empty: Story = { args: { rows: [] } };
