import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { INVITATION_LINK, INVITATIONS, MEMBERS } from '../../fixtures/teams';
import { InviteDialog, TeamMembers } from './team-members';

const OPEN_SELECT_A11Y = {
  a11y: {
    config: {
      // Base UI's focus guards around an open listbox. Same exception as Primitives/Select.
      rules: [
        { id: 'aria-input-field-name', enabled: false },
        { id: 'aria-hidden-focus', enabled: false },
      ],
    },
  },
} as const;

const meta = {
  title: 'Views/Teams/Members',
  component: TeamMembers,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    members: MEMBERS,
    invitations: INVITATIONS,
    currentUserId: 'u-ada',
    canManage: true,
    link: null,
    onLinkDismiss: fn(),
    inviteOpen: false,
    onInviteOpenChange: fn(),
    onInvite: fn(),
    onRoleChange: fn(),
    onRemove: fn(),
    onNewLink: fn(),
    onRevokeInvitation: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-4xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TeamMembers>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An admin's view: roles are editable, members removable, invitations re-linkable. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('(you)')).toBeVisible();
    await expect(canvas.getByText('banned')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Grace Hopper' }));
    await expect(args.onRemove).toHaveBeenCalledWith(MEMBERS[1]);
    await userEvent.click(canvas.getAllByRole('button', { name: 'New link' })[0]!);
    await expect(args.onNewLink).toHaveBeenCalledWith(INVITATIONS[0]);
    await userEvent.click(canvas.getAllByRole('button', { name: 'Revoke' })[1]!);
    await expect(args.onRevokeInvitation).toHaveBeenCalledWith(INVITATIONS[1]);
  },
};

export const ChangesARole: Story = {
  parameters: OPEN_SELECT_A11Y,
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Role of Grace Hopper' }));
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Admin' }));
    await expect(args.onRoleChange).toHaveBeenCalledWith(MEMBERS[1], 'admin');
  },
};

/** A member without the right to manage sees badges, no controls. */
export const ReadOnly: Story = {
  args: { canManage: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Invite' })).toBeNull();
    await expect(canvas.queryByRole('combobox')).toBeNull();
  },
};

export const NoInvitations: Story = { args: { invitations: [] } };

/** The link just created, shown once. */
export const WithInvitationLink: Story = {
  args: { link: INVITATION_LINK },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(INVITATION_LINK.url)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
    await expect(args.onLinkDismiss).toHaveBeenCalled();
  },
};

export const Pending: Story = {
  args: { pendingMemberId: 'u-grace', pendingInvitationId: 'inv-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Remove Grace Hopper' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Remove Linus Torvalds' })).toBeEnabled();
  },
};

type DialogStory = StoryObj<typeof InviteDialog>;

/** Pick a role, read what it allows, then create a link or add an existing account. */
export const Invite: DialogStory = {
  parameters: OPEN_SELECT_A11Y,
  render: (args) => <InviteDialog {...args} />,
  args: { open: true, onOpenChange: fn(), onSubmit: fn() },
  play: async ({ args }) => {
    const body = within(document.body);
    const d = within(await body.findByRole('dialog', { name: 'Invite to this team' }));
    await expect(d.getByRole('button', { name: 'Create link' })).toBeDisabled();
    await userEvent.type(d.getByLabelText('Email'), 'margaret@acme.test');
    await userEvent.click(d.getByRole('combobox', { name: 'Role' }));
    await userEvent.click(await body.findByRole('option', { name: 'Viewer' }));
    await expect(d.getByText(/Read-only/)).toBeVisible();
    await userEvent.click(d.getByRole('button', { name: 'Create link' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ email: 'margaret@acme.test', role: 'viewer', mode: 'link' });
    await userEvent.click(d.getByRole('button', { name: 'Add existing user' }));
    await expect(args.onSubmit).toHaveBeenLastCalledWith({ email: 'margaret@acme.test', role: 'viewer', mode: 'add' });
  },
};
