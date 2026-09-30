import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CommentComposer } from './comment-composer';

const meta = {
  title: 'Patterns/Controls/CommentComposer',
  component: CommentComposer,
  args: { onSubmit: fn(), onCancel: fn() },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CommentComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Enter posts, Shift + Enter starts a new line; the box clears after posting. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const box = within(canvasElement).getByRole('textbox', { name: 'Comment' });
    await expect(within(canvasElement).getByRole('button', { name: 'Comment' })).toBeDisabled();
    await userEvent.type(box, 'Primary button{Shift>}{Enter}{/Shift}please');
    await userEvent.keyboard('{Enter}');
    await expect(args.onSubmit).toHaveBeenCalledWith('Primary button\nplease');
    await expect(box).toHaveValue('');
  },
};

export const CancelWithEscape: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole('textbox', { name: 'Comment' }), 'never mind{Escape}');
    await expect(args.onCancel).toHaveBeenCalled();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** A reply box: one line with the send button beside it. */
export const Compact: Story = { args: { compact: true, label: 'Reply', submitLabel: 'Reply', placeholder: 'Reply…', onCancel: undefined } };

export const Posting: Story = { args: { pending: true, initialValue: 'Primary button please' } };
