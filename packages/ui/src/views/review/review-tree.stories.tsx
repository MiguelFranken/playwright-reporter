import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { reviewFlows } from '../../fixtures/review';
import { buildReviewTree } from '../../lib/review';
import { approveFolderAction, ReviewTree } from './review-tree';

const meta = {
  title: 'Views/Review/Storyboard/ReviewTree',
  component: ReviewTree,
  args: { folders: buildReviewTree(reviewFlows, 'suite'), selected: null, onSelect: fn(), grouping: 'suite', onGroupingChange: fn(), total: 15, needsReview: 8 },
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-60">{Story()}</div>],
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

/** A right-click on a folder offers what can be done with everything in it; a bulk approval is asked first. */
export const FolderMenu: Story = {
  args: {
    folderActions: (target) => [approveFolderAction(target, target.id === null ? ['a', 'b', 'c'] : ['a'], fn().mockName('approve'), new Set())],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.pointer({ keys: '[MouseRight]', target: canvas.getByRole('button', { name: /Coupons/ }) });
    const menu = await page.findByRole('menu', { name: 'Actions for Coupons' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Show only this folder' }));
    await expect(args.onSelect).toHaveBeenCalledWith('Checkout / Coupons');

    await userEvent.pointer({ keys: '[MouseRight]', target: canvas.getByRole('button', { name: /All flows/ }) });
    await userEvent.click(await page.findByRole('menuitem', { name: 'Approve 3 images' }));
    const dialog = await page.findByRole('dialog', { name: 'Approve 3 images?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve 3 images' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
  },
};

/** Nothing below the folder needs review: approving is offered, but off. */
export const FolderMenuNothingToApprove: Story = {
  args: { folderActions: (target) => [approveFolderAction(target, [], fn(), new Set())] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.pointer({ keys: '[MouseRight]', target: within(canvasElement).getByRole('button', { name: /Coupons/ }) });
    await expect(await page.findByRole('menuitem', { name: 'Nothing to approve' })).toHaveAttribute('aria-disabled', 'true');
  },
};
