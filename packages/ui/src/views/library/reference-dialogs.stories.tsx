import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { mainReference, mainRuns, redesignReference, redesignRuns, releaseReference } from '../../fixtures/library';
import { NOW } from '../../fixtures/now';
import { LibraryReferenceDialog } from './reference-dialogs';

const meta = {
  title: 'Views/Library/Dialogs/LibraryReferenceDialog',
  component: LibraryReferenceDialog,
  args: { open: true, onOpenChange: fn(), reference: redesignReference, runs: redesignRuns, onSave: fn(), onRemove: fn(), now: NOW },
} satisfies Meta<typeof LibraryReferenceDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Naming a kept pull request for readers and saving it. */
export const Default: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    const name = await body.findByRole('textbox', { name: 'Name' });
    await userEvent.type(name, 'New checkout');
    await userEvent.click(body.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(args.onSave).toHaveBeenCalledWith(expect.objectContaining({ keep: true, title: 'New checkout', pin: 'latest' })));
  },
};

export const PinnedRelease: Story = { args: { reference: releaseReference, runs: mainRuns } };

/** The default branch nobody kept: nothing to remove. */
export const DefaultBranch: Story = { args: { reference: mainReference, runs: mainRuns, onRemove: undefined } };

export const Saving: Story = { args: { pending: true } };

export const Failed: Story = { args: { error: 'Run #999 is not a run of pull request #212 with review checkpoints.' } };
