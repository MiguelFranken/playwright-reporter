import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { flatTrend, trend, volatileTrend } from '../../fixtures/dashboard';
import { PassFailChart } from './pass-fail-chart';

/**
 * Recharts measures its container, so the chart is given a real width here.
 * It also mounts client-side only — the stories therefore wait for it rather
 * than asserting on the first frame.
 */
const meta = {
  title: 'Views/Dashboard/PassFailChart',
  component: PassFailChart,
  args: { data: trend },
  parameters: { layout: 'padded' },
  tags: ['themed'],
  decorators: [(Story) => <div className="w-full max-w-4xl">{Story()}</div>],
} satisfies Meta<typeof PassFailChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Nothing ever failed: the stack is a single band and the rate line is flat at 100%. */
export const AllPassing: Story = { args: { data: flatTrend } };

/**
 * Ten ragged runs. The short window is the hard case: bars have to fatten to
 * fill their bands, the rate axis has to open up to hold a 5% run, and the
 * stats strip has to stay honest about how little there is.
 */
export const ShortWindow: Story = { args: { data: volatileTrend } };

export const SingleRun: Story = { args: { data: trend.slice(-1) } };

export const NoData: Story = { args: { data: [] } };

export const SwitchesToOutcomes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Outcomes' }));
    await expect(canvas.getByRole('radio', { name: 'Outcomes' })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Pass rate' })).not.toBeChecked();
  },
};

/**
 * The table view is the plots' accessible twin, not a fallback: it is what lets
 * them drop their labels, and what carries the two series — amber flaky and grey
 * skipped — that sit under 3:1 against a white card.
 */
export const TableView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Table' }));
    const table = await canvas.findByRole('table');
    await expect(within(table).getByRole('columnheader', { name: 'Pass rate' })).toBeVisible();
  },
};

/**
 * The card leads with the rate, so the rate plot is what opens: headline,
 * movement, the totals it is made of, and a key for the rule across the plot.
 */
export const HeadlineAndStats: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/vs the earlier half/)).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Pass rate' })).toBeChecked();
    await expect(canvas.getByText('Tests run')).toBeVisible();
    await expect(canvas.getByText('Window average')).toBeVisible();
  },
};

/** Switching to outcomes brings the four-series legend, totalled over the window. */
export const OutcomeLegendTotals: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Outcomes' }));
    await expect(await canvas.findByText('Passed')).toBeVisible();
    await expect(canvas.getByText('Skipped')).toBeVisible();
  },
};
