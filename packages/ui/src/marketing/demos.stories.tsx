import type { Meta, StoryObj } from '@storybook/react';
import { BrowserFrame } from './browser-frame';
import { DashboardMetricsDemo } from './demos/dashboard-metrics';
import { ExplorerTableDemo } from './demos/explorer-table';
import { FlakyTestsDemo } from './demos/flaky-tests';
import { PassFailChartDemo } from './demos/pass-fail-chart';
import { ResultAttemptsDemo } from './demos/result-attempts';
import { RunErrorsDemo } from './demos/run-errors';
import { RunSummaryDemo } from './demos/run-summary';
import { RunsTableDemo } from './demos/runs-table';

/**
 * The nine embeddable demos, each one a real view from `src/views` driven by
 * the catalogue's fixtures. The website picks one by key; these stories are
 * where a change to a view shows up as a change to the marketing site.
 *
 * One module per demo, so the website can load each one lazily: together they
 * pull in the table and chart libraries, and a marketing page has no business
 * shipping those for a demo further down than the reader ever scrolls.
 */
const meta = {
  title: 'Marketing/Demos',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Framed({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className="p-8">
      <BrowserFrame url={url}>{children}</BrowserFrame>
    </div>
  );
}

export const RunsList: Story = {
  render: () => (
    <Framed url="reports.example.com/acme/web/runs">
      <RunsTableDemo />
    </Framed>
  ),
};

export const RunSummary: Story = {
  render: () => (
    <Framed url="reports.example.com/acme/web/runs/481">
      <RunSummaryDemo />
    </Framed>
  ),
};

export const RunErrors: Story = {
  render: () => (
    <Framed url="reports.example.com/acme/web/runs/481/errors">
      <RunErrorsDemo />
    </Framed>
  ),
};

export const ResultAttempts: Story = {
  render: () => (
    <Framed url="reports.example.com/acme/web/results/4f21">
      <ResultAttemptsDemo />
    </Framed>
  ),
};

export const DashboardMetrics: Story = {
  render: () => (
    <Framed url="reports.example.com/acme/web">
      <DashboardMetricsDemo />
    </Framed>
  ),
};

export const PassFailTrend: Story = {
  render: () => (
    <Framed url="reports.example.com/acme/web">
      <PassFailChartDemo />
    </Framed>
  ),
};

export const FlakyTests: Story = {
  render: () => (
    <Framed url="reports.example.com/acme/web">
      <FlakyTestsDemo />
    </Framed>
  ),
};

export const TestExplorer: Story = {
  render: () => (
    <Framed url="reports.example.com/acme/web/tests">
      <ExplorerTableDemo />
    </Framed>
  ),
};
