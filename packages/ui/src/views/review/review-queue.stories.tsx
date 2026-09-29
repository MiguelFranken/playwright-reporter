import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { NOW, reviewQueueRows } from '../../fixtures/review';
import { ReviewQueue } from './review-queue';

const meta = {
  title: 'Views/Review/ReviewQueue',
  component: ReviewQueue,
  args: {
    rows: reviewQueueRows,
    libraryRefs: ['pr:212'],
    defaultBranch: 'main',
    now: NOW,
  },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof ReviewQueue>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One row per pull request: #212's newest run, its earlier one only counted. Opens on what waits. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('4 changed')).toBeInTheDocument();
    await expect(canvas.getByText(/1 earlier run/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Review run #483' })).toHaveAttribute('href', '#run-483/review');
    await expect(canvas.queryByRole('button', { name: 'Review run #480' })).toBeNull();
    await expect(canvas.getByRole('link', { name: '#212 Checkout redesign' })).toHaveAttribute('href', '#pr:212');
    // main needs nothing: it waits behind "All changes".
    await expect(canvas.queryByRole('link', { name: 'main' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: /All changes/ }));
    await expect(canvas.getByRole('button', { name: 'View run #481' })).toBeInTheDocument();
  },
};

export const NothingWaiting: Story = { args: { rows: reviewQueueRows.filter((r) => r.number === 481) } };

export const Empty: Story = { args: { rows: [] } };
