import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CreateAccountForm, JoinTeamButton, SignOutButton, WrongAccountNotice } from './invitation';

const meta = {
  title: 'Views/Auth/Invitation',
  component: CreateAccountForm,
  parameters: { layout: 'centered' },
  tags: ['themed'],
  args: { email: 'margaret@acme.test', onSubmit: fn() },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CreateAccountForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Submit arms once there is a name, a 10-character password and a matching repeat. */
export const CreateAccount: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole('button', { name: 'Create account and join' });
    await userEvent.type(canvas.getByLabelText('Your name'), 'Margaret Hamilton');
    await userEvent.type(canvas.getByLabelText('Password'), 'apollo-eleven');
    await userEvent.type(canvas.getByLabelText('Repeat password'), 'apollo-11');
    await expect(canvas.getByText('The passwords do not match.')).toBeVisible();
    await expect(submit).toBeDisabled();
    await userEvent.clear(canvas.getByLabelText('Repeat password'));
    await userEvent.type(canvas.getByLabelText('Repeat password'), 'apollo-eleven');
    await userEvent.click(submit);
    await expect(args.onSubmit).toHaveBeenCalledWith({ name: 'Margaret Hamilton', password: 'apollo-eleven', confirm: 'apollo-eleven' });
  },
};

export const CreateAccountError: Story = { args: { error: 'This invitation has expired. Ask for a new link.' } };

export const Join: StoryObj<typeof JoinTeamButton> = {
  render: (args) => <JoinTeamButton {...args} />,
  args: { teamName: 'Acme', onJoin: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Join Acme' }));
    await expect(args.onJoin).toHaveBeenCalled();
  },
};

export const Joining: StoryObj<typeof JoinTeamButton> = {
  render: (args) => <JoinTeamButton {...args} />,
  args: { teamName: 'Acme', onJoin: fn(), pending: true },
};

export const WrongAccount: StoryObj<typeof WrongAccountNotice> = {
  render: (args) => <WrongAccountNotice {...args} />,
  args: {
    invitedEmail: 'margaret@acme.test',
    currentEmail: 'ada@acme.test',
    children: <SignOutButton onSignOut={fn()} />,
  },
};
