import type { Meta, StoryObj } from '@storybook/react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { ago, NOW } from '../../fixtures/now';
import { RunHistory, type RunHistoryRow } from './run-history';

const OUTCOMES = ['passed', 'passed', 'failed', 'passed', 'flaky', 'passed', 'skipped'];

const rows: RunHistoryRow[] = Array.from({ length: 34 }, (_, i) => ({
  resultId: `result-${i}`,
  runNumber: 240 - i,
  startedAt: ago(90 + i * 180),
  outcome: OUTCOMES[i % OUTCOMES.length]!,
  durationMs: 1200 + ((i * 737) % 9000),
  attemptCount: OUTCOMES[i % OUTCOMES.length] === 'flaky' ? 2 : 1,
  branch: i % 3 === 0 ? 'feat/checkout' : 'main',
  href: `#run-${240 - i}`,
}));

const meta = {
  title: 'Views/Explorer/RunHistory',
  component: RunHistory,
  args: { rows, now: NOW },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof RunHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** More runs than a page holds: the pager and the page size appear. */
export const Paged: Story = {};

/** A larger page size shows more rows and returns to the first page. */
export const PageSize: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(canvas.getByText('2 / 4')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Per page' }));
    await userEvent.click(await screen.findByRole('option', { name: '25' }));
    await expect(canvas.getByText('1 / 2')).toBeInTheDocument();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(25);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  },
};

/** A handful of runs: one page, no pager. */
export const OnePage: Story = { args: { rows: rows.slice(0, 4) } };

export const Empty: Story = { args: { rows: [] } };
