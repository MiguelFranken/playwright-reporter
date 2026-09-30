import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CommentPin } from './comment-pin';

const meta = {
  title: 'Patterns/Controls/CommentPin',
  component: CommentPin,
  args: { number: 3, 'aria-label': 'Thread 3', onClick: fn() },
  argTypes: { state: { control: 'inline-radio', options: ['open', 'outdated', 'resolved', 'draft'] } },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CommentPin>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Thread 3' }));
    await expect(args.onClick).toHaveBeenCalled();
  },
};

/** Every state side by side, on a busy background, as they sit on screenshots. */
export const States: Story = {
  render: (args) => (
    <div className="flex items-end gap-6 rounded-lg bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_8px,var(--surface)_8px,var(--surface)_16px)] p-8">
      <CommentPin {...args} number={1} aria-label="Open" />
      <CommentPin {...args} number={2} selected aria-label="Selected" />
      <CommentPin {...args} number={3} state="outdated" aria-label="Outdated" />
      <CommentPin {...args} number={4} state="resolved" aria-label="Resolved" />
      <CommentPin {...args} number={null} state="draft" aria-label="Draft" />
      <CommentPin {...args} number={12} pending aria-label="Saving" />
    </div>
  ),
  // The saving pin is dimmed; the same pin at full strength is checked above.
};

export const TwoDigits: Story = { args: { number: 128, 'aria-label': 'Thread 128' } };
