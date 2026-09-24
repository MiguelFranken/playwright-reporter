import type { ExplorerRow } from '../views/explorer/explorer-table';
import type { HistoryRow, TestOverviewData, UniqueError } from '../views/explorer/test-overview';
import { ANSI_ERROR } from './results';
import { ago } from './now';

function explorerRow(over: Partial<ExplorerRow> & Pick<ExplorerRow, 'testId' | 'title'>): ExplorerRow {
  return {
    titlePath: ['checkout', 'guest', over.title],
    file: 'tests/checkout.spec.ts',
    pwProject: 'chromium',
    tags: [],
    lastOutcome: 'passed',
    lastRunAt: ago(38),
    lastRunNumber: 482,
    lastBranch: 'main',
    runs: 48,
    passed: 45,
    failed: 1,
    flaky: 2,
    skipped: 0,
    flakyRate: 0.041,
    failureRate: 0.02,
    reliability: 92,
    avgDurationMs: 2_140,
    streak: 0,
    ...over,
  };
}

export const explorerRows: ExplorerRow[] = [
  explorerRow({
    testId: 't1',
    title: 'keeps a guest cart across sign-in',
    lastOutcome: 'failed',
    reliability: 38,
    flakyRate: 0.42,
    failureRate: 0.27,
    flaky: 20,
    failed: 13,
    streak: 3,
    tags: ['checkout', 'regression'],
    avgDurationMs: 8_420,
  }),
  explorerRow({ testId: 't2', title: 'restores the applied discount code', lastOutcome: 'flaky', reliability: 64, flakyRate: 0.19 }),
  explorerRow({ testId: 't3', title: 'shows the cart badge after adding an item', reliability: 98 }),
  explorerRow({
    testId: 't4',
    title: 'signs in an existing customer',
    file: 'tests/auth/login.spec.ts',
    pwProject: 'firefox',
    reliability: 100,
    flakyRate: 0,
    failureRate: 0,
    flaky: 0,
    failed: 0,
    passed: 48,
  }),
  explorerRow({
    testId: 't5',
    title: 'skips on webkit until #1840 lands',
    lastOutcome: 'skipped',
    pwProject: 'webkit',
    reliability: null,
    runs: 0,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 48,
    avgDurationMs: null,
  }),
  explorerRow({
    testId: 't6',
    title:
      'restores the applied percentage discount code when a guest signs in mid-checkout on a multi-currency cart with mixed tax rates',
    file: 'tests/integration/checkout/guest/keeps-cart-across-sign-in-with-discount.spec.ts',
    lastBranch: 'release/2026-09-18-hotfix-checkout-guest-cart-discount-restore',
    tags: ['checkout', 'billing', 'multi-currency', 'regression', 'slow'],
    reliability: 51,
    avgDurationMs: 41_200,
  }),
];

function historyRow(i: number, outcome: string): HistoryRow {
  return {
    resultId: `res-${i}`,
    runId: `run-${482 - i}`,
    runNumber: 482 - i,
    startedAt: ago(38 + i * 180),
    outcome,
    durationMs: 2_000 + ((i * 731) % 6_000),
    attemptCount: outcome === 'flaky' ? 2 : 1,
    branch: i % 3 === 0 ? 'feature/checkout-guest-cart' : 'main',
    environment: 'staging',
    executor: i % 5 === 0 ? 'local' : 'ci',
    errorMessage: outcome === 'failed' || outcome === 'flaky' ? ANSI_ERROR : null,
    gitShortSha: `9f2c8a${i}`,
  };
}

const OUTCOMES = ['failed', 'flaky', 'passed', 'passed', 'failed', 'passed', 'passed', 'flaky', 'passed', 'passed', 'passed', 'failed'];

export const history: HistoryRow[] = OUTCOMES.map((outcome, i) => historyRow(i, outcome));

export const uniqueErrors: UniqueError[] = [
  {
    signature: 'sig-visible-place-order',
    message: ANSI_ERROR,
    count: 9,
    firstSeen: ago(14_400),
    lastSeen: ago(184),
    lastRunNumber: 481,
    lastResultId: 'res-0',
  },
  {
    signature: 'sig-timeout-pricing',
    message: 'TimeoutError: page.waitForResponse: Timeout 10000ms exceeded.',
    count: 3,
    firstSeen: ago(9_000),
    lastSeen: ago(1_450),
    lastRunNumber: 479,
    lastResultId: 'res-4',
  },
];

export const testOverview: TestOverviewData = {
  history,
  errors: uniqueErrors,
  stats: {
    runs: 48,
    passed: 30,
    failed: 13,
    flaky: 5,
    skipped: 0,
    reliability: 38,
    avgDurationMs: 8_420,
    p95DurationMs: 21_800,
    failureRate: 13 / 48,
    flakyRate: 5 / 48,
    streak: 1,
    streakKind: 'fail',
    branches: 3,
    topFailingBranch: 'feat/checkout-redesign',
    durationTrend: 1.34,
    chronic: false,
  },
  environments: [
    { environment: 'production', executions: 18, failed: 7, failureRate: 7 / 18, flaky: 2, flakyRate: 2 / 18, avgDurationMs: 9_100 },
    { environment: 'staging', executions: 24, failed: 5, failureRate: 5 / 24, flaky: 3, flakyRate: 3 / 24, avgDurationMs: 7_900 },
    { environment: null, executions: 6, failed: 1, failureRate: 1 / 6, flaky: 0, flakyRate: 0, avgDurationMs: 8_300 },
  ],
  siblings: [
    { testId: 't1-firefox', pwProject: 'firefox' },
    { testId: 't1-webkit', pwProject: 'webkit' },
  ],
};

export const healthyTestOverview: TestOverviewData = {
  history: history.map((h) => ({ ...h, outcome: 'passed', errorMessage: null })),
  errors: [],
  stats: {
    runs: 48,
    passed: 48,
    failed: 0,
    flaky: 0,
    skipped: 0,
    reliability: 100,
    avgDurationMs: 1_240,
    p95DurationMs: 2_100,
    failureRate: 0,
    flakyRate: 0,
    streak: 48,
    streakKind: 'pass',
    branches: 2,
    topFailingBranch: null,
    durationTrend: 0.97,
    chronic: false,
  },
  environments: [
    { environment: 'staging', executions: 48, failed: 0, failureRate: 0, flaky: 0, flakyRate: 0, avgDurationMs: 1_240 },
  ],
  siblings: [],
};

export const emptyTestOverview: TestOverviewData = {
  history: [],
  errors: [],
  stats: {
    runs: 0,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
    reliability: null,
    avgDurationMs: null,
    p95DurationMs: null,
    failureRate: 0,
    flakyRate: 0,
    streak: 0,
    streakKind: 'none',
    branches: 0,
    topFailingBranch: null,
    durationTrend: null,
    chronic: false,
  },
  environments: [],
  siblings: [],
};
