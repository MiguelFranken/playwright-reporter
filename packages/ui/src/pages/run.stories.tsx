import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { useState } from 'react';
import { LiveIndicator } from '../patterns/live-indicator';
import { counts, runHeader, runHeaderShards } from '../fixtures/runs';
import { errorGroups, mixedResults, specs } from '../fixtures/results';
import { runConfig } from '../fixtures/config';
import { NOW } from '../fixtures/now';
import { RunConfig } from '../views/run/run-config';
import { RunErrors } from '../views/run/run-errors';
import { RunHeader } from '../views/run/run-header';
import { RunSpecs } from '../views/run/run-specs';
import { RunSummary } from '../views/run/run-summary';
import { RunTabs } from '../views/run/run-tabs';
import type { RunTab } from '../lib/run-tab';

const meta = {
  title: 'Pages/Run',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const hrefs = {
  result: (id: string) => `#result-${id}`,
  outcome: (outcome: string) => `#outcome-${outcome}`,
  clearFilters: '#run',
  errorGroup: (signature: string) => `#errors-${signature}`,
  spec: (file: string) => `#spec-${encodeURIComponent(file)}`,
};

const runCounts = counts({ total: 240, passed: 213, flaky: 9, failed: 14, skipped: 4 });

function Screen({ tab, children, live }: { tab: RunTab; children: React.ReactNode; live?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 p-8">
      <RunHeader run={runHeader} counts={runCounts} shards={runHeaderShards} liveIndicator={live} now={NOW} />
      <RunTabs value={tab} onValueChange={() => {}} counts={{ summary: 240, errors: errorGroups.length }}>
        {children}
      </RunTabs>
    </div>
  );
}

export const Summary: Story = {
  render: () => (
    <Screen tab="summary">
      <RunSummary hrefs={hrefs} counts={runCounts} rows={mixedResults} filters={{}} onFilterChange={() => {}} />
    </Screen>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: /restore the applied discount code/i })).toBeVisible();
    await expect(canvas.getByRole('tab', { name: 'Summary (240)' })).toHaveAttribute('aria-selected', 'true');
  },
};

export const Specs: Story = {
  render: () => (
    <Screen tab="specs">
      <RunSpecs hrefs={hrefs} specs={specs} selected={specs[0]!.file} rows={mixedResults} filters={{}} onFilterChange={() => {}} />
    </Screen>
  ),
};

export const Errors: Story = {
  render: () => (
    <Screen tab="errors">
      <RunErrors hrefs={hrefs} groups={errorGroups} />
    </Screen>
  ),
};

export const Config: Story = {
  render: () => (
    <Screen tab="config">
      <RunConfig run={runConfig} />
    </Screen>
  ),
};

/** A run still reporting: partial counts, waiting shards and a live indicator. */
export const Live: Story = {
  render: () => {
    const running = counts({ total: 240, passed: 96, failed: 2, running: 142 });
    return (
      <div className="flex flex-col gap-6 p-8">
        <RunHeader
          run={{ ...runHeader, status: 'running', durationMs: null }}
          counts={running}
          shards={runHeaderShards.slice(0, 2)}
          liveIndicator={<LiveIndicator state="live" />}
          now={NOW}
        />
        <RunTabs value="summary" onValueChange={() => {}} counts={{ summary: 98 }}>
          <RunSummary hrefs={hrefs} counts={running} rows={mixedResults} filters={{}} onFilterChange={() => {}} />
        </RunTabs>
      </div>
    );
  },
};

/** Switching tabs drives the whole screen — the composition check that matters. */
export const SwitchesTabs: Story = {
  render: function Render() {
    const [tab, setTab] = useState<RunTab>('summary');
    return (
      <div className="flex flex-col gap-6 p-8">
        <RunHeader run={runHeader} counts={runCounts} shards={runHeaderShards} now={NOW} />
        <RunTabs value={tab} onValueChange={setTab} counts={{ summary: 240, errors: errorGroups.length }}>
          {tab === 'summary' ? (
            <RunSummary hrefs={hrefs} counts={runCounts} rows={mixedResults} filters={{}} onFilterChange={() => {}} />
          ) : tab === 'specs' ? (
            <RunSpecs hrefs={hrefs} specs={specs} selected={specs[0]!.file} rows={mixedResults} filters={{}} onFilterChange={() => {}} />
          ) : tab === 'errors' ? (
            <RunErrors hrefs={hrefs} groups={errorGroups} />
          ) : (
            <RunConfig run={runConfig} />
          )}
        </RunTabs>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { userEvent } = await import('storybook/test');

    await userEvent.click(canvas.getByRole('tab', { name: 'Errors (3)' }));
    // Error groups open collapsed, so the bodies are revealed before asserting
    // that every one of them offers a link through to the tests it affected.
    await userEvent.click(canvas.getByRole('button', { name: /expand all/i }));
    await expect(await canvas.findAllByRole('link', { name: /show the .* affected/i })).toHaveLength(errorGroups.length);

    await userEvent.click(canvas.getByRole('tab', { name: 'Configuration' }));
    await expect(canvas.getByText('github-actions')).toBeVisible();
  },
};
