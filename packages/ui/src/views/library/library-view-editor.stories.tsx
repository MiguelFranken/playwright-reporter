import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { libraryFlows, savedViews } from '../../fixtures/library-views';
import { DEFAULT_LIBRARY_VIEW, matchesLibraryFilters, type LibraryViewConfig } from '../../lib/library-views';
import { LibraryViewEditor } from './library-view-editor';

const countFor = (config: LibraryViewConfig) => libraryFlows.filter((f) => matchesLibraryFilters(f, config.filters)).length;

const meta = {
  title: 'Views/Library/Browser/LibraryViewEditor',
  component: LibraryViewEditor,
  args: {
    open: true,
    onOpenChange: fn(),
    mode: 'create',
    initialConfig: DEFAULT_LIBRARY_VIEW,
    variants: ['desktop', 'mobile'],
    countFor,
    total: libraryFlows.length,
    onSubmit: fn(),
  },
} satisfies Meta<typeof LibraryViewEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new view: name it, pick what it shows and how, and see how many flows it would hold as you go. */
export const Create: Story = {
  play: async ({ args }) => {
    const dialog = within(await within(document.body).findByRole('dialog', { name: 'New view' }));
    await expect(dialog.getByRole('button', { name: 'Create view' })).toBeDisabled();
    await userEvent.type(dialog.getByRole('textbox', { name: 'Name' }), 'Critical to verify');
    await userEvent.click(dialog.getByRole('button', { name: /Ready to verify/ }));
    await userEvent.click(dialog.getByRole('button', { name: /Critical/ }));
    await expect(dialog.getByText(/Shows/)).toHaveTextContent('Shows 1 of 4 flows');
    await userEvent.click(dialog.getByRole('button', { name: 'Files' }));
    await userEvent.click(dialog.getByRole('button', { name: 'mobile' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Create view' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: 'Critical to verify',
      config: { ...DEFAULT_LIBRARY_VIEW, filters: { states: ['verify'], priorities: ['critical'], ignore: [] }, folders: 'file', variant: 'mobile' },
    });
  },
};

/** A saved view, opened to change: its name and settings come filled in. */
export const Edit: Story = { args: { mode: 'edit', initialName: savedViews[0].name, initialConfig: savedViews[0].config } };

/** Settings that show nothing: the count says so before the view is saved. */
export const ShowsNothing: Story = {
  args: { initialName: 'Low and waiting', initialConfig: { ...DEFAULT_LIBRARY_VIEW, filters: { states: ['waiting'], priorities: ['low'] } } },
  play: async () => {
    const dialog = within(await within(document.body).findByRole('dialog', { name: 'New view' }));
    await expect(dialog.getByText(/Shows/)).toHaveTextContent('Shows 0 of 4 flows');
  },
};

/** The host refused the name. */
export const WithError: Story = { args: { initialName: 'To fix', error: '“To fix” is a built-in view. Choose another name.' } };

/** A library with one variant has nothing to choose there. */
export const OneVariant: Story = { args: { variants: ['desktop'] } };

export const Saving: Story = { args: { initialName: 'Checkout fixes', pending: true } };
