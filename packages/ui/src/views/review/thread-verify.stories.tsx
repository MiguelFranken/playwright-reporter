import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixedThread, movedAreaThread, NOW, totalsThread, VIEWER_ID, verifyFlows } from '../../fixtures/review-threads';
import { ThreadVerify, VerifyDone } from './thread-verify';

const capture = verifyFlows[0].checkpoints[1].captures.find((c) => c.variant === 'desktop')!;

const meta = {
  title: 'Views/Review/Comments/ThreadVerify',
  component: ThreadVerify,
  args: {
    thread: fixedThread,
    index: 0,
    total: 2,
    captureId: capture.id,
    image: capture.image,
    frame: { width: 1280, height: 720 },
    zoom: 0.4,
    closeUpWidth: 420,
    label: 'Checkout filled in',
    currentLabel: 'Now · this run',
    now: NOW,
    viewerId: VIEWER_ID,
    canComment: true,
    onResolve: fn(),
    onStep: fn(),
    onClose: fn(),
    onReply: fn(),
  },
  decorators: [(Story) => <div className="bg-surface p-6">{Story()}</div>],
} satisfies Meta<typeof ThreadVerify>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Then and now at the spot, the conversation, and the question: was it fixed? */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Verify comment 1')).toBeInTheDocument();
    await expect(canvas.getByText(/Commented on · run #470/)).toBeInTheDocument();
    await expect(canvas.getByRole('img', { name: /close-up of comment 1, as commented on/ })).toBeInTheDocument();
    await expect(canvas.getByRole('img', { name: /close-up of comment 1, now/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /Fixed — resolve/ }));
    await expect(args.onResolve).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Skip' }));
    await expect(args.onStep).toHaveBeenCalledWith(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Stop verifying' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/**
 * Resolving feedback goes through comments on screens that have not changed
 * too: captured again and the same, the comment is not fixed yet — the spot
 * once, as it is, and resolving is still a click away.
 */
export const Unchanged: Story = {
  args: { thread: totalsThread, stage: 'waiting', currentRunNumber: 486, index: 2, total: 5 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Comment 2, unchanged' })).toBeInTheDocument();
    await expect(canvas.getByText(/Captured again in run #486, and the same as when the comment was made on run #483/)).toBeInTheDocument();
    await expect(canvas.queryByRole('img', { name: /as commented on/ })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: /Done — resolve/ }));
    await expect(args.onResolve).toHaveBeenCalled();
  },
};

/** Not captured again since the comment: the test has not run after the fix. */
export const NotCapturedAgain: Story = {
  args: { thread: totalsThread, stage: 'waiting', currentRunNumber: 483 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Not captured again since the comment on run #483/)).toBeInTheDocument();
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

/** The two whole screens, for when the close-up is not enough. */
export const WholeScreens: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Whole screens' }));
    await expect(canvas.getByRole('region', { name: /the version commented on/ })).toBeInTheDocument();
  },
};

/** An area. */
export const Area: Story = { args: { thread: movedAreaThread, index: 1 } };

/** Retention took the image commented on: the screen now, and the comment. */
export const OriginGone: Story = {
  args: { thread: { ...fixedThread, origin: null } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('The image this comment was made on is no longer stored.')).toBeInTheDocument();
  },
};

export const Resolved: Story = {
  args: { thread: { ...fixedThread, status: 'resolved' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: /Fixed — resolve/ })).toBeNull();
  },
};

/** Somebody who may not comment looks, and cannot resolve. */
export const ReadOnly: Story = {
  args: { canComment: false, total: 1 },
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
