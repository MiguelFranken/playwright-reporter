import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { mainReference, redesignReference, releaseReference, unkeptReference } from '../../fixtures/library';
import { NOW } from '../../fixtures/now';
import { LibraryCard } from './library-card';

const meta = {
  title: 'Views/Library/LibraryCard',
  component: LibraryCard,
  args: { reference: unkeptReference, reviewHref: '#review-482', libraryHref: '#library-pr-209', onKeep: fn(), onSettings: fn(), now: NOW },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof LibraryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A pull request not in the library yet: keep it, or just look. */
export const NotKept: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Keep in library' }));
    await expect(args.onKeep).toHaveBeenCalled();
    await expect(canvas.getByRole('button', { name: /Browse its screens/ })).toHaveAttribute('href', '#library-pr-209');
    await expect(canvas.getByRole('button', { name: /Review changes/ })).toHaveAttribute('href', '#review-482');
  },
};

export const KeptFollowingNewest: Story = { args: { reference: redesignReference } };

export const KeptPinned: Story = { args: { reference: releaseReference } };

/** The default branch: always in the library, nothing waiting. */
export const DefaultBranch: Story = { args: { reference: mainReference, reviewHref: '#review-481' } };

export const Keeping: Story = { args: { pending: true } };

export const ReadOnly: Story = { args: { onKeep: undefined, onSettings: undefined } };

export const NoRunsYet: Story = { args: { reference: { ...unkeptReference, latestRun: null, latestCounts: null }, reviewHref: null } };
