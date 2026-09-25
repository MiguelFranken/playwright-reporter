import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/table';
import { ChartSkeleton, FilterSkeleton, ListRowsSkeleton, MetricCardsSkeleton, TableRowsSkeleton } from './skeletons';

/**
 * These stand in for content inside chrome that has already painted. A page's
 * headings, card frames and toolbars are static and arrive with the shell; only
 * the rows, values and plots underneath are placeholders.
 */
const meta = {
  title: 'Patterns/Skeletons',
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TableRows: Story = { render: () => <TableRowsSkeleton /> };
export const ListRows: Story = { render: () => <ListRowsSkeleton /> };
export const Chart: Story = { render: () => <ChartSkeleton /> };
export const Filters: Story = { render: () => <FilterSkeleton /> };

export const MetricCards: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCardsSkeleton />
    </div>
  ),
};

/**
 * The point of a skeleton is that nothing moves when the data lands, so the
 * loaded view sits directly beside it for comparison.
 */
export const SideBySide: Story = {
  render: () => (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Loading</CardTitle>
        </CardHeader>
        <CardContent flush>
          <TableRowsSkeleton rows={4} columns={[40, 30, 15, 15]} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Loaded</CardTitle>
        </CardHeader>
        <CardContent flush>
          <Table>
            <TableHeader className="sr-only">
              <TableRow>
                <TableHead>Spec</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Tests</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ['tests/checkout.spec.ts', 'main', '24', '42s'],
                ['tests/auth/login.spec.ts', 'main', '12', '18s'],
                ['tests/admin/teams.spec.ts', 'main', '31', '1m 4s'],
                ['tests/smoke.spec.ts', 'main', '4', '9s'],
              ].map((row) => (
                <TableRow key={row[0]}>
                  {row.map((cell, i) => (
                    <TableCell key={i} className={i === 0 ? 'text-code-s' : 'tabular-nums'}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  ),
};
