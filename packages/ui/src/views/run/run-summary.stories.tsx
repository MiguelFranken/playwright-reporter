import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { counts } from '../../fixtures/runs';
import { mixedResults, passedResults } from '../../fixtures/results';
import { PENDING_STATE_A11Y } from '../../fixtures/a11y';
import { RunSummary } from './run-summary';

const hrefs = {
  result: (id: string) => `#result-${id}`,
  outcome: (outcome: string) => `#outcome-${outcome}`,
  clearFilters: '#run',
};

const meta = {
  title: 'Views/Run/RunSummary',
  component: RunSummary,
  args: {
    hrefs,
    counts: counts({ total: 240, passed: 213, flaky: 9, failed: 14, skipped: 4 }),
    rows: mixedResults,
    filters: {},
    onFilterChange: fn(),
  },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof RunSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllPassed: Story = {
  args: { counts: counts({ total: 240, passed: 240 }), rows: passedResults },
};

export const Filtered: Story = { args: { filters: { outcome: 'failed', q: 'cart' } } };

/** Filtering to nothing is a different state from a run with no tests. */
export const NoMatches: Story = {
  args: { rows: [], filters: { q: 'nothing matches this' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no tests match/i)).toBeVisible();
  },
};

export const FilteredByErrorGroup: Story = {
  args: { filters: { signature: 'sig-visible-place-order' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/filtered by error group/i)).toBeVisible();
    await expect(within(canvasElement).getByRole('link', { name: /clear/i })).toHaveAttribute('href', '#run');
  },
};

export const Pending: Story = { args: { isPending: true }, parameters: PENDING_STATE_A11Y };

/** The outcome tiles are links, so the filtered view is a real, shareable URL. */
export const TilesLinkToFilteredViews: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const failed = canvas.getAllByRole('link').find((a) => a.getAttribute('href') === '#outcome-failed');
    await expect(failed).toBeDefined();
  },
};

export const SearchReportsChanges: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole('searchbox', { name: /search title or file/i });
    await userEvent.type(input, 'guest{Enter}');
    await expect(args.onFilterChange).toHaveBeenCalledWith({ q: 'guest' });
  },
};

/** A plain click on an outcome is answered in place: the host re-filters the rows it holds. */
export const OutcomeClickReportsChange: Story = {
  play: async ({ canvasElement, args }) => {
    const group = within(canvasElement).getByRole('group', { name: /filter by outcome/i });
    await userEvent.click(within(group).getByRole('link', { name: /failed/i }));
    await expect(args.onFilterChange).toHaveBeenCalledWith({ outcome: 'failed' });
  },
};

/** Picking the active outcome again clears it, as its link does. */
export const ActiveOutcomeClickClears: Story = {
  args: { filters: { outcome: 'failed' } },
  play: async ({ canvasElement, args }) => {
    const group = within(canvasElement).getByRole('group', { name: /filter by outcome/i });
    await userEvent.click(within(group).getByRole('link', { name: /failed/i }));
    await expect(args.onFilterChange).toHaveBeenCalledWith({ outcome: null });
  },
};

/**
 * The failing files painted first; the all-green ones still loading, drawn
 * closed from their tallies.
 */
export const LoadingRemainingFiles: Story = {
  args: {
    rows: mixedResults.filter((r) => r.outcome !== 'passed' && r.outcome !== 'skipped'),
    loadingGroups: [
      { file: 'tests/zz-account/profile.spec.ts', total: 12 },
      { file: 'tests/zz-search/search.spec.ts', total: 1 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('profile.spec.ts')).toBeVisible();
    await expect(canvas.getByText('12 tests')).toBeVisible();
  },
};

/** The rows on hand cannot answer this filter yet. */
export const LoadingFilteredRows: Story = { args: { loading: true, filters: { outcome: 'passed' } } };

/** Filtered to passed tests, the tiles still break down the whole run's failures. */
export const FilteredWithWholeRunBreakdowns: Story = {
  args: {
    rows: mixedResults.filter((r) => r.outcome === 'passed'),
    runRows: mixedResults,
    filters: { outcome: 'passed' },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/no error messages recorded/i)).toBeNull();
  },
};
