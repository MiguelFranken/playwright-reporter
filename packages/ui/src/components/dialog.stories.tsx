import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Button } from './button';

const meta = {
  title: 'Primitives/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
  args: { onOpenChange: fn() },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const DeleteDialog = (args: React.ComponentProps<typeof Dialog>) => (
  <Dialog {...args}>
    <DialogTrigger render={<Button variant="outline" />}>Delete project</DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete web-e2e?</DialogTitle>
        <DialogDescription>
          Every run, result and artifact goes with it. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button variant="destructive">Delete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const Default: Story = { render: DeleteDialog };

export const InitiallyOpen: Story = { render: DeleteDialog, args: { defaultOpen: true } };

/**
 * Base UI portals the popup outside the story canvas, so everything after the
 * trigger click is queried from the document body.
 */
export const OpensAndCloses: Story = {
  render: DeleteDialog,
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /delete project/i }));

    const dialog = await body.findByRole('dialog');
    await expect(dialog).toHaveTextContent(/delete web-e2e\?/i);
    await expect(args.onOpenChange).toHaveBeenCalledWith(true, expect.anything());

    await userEvent.click(body.getByRole('button', { name: /^cancel$/i }));
    // The popup plays a closing animation before it unmounts.
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
  },
};

/** Escape closes, and focus returns to the control that opened it. */
export const EscapeRestoresFocus: Story = {
  render: DeleteDialog,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: /delete project/i });
    await userEvent.click(trigger);
    await within(document.body).findByRole('dialog');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};

/** The dialog is labelled by its title, which is what a screen reader announces. */
export const IsLabelled: Story = {
  render: DeleteDialog,
  args: { defaultOpen: true },
  play: async () => {
    const dialog = await within(document.body).findByRole('dialog', { name: /delete web-e2e\?/i });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};
