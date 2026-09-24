import type { BranchSummaryRow } from '../views/dashboard/branch-summary-table';
import type { TestHealthRow } from '../views/dashboard/test-health-lists';
import type { TrendDatum } from '../views/dashboard/pass-fail-chart';
import { NOW, ago } from './now';

export const branchSummary: BranchSummaryRow[] = [
  { branch: 'main', environment: 'production', runs: 184, lastRunAt: ago(38), lastRunNumber: 482, lastStatus: 'passed', passRate: 0.984 },
  { branch: 'develop', environment: 'staging', runs: 96, lastRunAt: ago(212), lastRunNumber: 476, lastStatus: 'flaky', passRate: 0.812 },
  {
    branch: 'feature/checkout-guest-cart',
    environment: 'staging',
    runs: 41,
    lastRunAt: ago(184),
    lastRunNumber: 481,
    lastStatus: 'failed',
    passRate: 0.542,
  },
  {
    branch: 'release/2026-09-18-hotfix-checkout-guest-cart-discount-restore',
    environment: null,
    runs: 3,
    lastRunAt: ago(2_900),
    lastRunNumber: 478,
    lastStatus: 'interrupted',
    passRate: null,
  },
];

function health(over: Partial<TestHealthRow> & Pick<TestHealthRow, 'testId' | 'title'>): TestHealthRow {
  return {
    file: 'tests/checkout.spec.ts',
    pwProject: 'chromium',
    runs: 48,
    failed: 3,
    flaky: 9,
    flakyRate: 0.1875,
    failureRate: 0.0625,
    streak: 0,
    lastOutcome: 'flaky',
    lastRunNumber: 482,
    avgDurationMs: 4_210,
    ...over,
  };
}

export const flakyTests: TestHealthRow[] = [
  health({ testId: 't1', title: 'keeps a guest cart across sign-in', flakyRate: 0.42, flaky: 20 }),
  health({ testId: 't2', title: 'restores the applied discount code', flakyRate: 0.19, flaky: 9 }),
  health({ testId: 't3', title: 'shows the cart badge after adding an item', flakyRate: 0.08, flaky: 4 }),
  health({
    testId: 't4',
    title:
      'restores the applied percentage discount code when a guest signs in mid-checkout on a multi-currency cart',
    file: 'tests/integration/checkout/guest/keeps-cart-across-sign-in-with-discount.spec.ts',
    flakyRate: 0.06,
    flaky: 3,
    pwProject: 'webkit',
  }),
];

export const chronicFailures: TestHealthRow[] = [
  health({ testId: 't5', title: 'places an order with a saved card', lastOutcome: 'failed', streak: 14, failureRate: 0.94, failed: 45 }),
  health({ testId: 't6', title: 'exports the audit log as CSV', file: 'tests/admin/audit.spec.ts', lastOutcome: 'failed', streak: 8, failureRate: 0.78, failed: 37 }),
];

/** Thirty runs, with a visible regression in the middle and a recovery after it. */
export const trend: TrendDatum[] = Array.from({ length: 30 }, (_, i) => {
  const runNumber = 453 + i;
  const regressing = i >= 14 && i <= 20;
  const failed = regressing ? 8 + ((i * 7) % 14) : (i * 3) % 4;
  const flaky = regressing ? 6 + (i % 5) : i % 3;
  return {
    runNumber,
    startedAt: new Date(NOW.getTime() - (30 - i) * 6 * 60 * 60 * 1000).toISOString(),
    status: failed > 0 ? 'failed' : 'passed',
    passed: 240 - failed - flaky - 4,
    failed,
    flaky,
    skipped: 4,
  };
});

/**
 * A small, ragged window: ten runs of a suite that is still being stabilised —
 * one nearly-total failure, one half-sized run, one that barely started. This is
 * the shape a young project actually produces, and the one a chart designed only
 * against the healthy fixture above falls apart on.
 */
export const volatileTrend: TrendDatum[] = [
  { passed: 1, failed: 18, flaky: 0, skipped: 3 },
  { passed: 9, failed: 8, flaky: 2, skipped: 3 },
  { passed: 5, failed: 4, flaky: 1, skipped: 1 },
  { passed: 10, failed: 7, flaky: 2, skipped: 3 },
  { passed: 11, failed: 6, flaky: 2, skipped: 3 },
  { passed: 10, failed: 6, flaky: 3, skipped: 3 },
  { passed: 11, failed: 6, flaky: 2, skipped: 3 },
  { passed: 11, failed: 6, flaky: 2, skipped: 3 },
  { passed: 10, failed: 6, flaky: 3, skipped: 3 },
  { passed: 4, failed: 0, flaky: 0, skipped: 0 },
].map((counts, i) => ({
  runNumber: i + 1,
  startedAt: new Date(NOW.getTime() - (10 - i) * 4 * 60 * 60 * 1000).toISOString(),
  status: counts.failed > 0 ? 'failed' : 'passed',
  ...counts,
}));

export const flatTrend: TrendDatum[] = trend.map((t) => ({ ...t, status: 'passed', passed: 236, failed: 0, flaky: 0, skipped: 4 }));

/**
 * Twelve readings of one measure, oldest first — what a stat tile's trend line
 * is drawn from. Deliberately not derived from `trend`: a sparkline's series is
 * whatever the tile above it reports, which is rarely the chart's own.
 */
export const passRateSeries = [96.1, 95.4, 97.2, 96.8, 94.9, 97.6, 98.1, 97.4, 98.9, 98.2, 98.6, 98.4];
