import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { activeRuns, runs, verboseRun } from '../../fixtures/runs';
import { ActiveRuns } from './active-runs';
import { RunsTable } from './runs-table';

const hrefs = { run: (n: number) => `#run-${n}` };

const meta = {
  title: 'Views/Runs/RunsTable',
  component: RunsTable,
  args: { hrefs, runs },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof RunsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { runs: [] } };

/** One row: long branch, reverted commit message, five tags, a four-digit duration. */
export const LongText: Story = { args: { runs: [verboseRun] } };

export const LocalOnly: Story = { args: { runs: runs.filter((r) => r.executor === 'local') } };

export const LinksToEachRun: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('table')).toBeVisible();
    await expect(canvas.getByRole('link', { name: '#482' })).toHaveAttribute('href', '#run-482');
  },
};

/**
 * A commit SHA links out to the provider only when the app resolved a URL for
 * it; otherwise it stays plain text rather than becoming a dead link.
 */
export const CommitLinkIsOptional: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /9f2c8a4/ })).toHaveAttribute(
      'href',
      'https://github.com/acme/web/commit/9f2c8a41',
    );
    await expect(canvas.queryByRole('link', { name: /480/ })).not.toBeNull();
  },
};

export const Active: Story = {
  render: () => <ActiveRuns hrefs={hrefs} runs={activeRuns} />,
};

/** No running runs means no section at all, not an empty heading. */
export const ActiveEmpty: Story = {
  render: () => <ActiveRuns hrefs={hrefs} runs={[]} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/active runs/i)).toBeNull();
  },
};

/** A sharded run shows one chip per shard, including the ones yet to report. */
export const ActiveShards: Story = {
  render: () => <ActiveRuns hrefs={hrefs} runs={[activeRuns[0]!]} />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[title="Shard 4: waiting"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[title="Shard 1: passed"]')).not.toBeNull();
  },
};
