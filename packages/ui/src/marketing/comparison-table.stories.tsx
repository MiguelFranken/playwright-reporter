import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { comparisonColumns, comparisonRows } from '../fixtures/marketing';
import { ComparisonTable } from './comparison-table';

const meta = {
  title: 'Marketing/ComparisonTable',
  component: ComparisonTable,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    header: { heading: 'How it compares', intro: <p>Facts, not marketing. Where we do less, it says so.</p> },
    columns: comparisonColumns,
    rows: comparisonRows,
    footnote: <p>Checked against Playwright 1.63 and the vendors&rsquo; public documentation.</p>,
  },
} satisfies Meta<typeof ComparisonTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The abridged version the home page carries, above a link to the full page. */
export const Abridged: Story = {
  args: {
    columns: comparisonColumns.slice(0, 2),
    rows: comparisonRows.slice(0, 3).map((row) => ({ ...row, cells: row.cells.slice(0, 2) })),
    footnote: null,
  },
};

/** Cell state has to survive without colour, so each one carries a label. */
export const StatesAreLabelled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Partly.').length).toBeGreaterThan(0);
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
