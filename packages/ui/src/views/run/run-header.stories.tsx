import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { DebugWithAiMenu } from '../../patterns/debug-with-ai-menu';
import { LiveIndicator } from '../../patterns/live-indicator';
import { triagePrompt } from '../../lib/ai-handoff';
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

/**
 * The start time is relative to `now` and its tooltip is an absolute UTC time,
 * so the server render and the browser's hydration produce the same markup.
 */
export const Failed: Story = {
  play: async ({ canvasElement }) => {
    const started = within(canvasElement).getByTitle(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M UTC$/);
    await expect(started).toHaveTextContent(/ ago$/);
  },
};

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

/** A GitLab merge request: `!1524` opens its page in the app, the icon beside it the host. */
export const WithMergeRequest: Story = {
  args: {
    run: {
      ...runHeader,
      prNumber: 1524,
      prUrl: 'https://gitlab.example/mop/ecma/ms_frontend/-/merge_requests/1524',
      prTitle: 'Stop shared caching of route-prefilled forms and fix stale webapp E2E tests',
    },
    pullRequestHref: '#pr-1524',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /^!1524 Stop shared caching/ })).toHaveAttribute('href', '#pr-1524');
    await expect(canvas.getByRole('link', { name: 'Open !1524 on the git host' })).toHaveAttribute(
      'href',
      'https://gitlab.example/mop/ecma/ms_frontend/-/merge_requests/1524',
    );
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

/** A run with failures offers the AI hand-off at the end of the title row. */
export const WithActions: Story = {
  args: {
    actions: (
      <DebugWithAiMenu prompt={triagePrompt({ runUrl: 'https://reporter.acme.test/teams/acme/projects/web/runs/128' })} setupHref="/account/ai" />
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /debug with ai/i })).toBeVisible();
  },
};

export const Loading: Story = { render: () => <RunHeaderSkeleton /> };
