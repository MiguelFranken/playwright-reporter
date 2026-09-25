import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LoginForm } from './login-form';

const meta = {
  title: 'Views/Auth/Login',
  component: LoginForm,
  parameters: { layout: 'centered' },
  tags: ['themed'],
  args: { onSubmit: fn(), className: 'w-96' },
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole('button', { name: 'Sign in' });
    await expect(submit).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Email'), 'ada@acme.test');
    await userEvent.type(canvas.getByLabelText('Password'), 'correct horse');
    await userEvent.click(canvas.getByRole('button', { name: 'Show password' }));
    await expect(canvas.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await userEvent.click(submit);
    await expect(args.onSubmit).toHaveBeenCalledWith({ email: 'ada@acme.test', password: 'correct horse' });
  },
};

/** An invitation names the account: the email is locked and the password is focused. */
export const PrefilledEmail: Story = {
  args: { email: 'margaret@acme.test', hint: 'Sign in to accept the invitation to Acme.' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Email')).toHaveAttribute('readonly');
  },
};

export const SigningIn: Story = { args: { email: 'ada@acme.test', pending: true } };

export const WithError: Story = {
  args: { error: 'Invalid email or password' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent('Invalid email or password');
  },
};
