import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TypeToConfirmDialog } from './type-to-confirm-dialog';

const meta = {
  title: 'Patterns/TypeToConfirmDialog',
  component: TypeToConfirmDialog,
  tags: ['themed'],
  args: {
    open: true,
    onOpenChange: fn(),
    title: 'Delete Web shop',
    description: 'This removes every run, test result and artifact of this project. It cannot be undone.',
    expected: 'web',
    inputLabel: 'Project slug',
    confirmLabel: 'Delete project',
    pendingLabel: 'Deleting…',
    onConfirm: fn(),
  },
} satisfies Meta<typeof TypeToConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The button only arms once the slug is typed exactly. */
export const Default: Story = {
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog', { name: 'Delete Web shop' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete project' });
    const input = within(dialog).getByLabelText('Project slug');
    await expect(confirm).toBeDisabled();
    await userEvent.type(input, 'we');
    await expect(confirm).toBeDisabled();
    await userEvent.type(input, 'b');
    await userEvent.click(confirm);
    await expect(args.onConfirm).toHaveBeenCalledWith('web');
  },
};

export const Cancel: Story = {
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const Pending: Story = {
  play: async () => {
    const dialog = await within(document.body).findByRole('dialog');
    await expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  },
  args: { pending: true },
};
