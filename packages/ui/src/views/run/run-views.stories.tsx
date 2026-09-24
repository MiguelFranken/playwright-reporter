import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import type { SpecFilters, SpecStatus } from '../../lib/spec-filter';
import { errorGroups, mixedResults, specs } from '../../fixtures/results';
import { runConfig, sparseRunConfig } from '../../fixtures/config';
import { RunConfig } from './run-config';
import { RunErrors } from './run-errors';
import { RunSpecs } from './run-specs';
import { ResultGroupsSkeleton, RunTabSkeleton, RunTabsSkeleton } from './run-skeleton';

const hrefs = {
  result: (id: string) => `#result-${id}`,
  errorGroup: (signature: string) => `#errors-${signature}`,
  spec: (file: string) => `#spec-${encodeURIComponent(file)}`,
};

const meta = {
  title: 'Views/Run/Tabs',
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Specs ---------------------------------------------------------------

export const Specs: Story = {
  render: () => <RunSpecs hrefs={hrefs} specs={specs} selected={specs[0]!.file} rows={mixedResults} />,
};

/** Nothing picked yet: the right pane invites a choice rather than sitting blank. */
export const SpecsNothingSelected: Story = {
  render: () => <RunSpecs hrefs={hrefs} specs={specs} rows={null} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/pick a spec file/i)).toBeVisible();
  },
};

export const SpecsEmpty: Story = { render: () => <RunSpecs hrefs={hrefs} specs={[]} rows={null} /> };

/**
 * The filter state is the app's to own — in the product it lives in the URL —
 * so the stories supply the smallest host that can hold it.
 */
function FilterableSpecs({ initial = {}, selected }: { initial?: SpecFilters; selected?: string }) {
  const [filters, setFilters] = React.useState<SpecFilters>(initial);
  return (
    <RunSpecs
      hrefs={hrefs}
      specs={specs}
      selected={selected}
      rows={selected ? mixedResults : null}
      filters={filters}
      onFilterChange={(next) =>
        setFilters((prev) => ({
          ...prev,
          ...(next.q !== undefined ? { q: next.q ?? undefined } : {}),
          ...(next.sort !== undefined ? { sort: next.sort ?? undefined } : {}),
          ...(next.status !== undefined ? { status: next.status ?? undefined } : {}),
        }))
      }
    />
  );
}

/** Search, sort and status, above the file list. */
export const SpecsFilterable: Story = {
  render: () => <FilterableSpecs selected={specs[0]!.file} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(`${specs.length} files`)).toBeVisible();
  },
};

/** Typing narrows the list on submit, and the count says by how much. */
export const SpecsSearched: Story = {
  render: () => <FilterableSpecs />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('searchbox', { name: /search specs/i }), 'auth{Enter}');
    await expect(await canvas.findByText(`1 of ${specs.length} files`)).toBeVisible();
    await expect(canvas.getByText('login.spec.ts')).toBeVisible();
    await expect(canvas.queryByText('teams.spec.ts')).not.toBeInTheDocument();
  },
};

/** The menu carries both the order and the status filter; ticking one keeps it open. */
export const SpecsSortedAndFiltered: Story = {
  render: () => <FilterableSpecs />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('button', { name: /filter/i }));

    // Base UI portals the popup, so it is found on the body, not the canvas.
    await userEvent.click(await body.findByRole('menuitemradio', { name: /high to low/i }));
    await userEvent.click(await body.findByRole('menuitemcheckbox', { name: /^failed$/i }));

    // The popup survives the tick — a status list is rarely one box.
    await expect(await body.findByRole('menuitemcheckbox', { name: /^flaky$/i })).toBeVisible();
    await expect(await canvas.findByText(`2 of ${specs.length} files`)).toBeVisible();

    // Longest first, of the two files that hold a failure.
    const cards = canvas.getAllByRole('link');
    await expect(cards[0]).toHaveTextContent('keeps-cart-across-sign-in-with-discount.spec.ts');
  },
};

/** A filter that matches nothing says so in place of the list, not the page. */
export const SpecsNoMatch: Story = {
  render: () => <FilterableSpecs initial={{ status: ['running' as SpecStatus] }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no spec files match/i)).toBeVisible();
  },
};

// --- Errors --------------------------------------------------------------

export const Errors: Story = { render: () => <RunErrors hrefs={hrefs} groups={errorGroups} /> };

export const ErrorsNone: Story = {
  render: () => <RunErrors hrefs={hrefs} groups={[]} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no errors/i)).toBeVisible();
  },
};

/** A group spanning more files than fit shows the overflow count, not a wrapped list. */
export const ErrorsManyFiles: Story = {
  render: () => <RunErrors hrefs={hrefs} groups={errorGroups.slice(2)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The file list lives in the group's collapsed body, so it has to be opened.
    await userEvent.click(canvas.getAllByRole('button', { name: /expect|error|timeout|\(no message\)/i })[0]!);
    await expect(await canvas.findByText(/\+1 more/)).toBeVisible();
  },
};

// --- Config --------------------------------------------------------------

export const Config: Story = { render: () => <RunConfig run={runConfig} /> };

/** A local run that reported almost nothing — every "Not reported." branch at once. */
export const ConfigSparse: Story = {
  render: () => <RunConfig run={sparseRunConfig} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByText(/not reported/i).length).toBeGreaterThan(0);
  },
};

// --- Loading -------------------------------------------------------------

export const Loading: Story = { render: () => <RunTabsSkeleton /> };

/**
 * One placeholder per tab, shaped like the body it stands for. The client strip
 * swaps these in the instant a tab is clicked, so what matters is that each one
 * traces the real layout — otherwise the page jumps when the content lands.
 */
export const LoadingSummaryTab: Story = { render: () => <RunTabSkeleton tab="summary" /> };
export const LoadingSpecsTab: Story = { render: () => <RunTabSkeleton tab="specs" /> };
export const LoadingErrorsTab: Story = { render: () => <RunTabSkeleton tab="errors" /> };
export const LoadingConfigTab: Story = { render: () => <RunTabSkeleton tab="config" /> };

/** Just the grouped list — swapped in when only the outcome filter changes. */
export const LoadingResultGroups: Story = { render: () => <ResultGroupsSkeleton /> };
