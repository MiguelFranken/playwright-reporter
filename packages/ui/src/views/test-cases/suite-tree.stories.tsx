import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { longSuiteTree, suiteTree } from '../../fixtures/test-cases';
import { SuiteTree } from './suite-tree';

const hrefs = { all: '/cases', unassigned: '/cases?suite=unassigned', suite: (id: string) => `/cases?suite=${id}` };

const meta = {
  title: 'Views/TestCases/Library/SuiteTree',
  component: SuiteTree,
  tags: ['themed'],
  args: {
    roots: suiteTree,
    total: 21,
    unassigned: 3,
    selected: 's-payment',
    hrefs,
    canEdit: true,
    onNewSuite: fn(),
    onEditSuite: fn(),
    onDeleteSuite: fn(),
    onMoveSuite: fn(),
  },
  decorators: [(Story) => <div className="w-72">{<Story />}</div>],
  parameters: {
    layout: 'padded',
    // Base UI's aria-hidden, tabbable focus guards around the open menu. Same exception as Views/Shell/AppSidebar.
    a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } },
  },
} satisfies Meta<typeof SuiteTree>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The path to the selected suite is open; counts cover each whole subtree. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('link', { name: /Payment/ })).toHaveAttribute('aria-current', 'page');
    await expect(c.getByRole('link', { name: /Cards/ })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: 'Collapse Checkout' }));
    await expect(c.queryByRole('link', { name: /Payment/ })).toBeNull();

    await userEvent.click(c.getByRole('button', { name: 'Actions for Search' }));
    await userEvent.click(await within(document.body).findByRole('menuitem', { name: 'New sub-suite' }));
    await expect(args.onNewSuite).toHaveBeenCalledWith('s-search');

    await userEvent.click(c.getByRole('button', { name: 'New suite' }));
    await expect(args.onNewSuite).toHaveBeenCalledWith(null);
  },
};

export const Deleting: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: 'Actions for Search' }));
    await userEvent.click(await within(document.body).findByRole('menuitem', { name: 'Delete suite' }));
    await expect(args.onDeleteSuite).toHaveBeenCalledWith(expect.objectContaining({ id: 's-search' }));
  },
};

export const AllCases: Story = { args: { selected: null } };

export const ReadOnly: Story = {
  args: { canEdit: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'New suite' })).toBeNull();
  },
};

export const NoSuites: Story = { args: { roots: [], total: 4, unassigned: 4, selected: 'unassigned' } };

export const LongNames: Story = { args: { roots: longSuiteTree, selected: 's-long' } };
