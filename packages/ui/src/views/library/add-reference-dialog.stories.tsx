import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { libraryCandidates } from '../../fixtures/library';
import { AddLibraryReferenceDialog } from './reference-dialogs';

const meta = {
  title: 'Views/Library/Dialogs/AddLibraryReferenceDialog',
  component: AddLibraryReferenceDialog,
  args: { open: true, onOpenChange: fn(), ...libraryCandidates, kept: ['branch:main', 'pr:212'], onAdd: fn() },
} satisfies Meta<typeof AddLibraryReferenceDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Keeping a pull request: the ones already kept are not offered again. */
export const Default: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole('radio', { name: 'Pull request' }));
    await userEvent.click(body.getByRole('button', { name: 'Add to library' }));
    await waitFor(() => expect(args.onAdd).toHaveBeenCalledWith({ kind: 'pull_request', prNumber: 209 }, expect.objectContaining({ keep: true })));
  },
};

export const EverythingKept: Story = { args: { branches: ['main'], pullRequests: [], kept: ['branch:main'] } };

export const Adding: Story = { args: { pending: true } };
