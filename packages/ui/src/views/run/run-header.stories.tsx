import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { LiveIndicator } from '../../patterns/live-indicator';
import { counts, runHeader, runHeaderShards } from '../../fixtures/runs';
import { NOW } from '../../fixtures/now';
import { RunHeader, RunHeaderSkeleton } from './run-header';

const meta = {
  title: 'Views/Run/RunHeader',
  component: RunHeader,
  args: {
    run: runHeader,
    counts: counts({ total: 240, passed: 213, flaky: 9, failed: 14, skipped: 4 }),
    shards: runHeaderShards,
    now: NOW,
  },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof RunHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Failed: Story = {};

export const Passed: Story = {
  args: {
    run: { ...runHeader, status: 'passed', number: 482, gitBranch: 'main' },
    counts: counts({ total: 240, passed: 236, skipped: 4 }),
  },
};

/**
 * A run still in flight: no recorded duration, so the header derives elapsed
 * time from `now` — which the fixture pins, or the story would drift daily.
 */
export const Running: Story = {
  args: {
    run: { ...runHeader, status: 'running', durationMs: null },
    counts: counts({ total: 240, passed: 96, failed: 2, running: 142 }),
    liveIndicator: <LiveIndicator state="live" />,
  },
};

export const Interrupted: Story = {
  args: {
    run: { ...runHeader, status: 'interrupted' },
    counts: counts({ total: 240, passed: 41, failed: 2, interrupted: 197 }),
    liveIndicator: <LiveIndicator state="done" />,
  },
};

/** A local run with no git metadata at all — every optional row absent. */
export const WithoutGitInfo: Story = {
  args: {
    run: {
      ...runHeader,
      executor: 'local',
      shardTotal: 1,
      gitBranch: null,
      gitMessage: null,
      gitShortSha: null,
      gitCommitUrl: null,
      gitAuthorName: null,
      gitAuthorEmail: null,
      environment: null,
      ciProvider: null,
      ciBuildNumber: null,
      ciBuildUrl: null,
      tags: [],
    },
    shards: [],
  },
  play: async ({ canvasElement }) => {
    // With no commit message the title falls back to the run number.
    await expect(within(canvasElement).getByRole('heading', { name: 'Run #481' })).toBeVisible();
  },
};

/** Shards that have not checked in yet are shown as pending, not omitted. */
export const WaitingForShards: Story = {
  args: { run: { ...runHeader, status: 'running', durationMs: null }, shards: runHeaderShards.slice(0, 1) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByText(/waiting for shard/i)).toHaveLength(3);
  },
};

export const LongCommitMessage: Story = {
  args: {
    run: {
      ...runHeader,
      gitMessage:
        'Revert "Restore the applied discount code when a guest signs in mid-checkout" because it double-applied percentage discounts on multi-currency carts',
      gitBranch: 'release/2026-09-18-hotfix-checkout-guest-cart-discount-restore',
    },
  },
};

export const CommitLinksOut: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: /3b71de0/ })).toHaveAttribute(
      'href',
      'https://github.com/acme/web/commit/3b71de0c',
    );
  },
};

export const Loading: Story = { render: () => <RunHeaderSkeleton /> };
