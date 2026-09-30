import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { libraryFlows } from '../../fixtures/library-views';
import { DEFAULT_LIBRARY_VIEW, libraryCounts, type LibraryViewConfig } from '../../lib/library-views';
import { LibraryDisplayMenu, LibraryFilterChips, LibraryFilterMenu, ViewSaveControls } from './library-toolbar';

const counts = libraryCounts(libraryFlows);

/** The toolbar's controls as the browser lays them out, keeping their settings like a host would. */
function Toolbar({ initial, onChange }: { initial: LibraryViewConfig; onChange: (next: LibraryViewConfig) => void }) {
  const [config, setConfig] = useState(initial);
  const change = (next: LibraryViewConfig) => {
    setConfig(next);
    onChange(next);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LibraryFilterMenu config={config} onChange={change} counts={counts} />
      <LibraryFilterChips config={config} onChange={change} />
      <LibraryDisplayMenu config={config} onChange={change} />
    </div>
  );
}

const meta = {
  title: 'Views/Library/Browser/LibraryToolbar',
  component: Toolbar,
  args: { initial: DEFAULT_LIBRARY_VIEW, onChange: fn() },
  decorators: [(Story) => <div className="bg-surface p-4">{Story()}</div>],
  tags: ['themed'],
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ticking a state and a priority: each becomes a chip, removed with its ×. */
export const Filters: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('button', { name: /Filter/ }));
    await userEvent.click(await body.findByRole('menuitemcheckbox', { name: /Ready to verify/ }));
    await userEvent.click(body.getByRole('menuitemcheckbox', { name: /Critical/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { states: ['verify'], priorities: ['critical'] } }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await canvas.findByRole('button', { name: 'Remove the priority filter' }));
    await expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { states: ['verify'], priorities: [] } }));
  },
};

/** Grouping and order. */
export const Display: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Display/ }));
    // Priority is both a grouping and an order: the first is the grouping.
    const [group] = await within(document.body).findAllByRole('menuitemradio', { name: 'Priority' });
    await userEvent.click(group);
    await expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ group: 'priority' }));
  },
};

export const WithFilters: Story = { args: { initial: { ...DEFAULT_LIBRARY_VIEW, filters: { states: ['waiting', 'verify', 'needs-review'], priorities: ['critical', 'high', 'none'] }, group: 'state' } } };

/** Changed from a saved view: reset, save into it, or save as a new one. */
export const SaveControls: Story = {
  render: () => <ViewSaveControls modified savedViewName="Checkout fixes" canSave onReset={fn()} onSave={fn()} onSaveAs={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Save as new' })).toBeInTheDocument();
  },
};
