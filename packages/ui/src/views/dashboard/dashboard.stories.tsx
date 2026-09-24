import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Activity, Clock, Repeat2, ShieldCheck } from 'lucide-react';
import { Badge } from '../../components/badge';
import { TooltipProvider } from '../../components/tooltip';
import { MetricCard, toneClass } from '../../patterns/metric-card';
import { branchSummary, chronicFailures, flakyTests, passRateSeries } from '../../fixtures/dashboard';
import { ChartDelta } from '../../patterns/chart-frame';
import { BranchSummaryTable } from './branch-summary-table';
import { ChronicFailuresList, FlakyTestsList } from './test-health-lists';

const hrefs = { run: (n: number) => `#run-${n}`, test: (id: string) => `#test-${id}` };

const meta = {
  title: 'Views/Dashboard/Cards & Lists',
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MetricCards: Story = {
  render: () => (
    <TooltipProvider>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Runs" value="1,204" icon={Activity} subtext="Last 30 days" />
        {/* The full stat-tile contract: label, value, movement, and the shape it
            took getting there. */}
        <MetricCard
          label="Pass rate"
          value="98.4%"
          icon={ShieldCheck}
          hint="Finished runs whose every test passed."
          subtext="1,185 of 1,204 runs"
          delta={<ChartDelta value={1.8} direction="up" unit=" pts" comparedTo="vs the previous 30 days" />}
          trend={passRateSeries}
          trendTone="success"
        />
        <MetricCard
          label="Reliability"
          value="82"
          icon={Repeat2}
          hint="Failures weigh fully, flakiness half. 0–100."
          badge={<Badge variant="outline" className={toneClass.good}>Healthy</Badge>}
        />
        <MetricCard label="Median duration" value="4m 12s" icon={Clock} subtext="p95 11m 40s" />
      </div>
    </TooltipProvider>
  ),
};

export const Branches: Story = { render: () => <BranchSummaryTable hrefs={hrefs} rows={branchSummary} /> };

export const BranchesEmpty: Story = {
  render: () => <BranchSummaryTable hrefs={hrefs} rows={[]} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no runs in this range/i)).toBeVisible();
  },
};

/** A branch with no finished runs has no pass rate — a dash, not a zero. */
export const BranchesNoPassRate: Story = {
  render: () => <BranchSummaryTable hrefs={hrefs} rows={branchSummary.slice(3)} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('–')).toBeVisible();
  },
};

export const Flaky: Story = { render: () => <FlakyTestsList hrefs={hrefs} rows={flakyTests} /> };

export const FlakyEmpty: Story = { render: () => <FlakyTestsList hrefs={hrefs} rows={[]} /> };

export const Chronic: Story = { render: () => <ChronicFailuresList hrefs={hrefs} rows={chronicFailures} /> };

export const ChronicEmpty: Story = { render: () => <ChronicFailuresList hrefs={hrefs} rows={[]} /> };

export const ListsLinkToTests: Story = {
  render: () => <FlakyTestsList hrefs={hrefs} rows={flakyTests} />,
  play: async ({ canvasElement }) => {
    const links = within(canvasElement).getAllByRole('link');
    await expect(links[0]).toHaveAttribute('href', '#test-t1');
  },
};
