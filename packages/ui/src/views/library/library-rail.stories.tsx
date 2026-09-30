import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PENDING_STATE_A11Y } from '../../fixtures/a11y';
import { allViews, savedViews } from '../../fixtures/library-views';
import { BUILT_IN_VIEWS } from '../../lib/library-views';
import { LibraryViewList } from './library-rail';

const counts = { all: 48, feedback: 6, 'to-fix': 4, 'to-verify': 2, 'to-review': 11, 'view-checkout': 3, 'view-mobile': 5 };

const meta = {
  title: 'Views/Library/Browser/LibraryViewList',
  component: LibraryViewList,
  args: { views: allViews, activeId: 'all', counts, onSelect: fn(), onRename: fn(), onDelete: fn() },
  decorators: [(Story) => <div className="w-60 bg-surface p-3">{Story()}</div>],
  tags: ['themed'],
} satisfies Meta<typeof LibraryViewList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /All flows/ })).toHaveAttribute('aria-current', 'true');
    await userEvent.click(canvas.getByRole('button', { name: /To verify/ }));
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'to-verify' }));
  },
};

/** A saved view on screen, changed since it was saved. */
export const SavedAndChanged: Story = { args: { activeId: savedViews[0].id, modified: true } };

/** A saved view's menu: rename it in place, or delete it. */
export const RenamesAndDeletes: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for the view Checkout fixes' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Rename' }));
    const name = await canvas.findByRole('textbox', { name: 'Rename the view Checkout fixes' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Checkout, high priority{Enter}');
    await expect(args.onRename).toHaveBeenCalledWith(expect.objectContaining({ id: savedViews[0].id }), 'Checkout, high priority');
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for the view Mobile to review' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Delete' }));
    await expect(args.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: savedViews[1].id }));
    await waitFor(() => expect(document.querySelector('[data-base-ui-focus-guard]')).toBeNull());
  },
};

/** Nobody saved a view yet: how to. */
export const NoSavedViews: Story = { args: { views: BUILT_IN_VIEWS } };

// The dimmed row is the pending affordance (see PENDING_STATE_A11Y).
export const Saving: Story = { args: { pendingId: savedViews[1].id }, parameters: PENDING_STATE_A11Y };
