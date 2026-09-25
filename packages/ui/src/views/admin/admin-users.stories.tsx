import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Card, CardContent } from '../../components/card';
import { ADMIN_USERS } from '../../fixtures/teams';
import { AdminUsers, CreateUserDialog } from './admin-users';

const meta = {
  title: 'Views/Admin/Users',
  component: AdminUsers,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    users: ADMIN_USERS,
    currentUserId: 'u-ada',
    query: '',
    onSearch: fn(),
    secret: null,
    onSecretDismiss: fn(),
    createOpen: false,
    onCreateOpenChange: fn(),
    onCreate: fn(),
    onRoleChange: fn(),
    onTemporaryPassword: fn(),
    onBanToggle: fn(),
    toDelete: null,
    onDeleteRequest: fn(),
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <Card className="max-w-5xl gap-0 py-0">
        <CardContent flush>
          <Story />
        </CardContent>
      </Card>
    ),
  ],
} satisfies Meta<typeof AdminUsers>;

export default meta;
type Story = StoryObj<typeof meta>;

/** You cannot ban, delete or demote yourself; everyone else gets every action. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Instance role of Ada Lovelace' })).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: 'Delete Ada Lovelace' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Unban' }));
    await expect(args.onBanToggle).toHaveBeenCalledWith(ADMIN_USERS[2]);
    await userEvent.click(canvas.getAllByRole('button', { name: 'Password' })[1]!);
    await expect(args.onTemporaryPassword).toHaveBeenCalledWith(ADMIN_USERS[1]);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search name or email' }), 'grace');
    await userEvent.click(canvas.getByRole('button', { name: 'Search' }));
    await expect(args.onSearch).toHaveBeenCalledWith('grace');
  },
};

export const WithSecret: Story = {
  args: { secret: { title: 'Temporary password', email: 'grace@acme.test', value: 'q7Rt-2mXv-9KpL-4sWn' } },
};

export const ConfirmingDelete: Story = {
  args: { toDelete: ADMIN_USERS[1] },
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'Delete Grace Hopper?' }));
    await userEvent.click(d.getByRole('button', { name: 'Delete user' }));
    await expect(args.onDelete).toHaveBeenCalledWith(ADMIN_USERS[1]);
  },
};

export const Pending: Story = {
  args: { pendingId: 'u-grace' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('button', { name: 'Password' })[1]).toBeDisabled();
  },
};

export const CreateUser: StoryObj<typeof CreateUserDialog> = {
  render: (args) => <CreateUserDialog {...args} />,
  args: { open: true, onOpenChange: fn(), onSubmit: fn() },
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'New user' }));
    await expect(d.getByRole('button', { name: 'Create user' })).toBeDisabled();
    await userEvent.type(d.getByLabelText('Email'), 'margaret@acme.test');
    await userEvent.type(d.getByLabelText('Name'), 'Margaret Hamilton');
    await userEvent.click(d.getByRole('button', { name: 'Create user' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ email: 'margaret@acme.test', name: 'Margaret Hamilton', role: 'user' });
  },
};
