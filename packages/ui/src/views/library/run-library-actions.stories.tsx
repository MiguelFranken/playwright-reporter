import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { redesignReference, releaseReference } from '../../fixtures/library';
import { RunLibraryActions } from './run-library-actions';

const meta = {
  title: 'Views/Library/RunLibraryActions',
  component: RunLibraryActions,
  args: { reference: redesignReference, runNumber: 483, libraryHref: '#library-pr-212', onPin: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RunLibraryActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Pin to library/ }));
    await expect(args.onPin).toHaveBeenCalled();
  },
};

/** The run the library already shows for its branch. */
export const AlreadyPinned: Story = { args: { reference: releaseReference, runNumber: 470 } };

export const Pinning: Story = { args: { pending: true } };

export const ReadOnly: Story = { args: { onPin: undefined } };
