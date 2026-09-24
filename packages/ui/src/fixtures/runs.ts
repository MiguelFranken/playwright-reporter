import type { RunCounts } from '../patterns/counts-bar';
import type { ActiveRun } from '../views/runs/active-runs';
import type { RunListItem } from '../views/runs/runs-table';
import type { RunHeaderData, RunHeaderShard } from '../views/run/run-header';
import { ago } from './now';

export function counts(over: Partial<RunCounts> = {}): RunCounts {
  const base = { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, interrupted: 0, running: 0 };
  const merged = { ...base, ...over };
  return { ...merged, total: over.total ?? merged.passed + merged.failed + merged.flaky + merged.skipped + merged.interrupted + merged.running };
}

const COMMIT_BASE = 'https://github.com/acme/web/commit';

export const passedRun: RunListItem = {
  id: 'run-482',
  number: 482,
  status: 'passed',
  executor: 'ci',
  startedAt: ago(38),
  durationMs: 252_000,
  expectedTests: 240,
  counts: counts({ passed: 236, skipped: 4 }),
  gitBranch: 'main',
  gitMessage: 'Keep the guest cart across sign-in',
  gitShortSha: '9f2c8a4',
  gitCommitUrl: `${COMMIT_BASE}/9f2c8a41`,
  gitAuthorName: 'Ada Lovelace',
  prNumber: 1841,
  prUrl: 'https://github.com/acme/web/pull/1841',
  environment: 'staging',
  tags: ['smoke'],
};

export const failedRun: RunListItem = {
  id: 'run-481',
  number: 481,
  status: 'failed',
  executor: 'ci',
  startedAt: ago(184),
  durationMs: 744_000,
  expectedTests: 240,
  counts: counts({ passed: 213, flaky: 9, failed: 14, skipped: 4 }),
  gitBranch: 'feature/checkout-guest-cart',
  gitMessage: 'Restore the applied discount code when a guest signs in mid-checkout',
  gitShortSha: '3b71de0',
  gitCommitUrl: `${COMMIT_BASE}/3b71de0c`,
  gitAuthorName: 'Grace Hopper',
  prNumber: 1838,
  prUrl: 'https://github.com/acme/web/pull/1838',
  environment: 'staging',
  tags: ['checkout', 'regression'],
};

export const localRun: RunListItem = {
  id: 'run-480',
  number: 480,
  status: 'passed',
  executor: 'local',
  startedAt: ago(420),
  durationMs: 61_000,
  expectedTests: 12,
  counts: counts({ passed: 12 }),
  gitBranch: 'feature/checkout-guest-cart',
  gitMessage: null,
  gitShortSha: null,
  gitCommitUrl: null,
  gitAuthorName: null,
  prNumber: null,
  prUrl: null,
  environment: null,
  tags: [],
};

export const interruptedRun: RunListItem = {
  id: 'run-479',
  number: 479,
  status: 'interrupted',
  executor: 'ci',
  startedAt: ago(1_450),
  durationMs: 96_000,
  expectedTests: 240,
  counts: counts({ passed: 41, failed: 2, interrupted: 197 }),
  gitBranch: 'main',
  gitMessage: 'Bump playwright to 1.63',
  gitShortSha: 'c40aa19',
  gitCommitUrl: `${COMMIT_BASE}/c40aa192`,
  gitAuthorName: 'Ada Lovelace',
  prNumber: null,
  prUrl: null,
  environment: 'staging',
  tags: [],
};

/** A very long branch, message and tag set — the truncation case. */
export const verboseRun: RunListItem = {
  id: 'run-478',
  number: 478,
  status: 'flaky',
  executor: 'ci',
  startedAt: ago(2_900),
  durationMs: 3_912_000,
  expectedTests: 1_204,
  counts: counts({ passed: 1_142, flaky: 48, failed: 6, skipped: 8 }),
  gitBranch: 'release/2026-09-18-hotfix-checkout-guest-cart-discount-restore',
  gitMessage:
    'Revert "Restore the applied discount code when a guest signs in mid-checkout" because it double-applied percentage discounts on multi-currency carts',
  gitShortSha: '0d41ffe',
  gitCommitUrl: `${COMMIT_BASE}/0d41ffe7`,
  gitAuthorName: 'Katherine Johnson',
  prNumber: 1847,
  prUrl: 'https://github.com/acme/web/pull/1847',
  environment: 'production',
  tags: ['hotfix', 'checkout', 'billing', 'multi-currency', 'regression'],
};

export const runs: RunListItem[] = [passedRun, failedRun, localRun, interruptedRun, verboseRun];

export const runningRun: ActiveRun = {
  id: 'run-483',
  number: 483,
  status: 'running',
  executor: 'ci',
  startedAt: ago(4),
  durationMs: null,
  expectedTests: 240,
  counts: counts({ passed: 96, failed: 2, running: 142 }),
  gitBranch: 'main',
  gitMessage: 'Cache the pricing table between requests',
  gitShortSha: 'ab19c73',
  gitCommitUrl: `${COMMIT_BASE}/ab19c731`,
  gitAuthorName: 'Ada Lovelace',
  prNumber: 1849,
  prUrl: 'https://github.com/acme/web/pull/1849',
  environment: 'staging',
  tags: [],
  shardTotal: 4,
  shards: [
    { shardIndex: 1, status: 'passed' },
    { shardIndex: 2, status: 'running' },
    { shardIndex: 3, status: 'running' },
  ],
};

export const unshardedRunningRun: ActiveRun = {
  ...runningRun,
  id: 'run-484',
  number: 484,
  shardTotal: 1,
  shards: [{ shardIndex: 1, status: 'running' }],
};

export const activeRuns: ActiveRun[] = [runningRun, unshardedRunningRun];

export const runHeader: RunHeaderData = {
  number: 481,
  status: 'failed',
  startedAt: ago(184),
  durationMs: 744_000,
  executor: 'ci',
  expectedTests: 240,
  shardTotal: 4,
  gitBranch: 'feature/checkout-guest-cart',
  gitMessage: 'Restore the applied discount code when a guest signs in mid-checkout',
  gitShortSha: '3b71de0',
  gitCommitUrl: `${COMMIT_BASE}/3b71de0c`,
  gitAuthorName: 'Grace Hopper',
  gitAuthorEmail: 'grace@acme.test',
  environment: 'staging',
  ciProvider: 'GitHub Actions',
  ciBuildNumber: '4821',
  ciBuildUrl: 'https://github.com/acme/web/actions/runs/4821',
  tags: ['checkout', 'regression'],
};

export const runHeaderShards: RunHeaderShard[] = [
  { shardIndex: 1, status: 'passed', expectedTests: 60, durationMs: 181_000, hostname: 'runner-01' },
  { shardIndex: 2, status: 'failed', expectedTests: 60, durationMs: 744_000, hostname: 'runner-02' },
  { shardIndex: 3, status: 'passed', expectedTests: 60, durationMs: 202_000, hostname: 'runner-03' },
];
