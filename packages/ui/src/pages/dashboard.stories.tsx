import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Activity, Clock, Repeat2, ShieldCheck, TrendingUp } from 'lucide-react';
import { Badge } from '../components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { TooltipProvider } from '../components/tooltip';
import { EmptyState } from '../patterns/empty-state';
import { MetricCard, toneClass } from '../patterns/metric-card';
import { PageHeader } from '../patterns/page-header';
import { ChartDelta } from '../patterns/chart-frame';
import { RangeToggle } from '../patterns/filter-controls';
import { branchSummary, chronicFailures, flakyTests, passRateSeries, trend } from '../fixtures/dashboard';
import { BranchSummaryTable } from '../views/dashboard/branch-summary-table';
import { PassFailChart } from '../views/dashboard/pass-fail-chart';
import { ChronicFailuresList, FlakyTestsList } from '../views/dashboard/test-health-lists';

/**
 * The integration check for the design system: the views composed into the
 * screen the app actually renders, with no app, no router and no database.
 * If a page story needs something the views cannot supply, that is the signal
 * a boundary is in the wrong place.
 */
const meta = {
  title: 'Pages/Dashboard',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const hrefs = { run: (n: number) => `#run-${n}`, test: (id: string) => `#test-${id}` };

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title="Dashboard" description="How this project's suite has behaved over the selected range.">
          <RangeToggle value="30" onValueChange={() => {}} />
        </PageHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Runs" value="1,204" icon={Activity} subtext="Last 30 days" />
          <MetricCard
            label="Pass rate"
            value="98.4%"
            icon={ShieldCheck}
            subtext="1,185 of 1,204 runs"
            delta={<ChartDelta value={1.8} direction="up" unit=" pts" />}
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

        {/* The chart frames itself, so the card is only the surface it sits on. */}
        <Card>
          <CardContent>
            <PassFailChart data={trend} />
          </CardContent>
        </Card>

        <Panel title="Branches">
          <BranchSummaryTable hrefs={hrefs} rows={branchSummary} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Flakiest tests">
            <FlakyTestsList hrefs={hrefs} rows={flakyTests} />
          </Panel>
          <Panel title="Chronic failures">
            <ChronicFailuresList hrefs={hrefs} rows={chronicFailures} />
          </Panel>
        </div>
      </div>
    </TooltipProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(canvas.getByText('98.4%')).toBeVisible();
    await expect(canvas.getByRole('table')).toBeVisible();
  },
};

/** A brand-new project: every panel has to have something to say. */
export const Empty: Story = {
  render: () => (
    <TooltipProvider>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title="Dashboard" description="How this project's suite has behaved over the selected range." />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Runs" value="0" icon={Activity} />
          <MetricCard label="Pass rate" value="–" icon={ShieldCheck} />
          <MetricCard
            label="Reliability"
            value="–"
            icon={Repeat2}
            badge={<Badge variant="outline" className={toneClass.muted}>No data</Badge>}
          />
          <MetricCard label="Median duration" value="–" icon={Clock} />
        </div>

        <Card>
          <CardContent>
            <EmptyState icon={TrendingUp} title="No finished runs yet" description="Upload a Playwright report to see the trend." />
          </CardContent>
        </Card>

        <Panel title="Branches">
          <BranchSummaryTable hrefs={hrefs} rows={[]} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Flakiest tests">
            <FlakyTestsList hrefs={hrefs} rows={[]} />
          </Panel>
          <Panel title="Chronic failures">
            <ChronicFailuresList hrefs={hrefs} rows={[]} />
          </Panel>
        </div>
      </div>
    </TooltipProvider>
  ),
};
