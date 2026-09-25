import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ChangeNameForm, ChangePasswordForm, SessionsList } from './account-forms';

const meta = {
  title: 'Views/Account/Forms',
  component: ChangeNameForm,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { name: 'Ada Lovelace', onSubmit: fn() },
} satisfies Meta<typeof ChangeNameForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Save arms once the trimmed name differs; the trimmed name is submitted. */
export const DisplayName: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Display name'), ' King ');
    await userEvent.click(save);
    await expect(args.onSubmit).toHaveBeenCalledWith('Ada Lovelace King');
  },
};

export const Password: StoryObj<typeof ChangePasswordForm> = {
  render: (args) => <ChangePasswordForm {...args} />,
  args: { onSubmit: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole('button', { name: 'Change password' });
    await userEvent.type(canvas.getByLabelText('Current password'), 'old-password');
    await userEvent.type(canvas.getByLabelText('New password'), 'short');
    await expect(submit).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('New password'), '-but-now-long');
    await userEvent.type(canvas.getByLabelText('Repeat new password'), 'short-but-now-long');
    await userEvent.click(submit);
    await expect(args.onSubmit).toHaveBeenCalledWith({ current: 'old-password', next: 'short-but-now-long' });
  },
};

export const Sessions: StoryObj<typeof SessionsList> = {
  render: (args) => <SessionsList {...args} />,
  args: {
    onRevokeOthers: fn(),
    sessions: [
      {
        id: 's1',
        createdAt: '9/18/2026, 8:02:11 AM',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        ipAddress: '203.0.113.42',
      },
      { id: 's2', createdAt: '9/15/2026, 6:40:03 PM', userAgent: null, ipAddress: null },
    ],
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Sign out everywhere else' }));
    await expect(args.onRevokeOthers).toHaveBeenCalled();
  },
};

export const SessionsLoading: StoryObj<typeof SessionsList> = {
  render: (args) => <SessionsList {...args} />,
  args: { sessions: null, onRevokeOthers: fn() },
};
