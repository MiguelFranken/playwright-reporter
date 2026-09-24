import type { AttachmentView, AttemptView } from '../views/run/result-attempts';
import { ANSI_ERROR } from './results';
import { NOW } from './now';

/**
 * Inline SVG data URIs rather than files: the catalogue then renders the same
 * in CI, offline, and in a screenshot, with no asset pipeline to keep in sync.
 */
function screenshot(label: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="${bg}"/><rect x="24" y="24" width="592" height="56" rx="8" fill="#ffffff" opacity="0.9"/><rect x="24" y="104" width="380" height="272" rx="8" fill="#ffffff" opacity="0.75"/><rect x="424" y="104" width="192" height="130" rx="8" fill="#ffffff" opacity="0.75"/><text x="320" y="392" font-family="monospace" font-size="16" fill="#1c2024" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const failureShot: AttachmentView = {
  id: 'att-1',
  name: 'test-failed-1.png',
  contentType: 'image/png',
  kind: 'screenshot',
  status: 'uploaded',
  sizeBytes: 184_320,
  url: screenshot('checkout — place order hidden', '#e9edf5'),
};

const diffShot: AttachmentView = {
  id: 'att-2',
  name: 'cart-badge-diff.png',
  contentType: 'image/png',
  kind: 'image',
  status: 'uploaded',
  sizeBytes: 92_160,
  url: screenshot('visual diff', '#f5e9ec'),
};

const trace: AttachmentView = {
  id: 'att-3',
  name: 'trace.zip',
  contentType: 'application/zip',
  kind: 'trace',
  status: 'uploaded',
  sizeBytes: 2_411_724,
  url: '#trace-download',
  traceUrl: 'https://trace.playwright.dev/?trace=#example',
};

const video: AttachmentView = {
  id: 'att-4',
  name: 'video.webm',
  contentType: 'video/webm',
  kind: 'video',
  status: 'uploaded',
  sizeBytes: 5_242_880,
  url: '#video',
};

const logFile: AttachmentView = {
  id: 'att-5',
  name: 'console.txt',
  contentType: 'text/plain',
  kind: 'text',
  status: 'uploaded',
  sizeBytes: 412,
  url: '#log',
  text: 'GET /api/pricing 200 82ms\nGET /api/cart 200 41ms\nPOST /api/orders 500 1204ms',
};

const pendingUpload: AttachmentView = {
  id: 'att-6',
  name: 'trace-retry.zip',
  contentType: 'application/zip',
  kind: 'trace',
  status: 'pending',
  sizeBytes: null,
  url: '#pending',
};

/** An old run's artifacts once the retention policy has deleted their bytes. */
const expiredAt = new Date(NOW.getTime() - 3 * 86_400_000).toISOString();
const expired = (a: AttachmentView): AttachmentView => ({ ...a, id: `${a.id}-expired`, status: 'expired', text: undefined, expiredAt });

const STEPS = [
  { title: 'Before Hooks', category: 'hook', durationMs: 412, depth: 0 },
  { title: 'page.goto(/checkout)', category: 'pw:api', durationMs: 1_204, depth: 0 },
  { title: 'expect(locator).toBeVisible()', category: 'expect', durationMs: 5_002, depth: 0, error: 'Timed out 5000ms' },
  { title: 'locator.click()', category: 'pw:api', durationMs: 88, depth: 1 },
  { title: 'After Hooks', category: 'hook', durationMs: 96, depth: 0 },
];

const ERRORS = [
  {
    message: ANSI_ERROR,
    stack: 'Error: expect(locator).toBeVisible() failed\n    at tests/checkout.spec.ts:42:18\n    at Page.click (index.js:118:9)',
    snippet: "  40 |   await page.goto('/checkout');\n  41 |   const place = page.getByRole('button', { name: 'Place order' });\n> 42 |   await expect(place).toBeVisible();\n     |                      ^",
    location: { file: 'tests/checkout.spec.ts', line: 42, column: 18 },
  },
];

export const failedAttempt: AttemptView = {
  id: 'attempt-1',
  retry: 0,
  status: 'failed',
  durationMs: 8_420,
  workerIndex: 3,
  startedAt: NOW.toISOString(),
  errors: ERRORS,
  steps: STEPS,
  stdout: 'Seeding cart with 2 items\nApplying discount code SAVE20',
  stderr: 'warn: pricing service responded in 1204ms',
  attachments: [failureShot, diffShot, video, trace, logFile],
};

export const retryAttempt: AttemptView = {
  ...failedAttempt,
  id: 'attempt-2',
  retry: 1,
  status: 'failed',
  durationMs: 7_980,
  attachments: [failureShot, pendingUpload],
};

/** Kept for its errors and steps; its screenshots, video and trace are gone. */
export const expiredAttempt: AttemptView = {
  ...failedAttempt,
  id: 'attempt-expired',
  attachments: [failureShot, diffShot, video, trace, logFile].map(expired),
};

export const passedAttempt: AttemptView = {
  id: 'attempt-3',
  retry: 2,
  status: 'passed',
  durationMs: 2_140,
  workerIndex: 3,
  startedAt: NOW.toISOString(),
  errors: [],
  steps: STEPS.slice(0, 2).concat([{ title: 'expect(locator).toBeVisible()', category: 'expect', durationMs: 120, depth: 0 }]),
  stdout: '',
  stderr: '',
  attachments: [],
};

/** A flaky test: two failures then a pass, which is the shape the tabs exist for. */
export const attempts: AttemptView[] = [failedAttempt, retryAttempt, passedAttempt];

export const cleanAttempt: AttemptView = { ...passedAttempt, id: 'attempt-solo', retry: 0 };
