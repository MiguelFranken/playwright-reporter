import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { explorerRows } from '../../fixtures/tests';
import { emptyTestOverview, healthyTestOverview, testOverview } from '../../fixtures/tests';
import { NOW } from '../../fixtures/now';
import { PENDING_STATE_A11Y } from '../../fixtures/a11y';
import { ExplorerTable, type ExplorerSort, type SortDir } from './explorer-table';
import { TestDrawer } from './test-drawer';
import { TestOverview, type TestOverviewPreview } from './test-overview';

const tableHrefs = { run: (n: number) => `#run-${n}` };
const overviewHrefs = {
  result: (runNumber: number, resultId: string) => `#run-${runNumber}-result-${resultId}`,
  sibling: (testId: string) => `#test-${testId}`,
};

/** What a click on the first explorer row hands the drawer straight away. */
const rowPreview: TestOverviewPreview = {
  lastOutcome: explorerRows[0]!.lastOutcome,
  lastRunAt: explorerRows[0]!.lastRunAt,
  lastRunNumber: explorerRows[0]!.lastRunNumber,
  lastBranch: explorerRows[0]!.lastBranch,
  runs: explorerRows[0]!.runs,
  passed: explorerRows[0]!.passed,
  failed: explorerRows[0]!.failed,
  flaky: explorerRows[0]!.flaky,
  skipped: explorerRows[0]!.skipped,
  reliability: explorerRows[0]!.reliability,
  avgDurationMs: explorerRows[0]!.avgDurationMs,
  flakyRate: explorerRows[0]!.flakyRate,
  failureRate: explorerRows[0]!.failureRate,
  streak: explorerRows[0]!.streak,
};

const meta = {
  title: 'Views/Explorer/ExplorerTable',
  component: ExplorerTable,
  args: {
    hrefs: tableHrefs,
    rows: explorerRows,
    sort: 'lastRun' as ExplorerSort,
    dir: 'desc' as SortDir,
    onSortChange: fn(),
    onSelectTest: fn(),
  },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof ExplorerTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { rows: [] } };

export const RowSelected: Story = { args: { activeTestId: 't1' } };

export const Pending: Story = { args: { isPending: true }, parameters: PENDING_STATE_A11Y };

export const SortedByReliability: Story = { args: { sort: 'reliability', dir: 'asc' } };

/** A test that has only ever been skipped has no reliability score — a dash. */
export const NoDataRow: Story = {
  args: { rows: explorerRows.slice(4, 5) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByText('–').length).toBeGreaterThan(0);
  },
};

/** Clicking a sortable header toggles direction; clicking a new one resets it. */
export const SortsColumns: Story = {
  render: function Render(args) {
    const [sort, setSort] = useState<ExplorerSort>('lastRun');
    const [dir, setDir] = useState<SortDir>('desc');
    return (
      <ExplorerTable
        {...args}
        sort={sort}
        dir={dir}
        onSortChange={(nextSort, nextDir) => {
          setSort(nextSort);
          setDir(nextDir);
          args.onSortChange(nextSort, nextDir);
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /reliability/i }));
    await expect(args.onSortChange).toHaveBeenCalledWith('reliability', 'asc');

    await userEvent.click(canvas.getByRole('button', { name: /reliability/i }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith('reliability', 'desc');
  },
};

/** Rows are selectable by keyboard as well as pointer, since they are not links. */
export const SelectsARow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('restores the applied discount code'));
    await expect(args.onSelectTest).toHaveBeenCalledWith('t2');

    const row = canvas.getAllByRole('row')[1]!;
    row.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onSelectTest).toHaveBeenLastCalledWith('t1');
  },
};

// --- Overview and drawer -------------------------------------------------

export const Overview: Story = {
  render: () => <TestOverview hrefs={overviewHrefs} overview={testOverview} days={30} now={NOW} />,
};

export const OverviewHealthy: Story = {
  render: () => <TestOverview hrefs={overviewHrefs} overview={healthyTestOverview} days={30} now={NOW} />,
};

/** A test with no runs in range: the history tab falls back, errors show empty. */
export const OverviewNoData: Story = {
  render: () => <TestOverview hrefs={overviewHrefs} overview={emptyTestOverview} days={7} now={NOW} />,
};

export const OverviewShowsErrors: Story = {
  render: () => <TestOverview hrefs={overviewHrefs} overview={testOverview} days={30} now={NOW} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: /errors/i }));
    await expect(canvas.getByRole('tab', { name: /errors/i })).toHaveAttribute('aria-selected', 'true');
  },
};

/**
 * The instant after a row is clicked: the summary is already drawn from the
 * row, and only the history, errors and environments are still placeholders.
 */
export const OverviewFromRowOnly: Story = {
  render: () => <TestOverview hrefs={overviewHrefs} overview={null} preview={rowPreview} days={30} now={NOW} />,
};

/** A shared link, opened before anything at all is known about the test. */
export const OverviewLoading: Story = {
  render: () => <TestOverview hrefs={overviewHrefs} overview={null} days={30} now={NOW} />,
};

/** Clicking another platform swaps the view in place instead of navigating. */
export const OverviewSwapsSibling: Story = {
  render: (args) => (
    <TestOverview hrefs={overviewHrefs} overview={testOverview} days={30} now={NOW} onSiblingSelect={args.onSelectTest} />
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('firefox'));
    await expect(args.onSelectTest).toHaveBeenCalledWith(testOverview.siblings[0]!.testId);
  },
};

/** The drawer opens on the click, so its header paints before its body does. */
export const DrawerLoading: Story = {
  render: () => (
    <TestDrawer
      open
      onOpenChange={fn()}
      testPageHref="#test-t1"
      title="keeps a guest cart across sign-in"
      file="tests/checkout.spec.ts"
      platform="chromium"
    >
      <TestOverview hrefs={overviewHrefs} overview={null} preview={rowPreview} days={30} now={NOW} />
    </TestDrawer>
  ),
  play: async () => {
    const body = within(document.body);
    const drawer = await body.findByRole('dialog');
    await expect(drawer).toHaveTextContent(/keeps a guest cart/i);
  },
};

export const Drawer: Story = {
  render: () => (
    <TestDrawer
      open
      onOpenChange={fn()}
      testPageHref="#test-t1"
      title="keeps a guest cart across sign-in"
      file="tests/checkout.spec.ts"
      platform="chromium"
    >
      <TestOverview hrefs={overviewHrefs} overview={testOverview} days={30} now={NOW} />
    </TestDrawer>
  ),
  play: async () => {
    const body = within(document.body);
    const drawer = await body.findByRole('dialog');
    await expect(drawer).toHaveTextContent(/keeps a guest cart/i);
    // "Open full page" is a Button rendered *as* the host's link, so the
    // assertion is on the anchor it produces rather than on the button role.
    const el = await body.findByText(/open full page/i);
    const anchor = el.closest('a');
    await expect(anchor).not.toBeNull();
    await expect(anchor).toHaveAttribute('href', '#test-t1');
  },
};

export const DrawerCloses: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(true);
    return (
      <TestDrawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          args.onSelectTest(String(next));
        }}
        testPageHref="#test-t1"
        title="keeps a guest cart across sign-in"
        file="tests/checkout.spec.ts"
        platform="chromium"
      >
        <p className="text-body-s">Drawer body.</p>
      </TestDrawer>
    );
  },
  play: async ({ args }) => {
    await within(document.body).findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await expect(args.onSelectTest).toHaveBeenCalledWith('false');
  },
};
