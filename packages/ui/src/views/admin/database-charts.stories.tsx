import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { TABLE_SIZES, ingestDays } from '../../fixtures/admin';
import { DatabaseIngestChart, DatabaseSizeChart } from './database-charts';

const GB = 1024 ** 3;

/**
 * Recharts measures its container, so the charts get a real width. They also
 * mount client-side only, so the stories wait for them rather than asserting
 * on the first frame.
 */
const meta = {
  title: 'Views/Admin/Database charts',
  component: DatabaseIngestChart,
  args: { data: ingestDays() },
  parameters: { layout: 'padded' },
  tags: ['themed'],
  decorators: [(Story) => <div className="w-full max-w-4xl">{Story()}</div>],
} satisfies Meta<typeof DatabaseIngestChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ingest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Results ingested')).toBeVisible();
    await expect(canvas.getByText(/Over the last 30 days/)).toBeVisible();
  },
};

/** The year view groups days into weeks, so it stays around fifty bars. */
export const IngestYear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Last year' }));
    await expect(canvas.getByText(/Over the last year, by week/)).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'Table' }));
    const table = await canvas.findByRole('table');
    await expect(within(table).getByRole('columnheader', { name: 'Week of' })).toBeVisible();
    await expect(within(table).getAllByRole('row').length).toBeLessThanOrEqual(54);
  },
};

export const IngestArtifacts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Artifacts' }));
    await expect(canvas.getByText('Artifacts uploaded')).toBeVisible();
  },
};

/** The table view is the plots' accessible twin. */
export const IngestTable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Table' }));
    const table = await canvas.findByRole('table');
    await expect(within(table).getByRole('columnheader', { name: 'Retries' })).toBeVisible();
    await expect(within(table).getAllByRole('row')).toHaveLength(31);
  },
};

/** A fresh instance: every day is empty, and the plot says so instead of drawing a flat line. */
export const IngestEmpty: Story = {
  args: { data: ingestDays(30).map((d) => ({ ...d, runs: 0, results: 0, attempts: 0, artifactBytes: 0 })) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Nothing was ingested in this window.')).toBeVisible();
  },
};

/** A single day of data at the end of a quiet month. */
export const IngestOneDay: Story = {
  args: { data: ingestDays(30).map((d, i) => (i === 29 ? d : { ...d, runs: 0, results: 0, attempts: 0, artifactBytes: 0 })) },
};

const sizeArgs = {
  totalBytes: 5.9 * GB,
  historyBytes: 5.78 * GB,
  tables: TABLE_SIZES,
  bytesPerResult: 5_400,
  resultsLast30Days: 96_000,
};

export const Size: StoryObj<typeof DatabaseSizeChart> = {
  render: (args) => <DatabaseSizeChart {...args} />,
  args: sizeArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('5.9 GB')).toBeVisible();
    await expect(canvas.getByText(/Run history takes 98%/)).toBeVisible();
    await expect(canvas.getByText('≈ 494.4 MB / mo')).toBeVisible();
  },
};

export const SizeTable: StoryObj<typeof DatabaseSizeChart> = {
  render: (args) => <DatabaseSizeChart {...args} />,
  args: sizeArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'All tables' }));
    const table = await canvas.findByRole('table');
    await expect(within(table).getByText('data_sweeps')).toBeVisible();
    await expect(within(table).getAllByRole('row')).toHaveLength(TABLE_SIZES.length + 1);
  },
};

/** A new database: a few kilobytes, no results yet, so no per-result cost or projection. */
export const SizeFresh: StoryObj<typeof DatabaseSizeChart> = {
  render: (args) => <DatabaseSizeChart {...args} />,
  args: {
    totalBytes: 8.1 * 1024 ** 2,
    historyBytes: 400 * 1024,
    tables: TABLE_SIZES.slice(-3).map((t) => ({ ...t, rows: 0 })),
    bytesPerResult: 0,
    resultsLast30Days: 0,
  },
};
