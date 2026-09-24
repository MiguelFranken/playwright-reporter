import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { PlayCircle } from 'lucide-react';
import { EmptyState } from '../patterns/empty-state';
import { PageHeader } from '../patterns/page-header';
import { Pagination } from '../patterns/pagination';
import { FilterSelect, RangeToggle, SearchField } from '../patterns/filter-controls';
import { LiveIndicator } from '../patterns/live-indicator';
import { activeRuns, runs } from '../fixtures/runs';
import { ActiveRuns } from '../views/runs/active-runs';
import { RunsTable } from '../views/runs/runs-table';

const meta = {
  title: 'Pages/Runs',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const hrefs = { run: (n: number) => `#run-${n}` };

const STATUS_OPTIONS = [
  { value: 'running', label: 'Running' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'interrupted', label: 'Interrupted' },
];

function Filters() {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <SearchField value="" placeholder="Search commit, branch or #number" onValueChange={() => {}} className="lg:min-w-72" />
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect value="all" options={STATUS_OPTIONS} placeholder="Status" allLabel="All statuses" onValueChange={() => {}} />
        <RangeToggle allowAll value="30" onValueChange={() => {}} />
      </div>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            Test Runs
            <LiveIndicator state="live" />
          </span>
        }
        description="Every report this project has received, newest first."
      />
      <ActiveRuns hrefs={hrefs} runs={activeRuns} />
      <Filters />
      <RunsTable hrefs={hrefs} runs={runs} />
      <Pagination page={1} pageSize={25} total={482} onPageChange={() => {}} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: /test runs/i })).toBeVisible();
    await expect(canvas.getByText(/active runs/i)).toBeVisible();
    await expect(canvas.getByRole('navigation', { name: /pagination/i })).toBeVisible();
  },
};

/** Nothing running: the active section disappears entirely rather than emptying. */
export const NoActiveRuns: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Test Runs" description="Every report this project has received, newest first." />
      <ActiveRuns hrefs={hrefs} runs={[]} />
      <Filters />
      <RunsTable hrefs={hrefs} runs={runs} />
      <Pagination page={3} pageSize={25} total={482} onPageChange={() => {}} />
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Test Runs" description="Every report this project has received, newest first." />
      <Filters />
      <EmptyState
        icon={PlayCircle}
        title="No test runs yet"
        description={
          <>
            Run <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-code-xs">pnpm test:e2e</code> to record your first run.
          </>
        }
      />
    </div>
  ),
};

/** A run in flight, which is what this page looks like most of the working day. */
export const Live: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            Test Runs
            <LiveIndicator state="polling" />
          </span>
        }
      />
      <ActiveRuns hrefs={hrefs} runs={activeRuns} />
      <RunsTable hrefs={hrefs} runs={runs.slice(0, 2)} />
    </div>
  ),
};
