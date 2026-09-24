import type { ErrorGroup } from '../views/run/run-errors';
import type { RunResultRow } from '../views/run/run-result';
import type { SpecSummary } from '../views/run/run-specs';

const HISTORY_HEALTHY = ['passed', 'passed', 'passed', 'passed', 'passed', 'passed'];
const HISTORY_FLAKY = ['flaky', 'passed', 'failed', 'passed', 'flaky', 'passed'];
const HISTORY_BROKEN = ['failed', 'failed', 'failed', 'flaky', 'failed', 'passed'];

/**
 * Real Playwright output, escape codes and all. `stripAnsi` has to survive this,
 * and the error column has to truncate it — neither is visible with clean text.
 * The codes are written as \u001b escapes so the file stays readable.
 */
const E = '\u001b';
export const ANSI_ERROR = [
  `${E}[31mError: ${E}[39m${E}[2mexpect(${E}[22m${E}[31mlocator${E}[39m${E}[2m).toBeVisible()${E}[22m failed`,
  '',
  `Locator:  ${E}[33mgetByRole('button', { name: 'Place order' })${E}[39m`,
  'Expected: visible',
  'Received: hidden',
  'Timeout:  5000ms',
  '',
  '    at tests/checkout.spec.ts:42:18',
].join('\n');

function row(over: Partial<RunResultRow> & Pick<RunResultRow, 'id' | 'title' | 'file'>): RunResultRow {
  return {
    testId: `test-${over.id}`,
    outcome: 'passed',
    durationMs: 1_240,
    attemptCount: 1,
    errorMessage: null,
    errorSignature: null,
    annotations: [],
    tags: [],
    titlePath: ['checkout', over.title],
    pwProject: 'chromium',
    line: 12,
    history: HISTORY_HEALTHY,
    attachmentKinds: [],
    ...over,
  };
}

export const passedResults: RunResultRow[] = [
  row({ id: 'r1', title: 'shows the cart badge after adding an item', file: 'tests/checkout.spec.ts', durationMs: 842 }),
  row({ id: 'r2', title: 'applies a percentage discount code', file: 'tests/checkout.spec.ts', durationMs: 1_913 }),
  row({ id: 'r3', title: 'signs in an existing customer', file: 'tests/auth/login.spec.ts', durationMs: 2_402, pwProject: 'firefox' }),
  row({ id: 'r4', title: 'rejects a wrong password', file: 'tests/auth/login.spec.ts', durationMs: 611, pwProject: 'firefox' }),
];

export const mixedResults: RunResultRow[] = [
  row({
    id: 'r5',
    title: 'keeps a guest cart across sign-in',
    file: 'tests/checkout.spec.ts',
    outcome: 'failed',
    durationMs: 8_420,
    attemptCount: 3,
    errorMessage: ANSI_ERROR,
    errorSignature: 'sig-visible-place-order',
    history: HISTORY_BROKEN,
    attachmentKinds: ['screenshot', 'video', 'trace'],
    tags: ['checkout', 'regression', 'guest', 'cart', 'billing'],
    line: 42,
  }),
  row({
    id: 'r6',
    title: 'restores the applied discount code',
    file: 'tests/checkout.spec.ts',
    outcome: 'flaky',
    durationMs: 6_120,
    attemptCount: 2,
    errorMessage: 'TimeoutError: page.waitForResponse: Timeout 10000ms exceeded.',
    errorSignature: 'sig-timeout-pricing',
    history: HISTORY_FLAKY,
    attachmentKinds: ['screenshot', 'trace'],
    line: 88,
  }),
  row({
    id: 'r7',
    title: 'skips on webkit until #1840 lands',
    file: 'tests/checkout.spec.ts',
    outcome: 'skipped',
    durationMs: 0,
    pwProject: 'webkit',
    history: [],
  }),
  ...passedResults,
  row({
    id: 'r8',
    title:
      'restores the applied percentage discount code when a guest signs in mid-checkout on a multi-currency cart with mixed tax rates',
    file: 'tests/integration/checkout/guest/keeps-cart-across-sign-in-with-discount.spec.ts',
    outcome: 'running',
    durationMs: 0,
    history: HISTORY_FLAKY,
    line: 214,
  }),
];

export const specs: SpecSummary[] = [
  { file: 'tests/checkout.spec.ts', total: 24, passed: 20, failed: 2, flaky: 1, skipped: 1, running: 0, durationMs: 42_000 },
  { file: 'tests/auth/login.spec.ts', total: 12, passed: 12, failed: 0, flaky: 0, skipped: 0, running: 0, durationMs: 18_400 },
  { file: 'tests/admin/teams.spec.ts', total: 31, passed: 31, failed: 0, flaky: 0, skipped: 0, running: 0, durationMs: 64_100 },
  {
    file: 'tests/integration/checkout/guest/keeps-cart-across-sign-in-with-discount.spec.ts',
    total: 8,
    passed: 4,
    failed: 3,
    flaky: 1,
    skipped: 0,
    running: 0,
    durationMs: 121_500,
  },
];

export const errorGroups: ErrorGroup[] = [
  {
    signature: 'sig-visible-place-order',
    message: ANSI_ERROR,
    count: 9,
    failed: 7,
    flaky: 2,
    files: ['tests/checkout.spec.ts', 'tests/integration/checkout/guest/keeps-cart-across-sign-in-with-discount.spec.ts'],
    sampleResultId: 'r5',
  },
  {
    signature: 'sig-timeout-pricing',
    message: 'TimeoutError: page.waitForResponse: Timeout 10000ms exceeded.\n  waiting for response to /api/pricing',
    count: 4,
    failed: 1,
    flaky: 3,
    files: ['tests/checkout.spec.ts'],
    sampleResultId: 'r6',
  },
  {
    signature: 'sig-500-teams',
    message: 'Error: expected status 200, received 500',
    count: 1,
    failed: 1,
    flaky: 0,
    files: ['tests/admin/teams.spec.ts', 'tests/admin/users.spec.ts', 'tests/admin/audit.spec.ts', 'tests/admin/billing.spec.ts'],
    sampleResultId: 'r9',
  },
];
