import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { libraryFlows, NOW, quietFlow } from '../../fixtures/library-views';
import { FeedbackInbox, FeedbackInboxButton } from './feedback-inbox';

const meta = {
  title: 'Views/Library/Browser/FeedbackInbox',
  component: FeedbackInbox,
  args: { open: true, onOpenChange: fn(), flows: libraryFlows, now: NOW, onOpenThread: fn() },
} satisfies Meta<typeof FeedbackInbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Highest priority first; a comment made on an earlier version says the screen changed since. */
export const Default: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    const list = await body.findByRole('list', { name: 'Open comments' });
    const [first] = within(list).getAllByRole('button');
    await expect(first).toHaveTextContent(/Changed since #483/);
    await userEvent.click(first);
    await expect(args.onOpenThread).toHaveBeenCalledWith(expect.objectContaining({ checkpointId: libraryFlows[0].checkpoints[1].id, variant: 'desktop' }));
  },
};

export const WaitingOnly: Story = {
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole('radio', { name: 'Waiting for changes, 1' }));
    await expect(within(body.getByRole('list', { name: 'Open comments' })).getAllByRole('button')).toHaveLength(1);
  },
};

export const NothingOpen: Story = {
  args: { flows: [quietFlow] },
  play: async () => {
    await expect(await within(document.body).findByText('No open comments on the flows shown.')).toBeInTheDocument();
  },
};

/** The button that opens it. */
export const Button: Story = {
  render: () => <FeedbackInboxButton flows={libraryFlows} onClick={fn()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Open feedback: 2 open comments, 1 to verify' })).toBeInTheDocument();
  },
};
