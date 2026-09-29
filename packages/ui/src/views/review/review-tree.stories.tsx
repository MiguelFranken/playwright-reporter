import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { reviewFlows } from '../../fixtures/review';
import { buildReviewTree } from '../../lib/review';
import { ReviewTree } from './review-tree';

const meta = {
  title: 'Views/Review/Storyboard/ReviewTree',
  component: ReviewTree,
  args: { folders: buildReviewTree(reviewFlows, 'suite'), selected: null, onSelect: fn(), grouping: 'suite', onGroupingChange: fn(), total: 15, needsReview: 8 },
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-60">{Story()}</div>],
  tags: ['themed'],
} satisfies Meta<typeof ReviewTree>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Test case suites first; tests no case covers sit in their own folder, by file. */
export const BySuite: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Coupons/ }));
    await expect(args.onSelect).toHaveBeenCalledWith('Checkout / Coupons');
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse Checkout' }));
    await expect(canvas.queryByRole('button', { name: /Coupons/ })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Expand all folders' }));
    await expect(canvas.getByRole('button', { name: /Coupons/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /Files/ }));
    await expect(args.onGroupingChange).toHaveBeenCalledWith('file');
  },
};

/** The library counts screens; nothing waits for a decision there. */
export const InTheLibrary: Story = { args: { showNeedsReview: false, allLabel: 'All screens' } };

export const ByFile: Story = { args: { folders: buildReviewTree(reviewFlows, 'file'), grouping: 'file' } };

export const Selected: Story = { args: { selected: 'Checkout / Coupons' } };
