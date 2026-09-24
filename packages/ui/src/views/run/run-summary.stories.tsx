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
    await expect(args.onFilterChange).toHaveBeenCalledWith('q', 'guest');
  },
};
