import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ForceDeleteStorage } from './force-delete-storage';

const meta = {
  title: 'Views/Admin/ForceDeleteStorage',
  component: ForceDeleteStorage,
  tags: ['themed'],
  args: { open: false, onOpenChange: fn(), expected: 'delete all artifacts', onConfirm: fn() },
} satisfies Meta<typeof ForceDeleteStorage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Closed: the button asks for the dialog and does nothing else. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Force delete' }));
    await expect(args.onOpenChange).toHaveBeenCalledWith(true);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};

/** The confirm button only arms once the phrase is typed exactly. */
export const Confirming: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog', { name: 'Delete every artifact' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete all artifacts' });
    await expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Confirmation'), 'delete all artifacts');
    await userEvent.click(confirm);
    await expect(args.onConfirm).toHaveBeenCalledWith('delete all artifacts');
  },
};

export const Pending: Story = {
  args: { open: true, pending: true },
  play: async () => {
    const dialog = await within(document.body).findByRole('dialog');
    await expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  },
};
