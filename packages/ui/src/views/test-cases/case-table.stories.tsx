import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NOW } from '../../fixtures/now';
import { caseRows, longCaseRow } from '../../fixtures/test-cases';
import { CaseTable, type CaseTableProps } from './case-table';

function Selectable(props: CaseTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-s" role="status">
        {selected.size} selected
      </p>
      <CaseTable {...props} selectable selected={selected} onSelectedChange={(next) => { setSelected(next); props.onSelectedChange?.(next); }} />
    </div>
  );
}

const meta = {
  title: 'Views/TestCases/Library/CaseTable',
  component: CaseTable,
  tags: ['themed'],
  args: {
    rows: caseRows,
    hrefs: { case: (n: number) => `/cases/${n}` },
    now: NOW,
    showSuite: true,
    sort: 'position',
    dir: 'asc',
    onSortChange: fn(),
    onSelectedChange: fn(),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CaseTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('link', { name: /TC-1: Log in with valid credentials/ })).toHaveAttribute('href', '/cases/1');
    await expect(c.getAllByText('Automated (unverified)')).toHaveLength(1);
    await userEvent.click(c.getByRole('button', { name: /Priority/ }));
    await expect(args.onSortChange).toHaveBeenCalledWith('priority', 'asc');
  },
};

/** The header box selects every row shown; ticking one row of all makes it indeterminate. */
export const WithSelection: Story = {
  render: (args) => <Selectable {...args} />,
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('checkbox', { name: 'Select every case shown' }));
    await expect(c.getByRole('status')).toHaveTextContent('6 selected');
    await userEvent.click(c.getByRole('checkbox', { name: 'Select TC-3' }));
    await expect(c.getByRole('status')).toHaveTextContent('5 selected');
    await expect(args.onSelectedChange).toHaveBeenCalledTimes(2);
  },
};

export const InSuiteOrder: Story = {
  args: { showSuite: false, rows: caseRows.slice(0, 4), onReorder: fn(), onSortChange: undefined },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('button', { name: 'Move TC-1 up' })).toBeDisabled();
    await userEvent.click(c.getByRole('button', { name: 'Move TC-2 up' }));
    await expect(args.onReorder).toHaveBeenCalledWith(expect.objectContaining({ number: 2 }), 'up');
  },
};

export const LongText: Story = { args: { rows: [longCaseRow, ...caseRows.slice(0, 2)] } };

export const Pending: Story = { args: { isPending: true } };
