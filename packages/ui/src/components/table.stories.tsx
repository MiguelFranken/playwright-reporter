import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from './table';

const ROWS = [
  { spec: 'tests/checkout.spec.ts', tests: 24, failed: 0, duration: '42s' },
  { spec: 'tests/auth/login.spec.ts', tests: 12, failed: 1, duration: '18s' },
  { spec: 'tests/admin/teams.spec.ts', tests: 31, failed: 0, duration: '1m 4s' },
];

const meta = {
  title: 'Primitives/Table',
  component: Table,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Spec</TableHead>
          <TableHead className="text-right">Tests</TableHead>
          <TableHead className="text-right">Failed</TableHead>
          <TableHead className="text-right">Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.spec}>
            <TableCell className="text-code-s">{row.spec}</TableCell>
            <TableCell className="text-right tabular-nums">{row.tests}</TableCell>
            <TableCell className="text-right tabular-nums">{row.failed}</TableCell>
            <TableCell className="text-right tabular-nums">{row.duration}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const WithFooterAndCaption: Story = {
  render: () => (
    <Table>
      <TableCaption>Specs in run 482.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Spec</TableHead>
          <TableHead className="text-right">Tests</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.spec}>
            <TableCell className="text-code-s">{row.spec}</TableCell>
            <TableCell className="text-right tabular-nums">{row.tests}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">67</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};

/**
 * Numbers must stay in a column as they change width, and long paths must not
 * push the numeric columns around. Both are the table's job, not the view's.
 */
export const LongPaths: Story = {
  render: () => (
    <div className="max-w-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Spec</TableHead>
            <TableHead className="text-right">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="text-code-s">
              tests/integration/checkout/guest/keeps-cart-across-sign-in.spec.ts
            </TableCell>
            <TableCell className="text-right tabular-nums">1h 12m</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-code-s">tests/smoke.spec.ts</TableCell>
            <TableCell className="text-right tabular-nums">9ms</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
};

export const HasTableSemantics: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('table')).toBeVisible();
    await expect(canvas.getAllByRole('columnheader')).toHaveLength(4);
    await expect(canvas.getAllByRole('row')).toHaveLength(ROWS.length + 1);
  },
};
