import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { approvedFlows, failedFlow, legacyFlow, longTextFlow, placeOrderFlow, reviewFlows, unavailableFlow } from '../../fixtures/review';
import { ReviewStoryboard } from './review-storyboard';

const meta = {
  title: 'Views/Review/Storyboard/ReviewStoryboard',
  component: ReviewStoryboard,
  args: { flows: reviewFlows, onDecide: fn(), onFilterChange: fn(), onSelectionChange: fn(), onFolderChange: fn(), onSizeChange: fn() },
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="min-h-dvh bg-surface p-6">{Story()}</div>],
  tags: ['themed'],
} satisfies Meta<typeof ReviewStoryboard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens on what needs review: approved images are filtered out until asked for. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Needs review/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.queryByRole('button', { name: /Open 1\. Cart with two products/ })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: /^All\s?\d+$/ }));
    await expect(args.onFilterChange).toHaveBeenCalledWith('all');
    await expect(canvas.getByRole('button', { name: /Open 1\. Cart with two products/ })).toBeInTheDocument();
  },
};

export const ApproveEverythingShown: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Approve 8 shown/ }));
    await expect(args.onDecide).toHaveBeenCalledWith(expect.objectContaining({ decision: 'approved' }));
  },
};

export const OpensTheViewer: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Open 2\. Checkout filled in/ }));
    await expect(args.onSelectionChange).toHaveBeenCalledWith({ checkpointId: placeOrderFlow.checkpoints[1].id, variant: null });
    await within(document.body).findByRole('dialog');
  },
};

export const MobileOnly: Story = { args: { variant: 'mobile', filter: 'all' } };

export const Searching: Story = {
  args: { filter: 'all' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Find a test, case or checkpoint' }), 'coupon');
    await expect(canvas.getAllByRole('listitem').length).toBeGreaterThan(0);
    await expect(canvas.queryByText(/places an order/)).toBeNull();
  },
};

/** A failed test ends its row with Playwright's screenshot of the failure. */
export const FailedTest: Story = { args: { flows: [failedFlow] } };

/** Everything approved: the default filter has nothing, and says so. */
export const NothingToReview: Story = { args: { flows: approvedFlows, filter: 'needs-review' } };

export const Empty: Story = { args: { flows: [] } };

export const ReadOnly: Story = { args: { canDecide: false, filter: 'all' } };

export const LongText: Story = { args: { flows: [longTextFlow] } };

export const ImagesUnavailable: Story = { args: { flows: [unavailableFlow] } };

/** One test's checkpoints, embedded without the toolbar (the test result page). */
export const Embedded: Story = { args: { flows: [placeOrderFlow], toolbar: false } };

/** Browsing by suite: picking a folder narrows the rows to it. */
export const InAFolder: Story = {
  args: { filter: 'all' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Coupons/ }));
    await expect(args.onFolderChange).toHaveBeenCalledWith('Checkout / Coupons');
    await expect(canvas.queryByText(/places an order/)).toBeNull();
    await expect(canvas.getByRole('link', { name: /TC-21/ })).toHaveAttribute('href', '#case-21');
  },
};

export const BySpecFile: Story = { args: { filter: 'all', grouping: 'file' } };

/** Large screens load the full image and scroll: a flow can be read without opening it. */
export const LargeScreens: Story = {
  args: { filter: 'all', size: 0.4, flows: [placeOrderFlow, legacyFlow] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('region', { name: /screen$/ }).length).toBeGreaterThan(0);
  },
};

/** Old captures without a recorded viewport: the mobile screen is still a portrait phone. */
export const LegacyCaptures: Story = { args: { flows: [legacyFlow], filter: 'all', size: 0.3 } };
