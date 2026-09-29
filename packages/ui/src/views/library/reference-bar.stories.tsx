import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { libraryReferences, mainReference, redesignReference, releaseReference, unkeptReference } from '../../fixtures/library';
import { NOW } from '../../fixtures/now';
import { LibraryReferenceBar } from './reference-bar';

const meta = {
  title: 'Views/Library/ReferenceBar',
  component: LibraryReferenceBar,
  args: { references: libraryReferences, current: mainReference, onReferenceChange: fn(), onSettings: fn(), onKeep: fn(), runHref: (n: number) => `#run-${n}`, now: NOW },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof LibraryReferenceBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default branch, following its newest run. */
export const Default: Story = {
  parameters: {
    // Base UI's aria-hidden, tabbable focus guards around the open menu. Same exception as Views/Shell/AppSidebar.
    a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Showing main/ }));
    const body = within(document.body);
    await userEvent.click(await body.findByRole('menuitem', { name: /212/ }));
    await expect(args.onReferenceChange).toHaveBeenCalledWith({ kind: 'pull_request', prNumber: 212 });
  },
};

/** A named branch pinned to a release run, with a description for readers. */
export const Pinned: Story = { args: { current: releaseReference } };

/** A kept pull request with changes waiting: the developer's way back to the review. */
export const PullRequestWithChanges: Story = {
  args: { current: redesignReference, reviewHref: '#review-483' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Review 7 changes/ })).toHaveAttribute('href', '#review-483');
  },
};

/** Readers who may not change the library get no settings. */
export const ReadOnly: Story = { args: { onSettings: undefined } };

export const NothingCapturedYet: Story = { args: { current: { ...mainReference, latestRun: null, latestCounts: null } } };

/** A pull request opened from its own page, not kept yet: one click keeps it. */
export const NotKept: Story = {
  args: { current: unkeptReference },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Keep in library/ }));
    await expect(args.onKeep).toHaveBeenCalled();
    await expect(canvas.queryByRole('button', { name: /Settings/ })).toBeNull();
  },
};

/** Picking another reference to compare every screen with. */
export const CompareWith: Story = {
  args: { onCompareChange: fn() },
  // Base UI's focus guards around the open menu (see packages/ui/AGENTS.md).
  parameters: { a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } } },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(body.getByRole('button', { name: 'Compare with…' }));
    const item = await body.findByRole('menuitem', { name: /212/ });
    await userEvent.click(item);
    await expect(args.onCompareChange).toHaveBeenCalledWith(redesignReference.key);
  },
};

/** Comparing: the button names the other reference, and stopping is one click. */
export const Comparing: Story = {
  args: { current: redesignReference, compareWith: mainReference, onCompareChange: fn() },
  // Base UI's focus guards around the open menu (see packages/ui/AGENTS.md).
  parameters: { a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } } },
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(body.getByText(/Every screen is compared with/)).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: /Compared with/ }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Stop comparing' }));
    await expect(args.onCompareChange).toHaveBeenCalledWith(null);
  },
};
