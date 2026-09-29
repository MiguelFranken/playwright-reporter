import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { buttonThread, longThread, NOW, outdatedThread, resolvedThread, totalsThread, VIEWER_ID } from '../../fixtures/review-threads';
import { ThreadView } from './thread-view';

const meta = {
  title: 'Views/Review/Comments/ThreadView',
  component: ThreadView,
  args: { thread: buttonThread, captureId: 'cap-1', now: NOW, viewerId: VIEWER_ID, canComment: true, onReply: fn(), onSetThreadStatus: fn(), onEditComment: fn(), onDeleteComment: fn(), onClose: fn() },
  decorators: [(Story) => <div className="w-80 rounded-lg border border-border bg-popover p-3">{Story()}</div>],
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof ThreadView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Replying and resolving, the way a reviewer does in a pin's popover. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Reply to thread 1' }), 'Done in 9f2c1ab{Enter}');
    await expect(args.onReply).toHaveBeenCalledWith({ threadId: 'thread-1', body: 'Done in 9f2c1ab' });
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve thread 1' }));
    await expect(args.onSetThreadStatus).toHaveBeenCalledWith({ threadId: 'thread-1', status: 'resolved', captureId: 'cap-1' });
  },
};

export const FromAnAssistant: Story = { args: { thread: totalsThread } };

/** Placed on an earlier run whose image changed since. */
export const Outdated: Story = {
  args: { thread: outdatedThread },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/the image changed since/)).toBeVisible();
  },
};

export const Resolved: Story = {
  args: { thread: resolvedThread },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Reopen thread 4' }));
    await expect(args.onSetThreadStatus).toHaveBeenCalledWith({ threadId: 'thread-4', status: 'open', captureId: 'cap-1' });
  },
};

/** Without permission to comment: the conversation, no reply box, no resolve. */
export const ReadOnly: Story = {
  args: { canComment: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('textbox')).toBeNull();
    await expect(canvas.queryByRole('button', { name: /Resolve/ })).toBeNull();
  },
};

export const LongText: Story = { args: { thread: longThread } };
