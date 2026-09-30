import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { allViews, savedViews } from '../../fixtures/library-views';
import { BUILT_IN_VIEWS } from '../../lib/library-views';
import { LibraryViewList } from './library-rail';

const counts = { all: 48, feedback: 6, 'to-fix': 4, 'to-verify': 2, 'to-review': 11, 'view-checkout': 3, 'view-mobile': 5 };

const meta = {
  title: 'Views/Library/Browser/LibraryViewList',
  component: LibraryViewList,
  args: { views: allViews, activeId: 'all', counts, onSelect: fn(), onRename: fn(), onDelete: fn(), onEdit: fn(), onDuplicate: fn(), onCreate: fn() },
  decorators: [(Story) => <div className="w-60 bg-surface p-3">{Story()}</div>],
  tags: ['themed'],
} satisfies Meta<typeof LibraryViewList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /^All flows/ })).toHaveAttribute('aria-current', 'true');
    await userEvent.click(canvas.getByRole('button', { name: /^To verify/ }));
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

/** A saved view opens in the view builder; any view, built in or not, can be duplicated into a new one. */
export const EditsAndDuplicates: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for the view Checkout fixes' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Edit view' }));
    await expect(args.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: savedViews[0].id }));
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    // A built-in view can only be duplicated.
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for the view To fix' }));
    const menu = within(await body.findByRole('menu'));
    await expect(menu.getAllByRole('menuitem')).toHaveLength(1);
    await userEvent.click(menu.getByRole('menuitem', { name: 'Duplicate' }));
    await expect(args.onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: 'to-fix' }));
    await userEvent.click(canvas.getByRole('button', { name: 'New view' }));
    await expect(args.onCreate).toHaveBeenCalled();
    await waitFor(() => expect(document.querySelector('[data-base-ui-focus-guard]')).toBeNull());
  },
};

/** Nobody saved a view yet: one click to create one. */
export const NoSavedViews: Story = {
  args: { views: BUILT_IN_VIEWS },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Create a view' }));
    await expect(args.onCreate).toHaveBeenCalled();
  },
};

/** Without write access: the views list, nothing to create or change. */
export const ReadOnly: Story = { args: { views: BUILT_IN_VIEWS, onRename: undefined, onDelete: undefined, onEdit: undefined, onDuplicate: undefined, onCreate: undefined } };

export const Saving: Story = { args: { pendingId: savedViews[1].id } };
