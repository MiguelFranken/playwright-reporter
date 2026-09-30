import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NOW, toVerifyFlow, toVerifyThread } from '../../fixtures/library-views';
import { ThreadCompare } from './thread-compare';

const now = toVerifyFlow.checkpoints[1].captures.find((c) => c.variant === 'desktop')!;

const meta = {
  title: 'Views/Review/Comments/ThreadCompare',
  component: ThreadCompare,
  args: {
    thread: toVerifyThread,
    image: now.image,
    frame: { width: 1280, height: 720 },
    zoom: 0.4,
    label: 'Checkout filled in',
    currentLabel: 'Now · run #486',
    now: NOW,
    canResolve: true,
    onResolve: fn(),
    onClose: fn(),
  },
  decorators: [(Story) => <div className="bg-surface p-6">{Story()}</div>],
} satisfies Meta<typeof ThreadCompare>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The version commented on, with its pin and the comment, beside the screen now. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Commented on · run #483/)).toBeInTheDocument();
    await expect(canvas.getByText(/The order button should use the primary style/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve' }));
    await expect(args.onResolve).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Close comparison' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/** Retention took the image commented on: the comment stays, the comparison says so. */
export const OriginGone: Story = {
  args: { thread: { ...toVerifyThread, origin: null } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('The image this comment was made on is no longer stored.')).toBeInTheDocument();
  },
};

export const Resolved: Story = { args: { thread: { ...toVerifyThread, status: 'resolved' } } };

/** Somebody who may not comment compares, and cannot resolve. */
export const ReadOnly: Story = {
  args: { canResolve: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Resolve' })).toBeNull();
  },
};
