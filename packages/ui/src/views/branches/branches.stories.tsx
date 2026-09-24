import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { branchHeader, branchList, sparseBranchHeader } from '../../fixtures/branches';
import { NOW } from '../../fixtures/now';
import { RangeToggle } from '../../patterns/filter-controls';
import { BranchHeader, BranchHeaderSkeleton } from './branch-header';
import { BranchesTable } from './branches-table';

const hrefs = { run: (n: number) => `#run-${n}`, branch: (name: string) => `#branch-${name}` };

const meta = {
  title: 'Views/Branches',
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Table: Story = { render: () => <BranchesTable hrefs={hrefs} rows={branchList} now={NOW} /> };

export const TableEmpty: Story = {
  render: () => <BranchesTable hrefs={hrefs} rows={[]} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no runs in this range/i)).toBeVisible();
  },
};

/** Each branch opens its page; the last-run link still goes to that run. */
export const TableLinks: Story = {
  render: () => <BranchesTable hrefs={hrefs} rows={branchList} now={NOW} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'feature/checkout-guest-cart' })).toHaveAttribute('href', '#branch-feature/checkout-guest-cart');
    await expect(canvas.getByRole('link', { name: /#482/ })).toHaveAttribute('href', '#run-482');
  },
};

/** Runs without a branch still group together, but there is no page to open. */
export const TableNoBranch: Story = {
  render: () => <BranchesTable hrefs={hrefs} rows={branchList.filter((r) => r.branch === null)} now={NOW} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No branch')).toBeVisible();
    await expect(canvas.queryAllByRole('link', { name: 'No branch' })).toHaveLength(0);
  },
};

export const Header: Story = {
  render: () => (
    <BranchHeader branch={branchHeader} hrefs={hrefs} now={NOW}>
      <RangeToggle value="30" onValueChange={fn()} />
    </BranchHeader>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'feature/checkout-guest-cart' })).toBeVisible();
    // Only the first line of the commit message.
    await expect(canvas.getByRole('link', { name: /#481 · fix\(checkout\): keep the guest cart when signing in$/ })).toHaveAttribute('href', '#run-481');
  },
};

export const HeaderSparse: Story = { render: () => <BranchHeader branch={sparseBranchHeader} hrefs={hrefs} now={NOW} /> };

export const HeaderLoading: Story = { render: () => <BranchHeaderSkeleton /> };
