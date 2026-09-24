import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { EmptyState } from '../patterns/empty-state';
import { PageHeader } from '../patterns/page-header';
import { Pagination } from '../patterns/pagination';
import { FilterSelect, RangeToggle, SearchField } from '../patterns/filter-controls';
import { explorerRows, testOverview } from '../fixtures/tests';
import { NOW } from '../fixtures/now';
import { ExplorerTable, type ExplorerSort, type SortDir } from '../views/explorer/explorer-table';
import { TestDrawer } from '../views/explorer/test-drawer';
import { TestOverview } from '../views/explorer/test-overview';

const meta = {
  title: 'Pages/Explorer',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const tableHrefs = { run: (n: number) => `#run-${n}` };
const overviewHrefs = {
  result: (runNumber: number, resultId: string) => `#run-${runNumber}-result-${resultId}`,
  sibling: (testId: string) => `#test-${testId}`,
};

const PLATFORMS = [
  { value: 'chromium', label: 'chromium' },
  { value: 'firefox', label: 'firefox' },
  { value: 'webkit', label: 'webkit' },
];

function Filters() {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <SearchField value="" placeholder="Search tests…" onValueChange={() => {}} className="lg:min-w-72" />
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect value="all" options={PLATFORMS} placeholder="Platform" allLabel="All platforms" onValueChange={() => {}} />
        <RangeToggle value="30" onValueChange={() => {}} />
      </div>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Test explorer" description="Every test this project has reported, with its history and reliability score." />
      <Filters />
      <ExplorerTable
        hrefs={tableHrefs}
        rows={explorerRows}
        sort="lastRun"
        dir="desc"
        onSortChange={() => {}}
        onSelectTest={() => {}}
      />
      <Pagination page={1} pageSize={25} total={318} onPageChange={() => {}} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: /test explorer/i })).toBeVisible();
    await expect(canvas.getAllByRole('row').length).toBeGreaterThan(explorerRows.length);
  },
};

export const Empty: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Test explorer" description="Every test this project has reported, with its history and reliability score." />
      <Filters />
      <EmptyState
        icon={FlaskConical}
        title="No tests match"
        description="No test cases ran in the last 30 days with the current filters. Try widening the range or clearing filters."
      />
    </div>
  ),
};

/** A row selected: the table stays behind the drawer rather than being replaced. */
export const WithDrawer: Story = {
  render: function Render() {
    const [testId, setTestId] = useState<string | undefined>('t1');
    const [sort, setSort] = useState<ExplorerSort>('lastRun');
    const [dir, setDir] = useState<SortDir>('desc');
    return (
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title="Test explorer" />
        <Filters />
        <ExplorerTable
          hrefs={tableHrefs}
          rows={explorerRows}
          sort={sort}
          dir={dir}
          activeTestId={testId}
          onSortChange={(s, d) => {
            setSort(s);
            setDir(d);
          }}
          onSelectTest={setTestId}
        />
        {testId ? (
          <TestDrawer
            open
            onOpenChange={(next) => !next && setTestId(undefined)}
            testPageHref={`#test-${testId}`}
            title="keeps a guest cart across sign-in"
            file="tests/checkout.spec.ts"
            platform="chromium"
          >
            <TestOverview hrefs={overviewHrefs} overview={testOverview} days={30} now={NOW} />
          </TestDrawer>
        ) : null}
      </div>
    );
  },
  play: async () => {
    const drawer = await within(document.body).findByRole('dialog');
    await expect(drawer).toHaveTextContent(/keeps a guest cart/i);
  },
};
