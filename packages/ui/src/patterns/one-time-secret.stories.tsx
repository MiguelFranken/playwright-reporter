import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { OneTimeSecret } from './one-time-secret';

const meta = {
  title: 'Patterns/OneTimeSecret',
  component: OneTimeSecret,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    title: 'Invitation link for margaret@acme.test',
    description: 'This link is shown once. Send it to the person yourself — the app does not send email.',
    value: 'https://reporter.acme.test/invite/7c1f0a9e2b4d4f58a3e6b1c9d0f2a4b6',
    onDismiss: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OneTimeSecret>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(args.value)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
};

export const TemporaryPassword: Story = {
  args: {
    title: 'Temporary password for grace@acme.test',
    description: 'Shown once. Hand it over yourself — the app does not send email.',
    value: 'q7Rt-2mXv-9KpL-4sWn',
  },
};
