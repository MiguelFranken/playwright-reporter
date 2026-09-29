import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { buttonThread, NOW, resolvedThread, totalsThread } from '../fixtures/review-threads';
import { CommentItem } from './comment-item';

const meta = {
  title: 'Patterns/Identity/CommentItem',
  component: CommentItem,
  args: { comment: buttonThread.comments[0], now: NOW, onEdit: fn(), onDelete: fn() },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof CommentItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Written by an AI assistant over MCP: no person, a badge saying so. */
export const FromAnAssistant: Story = {
  args: { comment: totalsThread.comments[0] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('via AI assistant')).toBeVisible();
  },
};

/** The author edits in place. */
export const Edit: Story = {
  args: { canEdit: true, canDelete: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Comment actions/ }));
    await userEvent.click(await within(document.body).findByRole('menuitem', { name: 'Edit' }));
    const box = await canvas.findByRole('textbox', { name: 'Edit comment' });
    await userEvent.clear(box);
    await userEvent.type(box, 'Use the primary style.{Enter}');
    await expect(args.onEdit).toHaveBeenCalledWith('Use the primary style.');
  },
};

export const Edited: Story = { args: { comment: { ...buttonThread.comments[0], editedAt: NOW.toISOString() } } };

/** A resolve event in the thread's history. */
export const ResolvedEvent: Story = { args: { comment: { ...resolvedThread.comments[2], kind: 'resolved' } } };
