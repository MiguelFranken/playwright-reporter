import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixedThread, movedAreaThread, NOW, totalsThread, VIEWER_ID, verifyFlows } from '../../fixtures/review-threads';
import { FeedbackThreadCard, VerifyDone } from './thread-verify';

const capture = verifyFlows[0].checkpoints[1].captures.find((c) => c.variant === 'desktop')!;

const meta = {
  title: 'Views/Review/Comments/FeedbackThreadCard',
  component: FeedbackThreadCard,
  args: {
    thread: fixedThread,
    stage: 'verify',
    captureId: capture.id,
    now: NOW,
    viewerId: VIEWER_ID,
    canComment: true,
    onResolve: fn(),
    onNext: fn(),
    onReply: fn(),
  },
  decorators: [(Story) => <div className="w-80 bg-popover p-4">{Story()}</div>],
} satisfies Meta<typeof FeedbackThreadCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Made on an earlier version, the screen changed since: was it fixed? Resolve, answer, or go on. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Verify comment 1' })).toBeInTheDocument();
    await expect(canvas.getByText('Changed since')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /Fixed — resolve/ }));
    await expect(args.onResolve).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));
    await expect(args.onNext).toHaveBeenCalled();
  },
};

/** Captured again and the same: the comment is not fixed yet, and resolving is still a click away. */
export const Unchanged: Story = {
  args: { thread: totalsThread, stage: 'waiting', currentRunNumber: 486 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Comment 2, unchanged' })).toBeInTheDocument();
    await expect(canvas.getByText(/Captured again in run #486, and the same as on run #483/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /^Resolve/ }));
    await expect(args.onResolve).toHaveBeenCalled();
  },
};

/** Not captured again since the comment: the test has not run after the fix. */
export const NotCapturedAgain: Story = {
  args: { thread: totalsThread, stage: 'waiting', currentRunNumber: 483 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Not captured again since run #483/)).toBeInTheDocument();
  },
};

/** Not fixed: the reply box takes the answer. */
export const NotFixed: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Not yet — reply/ }));
    await userEvent.type(await canvas.findByRole('textbox', { name: 'Reply to thread 1' }), 'Still secondary on mobile{Enter}');
    await expect(args.onReply).toHaveBeenCalledWith({ threadId: fixedThread.id, body: 'Still secondary on mobile' });
  },
};

/** An area. */
export const Area: Story = { args: { thread: movedAreaThread } };

export const Resolved: Story = {
  args: { thread: { ...fixedThread, status: 'resolved' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: /Fixed — resolve/ })).toBeNull();
  },
};

/** Somebody who may not comment looks, and cannot resolve. */
export const ReadOnly: Story = {
  args: { canComment: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('group', { name: 'Was it fixed?' })).toBeNull();
  },
};

/** Everything checked. */
export const Done: Story = {
  render: () => <VerifyDone count={2} onClose={fn()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Nothing left to verify')).toBeInTheDocument();
  },
};
