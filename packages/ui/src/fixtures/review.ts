import type { CompareTargetView, DiffRegion, RunCompareTargetView, ReviewCaptureView, ReviewCheckpointView, ReviewDiffView, ReviewFlowView, ReviewImage } from '../lib/review';
import type { ReviewQueueRow } from '../views/review/review-queue';
import { ago, NOW } from './now';

/**
 * A page as an inline SVG: a header, a headline and a few blocks, so a
 * storyboard of fixtures reads like a real one. `accent` shifts between the
 * baseline and a changed capture, which the comparison modes then reveal.
 */
function page(label: string, { mobile = false, accent = '#3e63dd', tall = false } = {}): string {
  const w = mobile ? 390 : 1280;
  const h = tall ? (mobile ? 1900 : 1500) : mobile ? 844 : 720;
  const pad = mobile ? 20 : 64;
  const col = mobile ? w - pad * 2 : 520;
  const blocks = Array.from({ length: tall ? 6 : 3 }, (_, i) => {
    const y = 240 + i * (mobile ? 200 : 160);
    return `<rect x="${pad}" y="${y}" width="${col}" height="${mobile ? 170 : 130}" rx="12" fill="#ffffff" stroke="#e0e1e6"/>`;
  }).join('');
  const aside = mobile ? '' : `<rect x="${pad + col + 40}" y="240" width="${w - pad * 2 - col - 40}" height="300" rx="12" fill="#ffffff" stroke="#e0e1e6"/><rect x="${pad + col + 64}" y="470" width="200" height="44" rx="8" fill="${accent}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#f6f6f7"/><rect width="${w}" height="72" fill="#ffffff"/><rect x="${pad}" y="24" width="96" height="24" rx="4" fill="#1c2024"/><rect x="${w - pad - 80}" y="26" width="80" height="20" rx="10" fill="${accent}"/><text x="${pad}" y="160" font-family="system-ui, sans-serif" font-size="${mobile ? 28 : 40}" font-weight="700" fill="#1c2024">${label}</text>${blocks}${aside}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function image(label: string, opts: { mobile?: boolean; accent?: string; tall?: boolean } = {}): ReviewImage {
  const url = page(label, opts);
  return { url, thumbnailUrl: url, width: opts.mobile ? 780 : 2560, height: opts.tall ? (opts.mobile ? 3800 : 3000) : opts.mobile ? 1688 : 1440, available: true };
}

/**
 * A measured comparison of a fixture page: the changed regions boxed in an
 * overlay SVG of the image's size (red where it changed, clear elsewhere),
 * as the diff engine would store it.
 */
export function measuredDiff(regions: DiffRegion[], size: { width: number; height: number }, extra: Partial<ReviewDiffView> = {}): ReviewDiffView {
  const rects = regions.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="#e51400"/>`).join('');
  const overlay = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" width="${size.width}" height="${size.height}">${rects}</svg>`)}`;
  const changedPixels = regions.reduce((n, r) => n + r.pixels, 0);
  return {
    id: `diff-${regions.length}-${size.width}x${size.height}`,
    state: 'done',
    against: 'baseline',
    changedPixels,
    totalPixels: size.width * size.height,
    ratio: changedPixels / (size.width * size.height),
    sizeChanged: false,
    base: size,
    head: size,
    regions,
    overlayUrl: overlay,
    shift: null,
    ...extra,
  };
}

/** The checkout page's recoloured pill and button, in the 2× desktop image's pixels. */
export const checkoutDesktopDiff = measuredDiff(
  [
    { x: 2272, y: 52, width: 160, height: 40, pixels: 5800 },
    { x: 1296, y: 940, width: 400, height: 88, pixels: 33_000 },
  ],
  { width: 2560, height: 3000 },
);
/** On mobile only the pill in the header changed. */
export const checkoutMobileDiff = measuredDiff([{ x: 580, y: 52, width: 160, height: 40, pixels: 5800 }], { width: 780, height: 3800 });

let ids = 0;
const id = (prefix: string) => `${prefix}-${++ids}`;

function capture(label: string, variant: 'desktop' | 'mobile', status: ReviewCaptureView['status'], extra: Partial<ReviewCaptureView> = {}, opts: { accent?: string; tall?: boolean } = {}): ReviewCaptureView {
  const mobile = variant === 'mobile';
  return {
    id: id('cap'),
    variant,
    status,
    image: image(label, { mobile, ...opts }),
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    fullPage: true,
    previous:
      status === 'changed' || status === 'new'
        ? { captureId: id('prev'), image: image(label, { mobile, tall: opts.tall }), runNumber: 481, same: false }
        : { captureId: id('prev'), image: image(label, { mobile, ...opts }), runNumber: 481, same: true },
    baseline:
      status === 'changed' || status === 'approved'
        ? {
            captureId: id('base'),
            image: image(label, { mobile, tall: opts.tall }),
            runNumber: 470,
            same: status === 'approved',
            approvedAt: ago(60 * 26).toISOString(),
            approvedBy: 'Ada Lovelace',
          }
        : null,
    decision:
      status === 'approved'
        ? { decision: 'approved', by: 'Ada Lovelace', at: ago(60 * 26).toISOString(), runNumber: 470 }
        : status === 'changes_requested'
          ? { decision: 'changes_requested', by: 'Grace Hopper', at: ago(45).toISOString(), comment: 'The last message wraps under the field on mobile.', runNumber: 482 }
          : null,
    ...extra,
  };
}

function checkpoint(name: string, title: string, sequence: number, captures: ReviewCaptureView[], extra: Partial<ReviewCheckpointView> = {}): ReviewCheckpointView {
  return {
    id: id('cp'),
    name,
    title,
    sequence,
    stepPath: ['Checkout'],
    url: `https://shop.acme.test/#/${name.split('-')[0]}`,
    pageTitle: `${title} · Acme`,
    offsetMs: 1800 + sequence * 2400,
    tags: [],
    kind: 'page',
    captures,
    ...extra,
  };
}

const caseRef = (n: number, title: string, suitePath: string[]) => ({ key: `TC-${n}`, title, href: `#case-${n}`, suitePath });

export const placeOrderFlow: ReviewFlowView = {
  resultId: 'res-order',
  testId: 'test-order',
  cases: [caseRef(12, 'Place an order with two products', ['Checkout', 'Ordering'])],
  title: 'places an order',
  titlePath: ['Checkout', 'places an order'],
  file: 'tests/checkout.spec.ts',
  line: 39,
  project: 'chromium',
  outcome: 'passed',
  resultHref: '#result-order',
  videoUrl: '#video',
  traceUrl: '#trace',
  checkpoints: [
    checkpoint('cart-with-items', 'Cart with two products', 0, [capture('Your cart', 'desktop', 'approved'), capture('Your cart', 'mobile', 'approved')]),
    checkpoint(
      'checkout-ready',
      'Checkout filled in',
      1,
      [
        capture('Checkout', 'desktop', 'changed', { diff: checkoutDesktopDiff }, { accent: '#e5484d', tall: true }),
        capture(
          'Checkout',
          'mobile',
          'changed',
          {
            diff: { ...checkoutMobileDiff, raw: { state: 'done', changedPixels: 5800 + 9600, ratio: (5800 + 9600) / (780 * 3800), regions: [...checkoutMobileDiff.regions, { x: 60, y: 300, width: 400, height: 24, pixels: 9600 }], overlayUrl: checkoutMobileDiff.overlayUrl } },
            ignoreRegions: [{ x: 40, y: 280, width: 700, height: 120, pixels: 0 }],
            ignore: {
              active: 1,
              ever: true,
              applied: 1,
              suspended: 0,
              revision: 2,
              rawChangedPixels: 5800 + 9600,
              suppressedPixels: 9600,
              rules: [
                {
                  id: 'rule-order-time',
                  x: 40,
                  y: 280,
                  width: 700,
                  height: 120,
                  reason: 'The order time is live.',
                  category: 'time_dependent',
                  source: 'manual',
                  active: true,
                  createdAt: ago(60 * 24 * 3).toISOString(),
                  createdBy: 'Ada Lovelace',
                  geometry: { imageWidth: 780, imageHeight: 3800, originCaptureId: 'cap-mobile-origin', viewportWidth: 390, viewportHeight: 844, deviceScaleFactor: 2 },
                },
              ],
              suspendedRules: [],
            },
          },
          { accent: '#e5484d', tall: true },
        ),
      ],
      { description: 'Every field complete, just before the order is placed.', stepPath: ['Checkout', 'fill in the checkout form'] },
    ),
    checkpoint('order-confirmation', 'Order confirmation', 2, [
      capture('Thank you!', 'desktop', 'new', { diff: measuredDiff([], { width: 2560, height: 1440 }, { against: 'previous', changedPixels: 0, ratio: 0 }) }),
      capture('Thank you!', 'mobile', 'new', { diff: { ...measuredDiff([], { width: 780, height: 1688 }), state: 'pending', against: 'previous', overlayUrl: null } }),
    ]),
  ],
};

/**
 * A screen whose captures carry real-looking ids: the viewer builds a
 * comparison id (`vc_…`) from the baseline's and this capture's, which the
 * AI hand-off names. The booking name differs between the two runs.
 */
export const visualDiffFlow: ReviewFlowView = {
  resultId: 'res-visual',
  testId: 'test-visual',
  title: 'books a workshop',
  titlePath: ['Workshops', 'books a workshop'],
  file: 'tests/workshops.spec.ts',
  line: 12,
  project: 'chromium',
  outcome: 'passed',
  resultHref: '#result-visual',
  checkpoints: [
    checkpoint('booking-summary', 'Booking summary', 0, [
      {
        ...capture('Booking summary', 'desktop', 'changed', { diff: measuredDiff([{ x: 420, y: 560, width: 360, height: 48, pixels: 5120 }], { width: 2560, height: 1440 }) }, { accent: '#e5484d' }),
        id: '9f0e1d2c-3b4a-4596-8778-695a4b3c2d1e',
        baseline: {
          captureId: '3b1f5e8a-3c4d-4e6f-8a9b-0c1d2e3f4a5b',
          image: image('Booking summary'),
          runNumber: 480,
          same: false,
          approvedAt: ago(60 * 30).toISOString(),
          approvedBy: 'Ada Lovelace',
        },
      },
    ]),
  ],
};

export const validationFlow: ReviewFlowView = {
  resultId: 'res-validation',
  testId: 'test-validation',
  cases: [caseRef(14, 'Checkout lists every missing field', ['Checkout', 'Validation'])],
  title: 'lists everything that is missing',
  titlePath: ['Checkout', 'lists everything that is missing'],
  file: 'tests/checkout.spec.ts',
  line: 18,
  project: 'chromium',
  outcome: 'passed',
  resultHref: '#result-validation',
  videoUrl: '#video',
  checkpoints: [
    checkpoint('checkout-validation', 'Every missing field is listed', 0, [capture('4 fields missing', 'desktop', 'approved'), capture('4 fields missing', 'mobile', 'changes_requested')], {
      kind: 'dialog',
      description: 'Four messages, next to the fields they belong to.',
    }),
  ],
};

export const failedFlow: ReviewFlowView = {
  resultId: 'res-coupon',
  testId: 'test-coupon',
  cases: [caseRef(21, 'Apply a fixed-value coupon', ['Checkout', 'Coupons'])],
  title: 'applies a fixed-value coupon',
  titlePath: ['Coupons', 'applies a fixed-value coupon'],
  file: 'tests/coupon.spec.ts',
  line: 102,
  project: 'chromium',
  outcome: 'failed',
  resultHref: '#result-coupon',
  videoUrl: '#video',
  traceUrl: '#trace',
  failureImage: image('Coupon rejected', { accent: '#e5484d' }),
  checkpoints: [checkpoint('coupon-entered', 'Coupon code entered', 0, [capture('Apply a coupon', 'desktop', 'new'), capture('Apply a coupon', 'mobile', 'new')])],
};

/** Titles, names and paths far longer than anyone should write, to prove nothing overflows. */
export const longTextFlow: ReviewFlowView = {
  resultId: 'res-long',
  title: 'books a multi-day ceramics workshop for three attendees with a partially redeemed gift voucher and a waitlist fallback',
  titlePath: ['Workshops', 'Booking with vouchers and waitlists', 'books a multi-day ceramics workshop for three attendees with a partially redeemed gift voucher and a waitlist fallback'],
  file: 'tests/workshops/booking/vouchers-and-waitlists/multi-day-partial-redemption.spec.ts',
  line: 1204,
  project: 'chromium',
  outcome: 'flaky',
  resultHref: '#result-long',
  checkpoints: [
    checkpoint(
      'multi-day-workshop-booking-with-partially-redeemed-voucher-ready-for-submission',
      'The booking form for three attendees, with the voucher applied and the remaining balance shown before submission',
      0,
      [capture('Book a workshop', 'desktop', 'new')],
      { stepPath: ['Book the workshop', 'Add the attendees one after another', 'Apply the gift voucher and check the recalculated price'], url: `https://workshops.example.test/workshops/ceramics/2026-10-12/book?voucher=${'x'.repeat(80)}` },
    ),
  ],
};

/** An image still uploading and one the retention policy deleted. */
export const unavailableFlow: ReviewFlowView = {
  resultId: 'res-unavailable',
  title: 'shows the account page',
  titlePath: ['Account', 'shows the account page'],
  file: 'tests/account.spec.ts',
  line: 8,
  project: 'chromium',
  outcome: 'passed',
  resultHref: '#result-account',
  checkpoints: [
    checkpoint('account-overview', 'Account overview', 0, [
      capture('Account', 'desktop', 'new', { image: { url: '#pending', available: false, unavailableReason: 'pending' } }),
      capture('Account', 'mobile', 'new', { image: { url: '#expired', available: false, unavailableReason: 'expired' } }),
    ]),
  ],
};

/**
 * A suite from before checkpoints recorded their viewport (`review:<name>:<variant>`
 * names only): the variant name still makes the mobile screen a phone.
 */
export const legacyFlow: ReviewFlowView = {
  resultId: 'res-legacy',
  testId: 'test-legacy',
  title: 'coupon abandoned payment sends help email',
  titlePath: ['Abandoned payment follow-up', 'coupon abandoned payment sends help email'],
  file: 'src/abandoned-payment.spec.ts',
  line: 40,
  project: 'chromium',
  outcome: 'passed',
  resultHref: '#result-legacy',
  checkpoints: [
    checkpoint('abandoned-coupon-help-email', 'Abandoned coupon help email', 0, [
      capture('Payment pending', 'desktop', 'new', { viewport: null, deviceScaleFactor: null }, { tall: true }),
      capture('Payment pending', 'mobile', 'new', { viewport: null, deviceScaleFactor: null }, { tall: true }),
    ], { kind: 'email' }),
  ],
};

export const reviewFlows: ReviewFlowView[] = [placeOrderFlow, validationFlow, failedFlow, legacyFlow];

export const approvedFlows: ReviewFlowView[] = [
  {
    ...placeOrderFlow,
    checkpoints: placeOrderFlow.checkpoints.map((c) => ({ ...c, captures: c.captures.map((cap) => ({ ...cap, status: 'approved' as const })) })),
  },
];

export const reviewQueueRows: ReviewQueueRow[] = [
  { number: 483, status: 'passed', branch: 'feat/checkout-redesign', commit: '9f2c1ab', commitMessage: 'Redesign the checkout summary', prNumber: 212, prTitle: 'Checkout redesign', startedAt: ago(12).toISOString(), counts: { changed: 4, new: 3, changes_requested: 0, approved: 38 }, reviewHref: '#run-483/review', changeHref: '#pr:212', libraryHref: '#library-pr:212' },
  { number: 482, status: 'failed', branch: 'fix/coupon-rounding', commit: '51de0c3', commitMessage: 'Round fixed-value coupons to cents', prNumber: 209, prTitle: 'Round coupons to cents', startedAt: ago(95).toISOString(), counts: { changed: 0, new: 2, changes_requested: 1, approved: 40 }, reviewHref: '#run-482/review', changeHref: '#pr:209', libraryHref: '#library-pr:209' },
  { number: 480, status: 'passed', branch: 'feat/checkout-redesign', commit: '77aa010', commitMessage: 'Move the summary into a sidebar', prNumber: 212, prTitle: 'Checkout redesign', startedAt: ago(200).toISOString(), counts: { changed: 6, new: 3, changes_requested: 0, approved: 36 }, reviewHref: '#run-480/review', changeHref: '#pr:212', libraryHref: '#library-pr:212' },
  { number: 481, status: 'passed', branch: 'main', commit: 'a0b1c2d', commitMessage: 'Merge pull request #207', prNumber: null, startedAt: ago(60 * 5).toISOString(), counts: { changed: 0, new: 0, changes_requested: 0, approved: 45 }, reviewHref: '#run-481/review', changeHref: '#branch:main', libraryHref: '#library-branch:main' },
];

export { NOW };

/**
 * The states a measured comparison can be in, one checkpoint each: noise the
 * tolerance approved, a page that grew because content was inserted, one too
 * large to measure, and one still being measured.
 */
export const diffStatesFlow: ReviewFlowView = {
  resultId: 'res-diffs',
  testId: 'test-diffs',
  title: 'browses the catalogue',
  titlePath: ['Catalogue', 'browses the catalogue'],
  file: 'tests/catalogue.spec.ts',
  line: 12,
  project: 'chromium',
  outcome: 'passed',
  resultHref: '#result-diffs',
  checkpoints: [
    checkpoint('catalogue-home', 'Catalogue home', 0, [
      capture('Catalogue', 'desktop', 'approved', {
        decision: { decision: 'approved', source: 'tolerance', by: null, at: ago(3).toISOString(), runNumber: 483, comment: "Within the project's diff tolerance: no visible change against the approved image of run #470." },
        diff: measuredDiff([], { width: 2560, height: 1440 }, { withinTolerance: true }),
        baseline: { captureId: 'base-cat', image: image('Catalogue'), runNumber: 470, same: false, approvedAt: ago(60 * 26).toISOString(), approvedBy: 'Ada Lovelace' },
      }),
    ]),
    checkpoint('catalogue-promo', 'Promotion banner inserted', 1, [
      capture(
        'Summer sale',
        'desktop',
        'changed',
        {
          diff: measuredDiff([{ x: 0, y: 440, width: 2560, height: 240, pixels: 614_400 }], { width: 2560, height: 3000 }, {
            sizeChanged: true,
            base: { width: 2560, height: 2760 },
            shift: { inserted: [{ y: 440, height: 240 }], removed: [], matchedRows: 2760 },
          }),
        },
        { accent: '#30a46c', tall: true },
      ),
    ]),
    checkpoint('catalogue-grid', 'Every product', 2, [
      capture('All products', 'desktop', 'changed', { diff: { ...measuredDiff([], { width: 2560, height: 40_000 }), state: 'too_large', error: 'The images are too large to compare (2560×40000; at most 40,000,000 pixels each).', overlayUrl: null } }, { accent: '#e5484d', tall: true }),
    ]),
    checkpoint('catalogue-filters', 'Filters open', 3, [capture('Filters', 'desktop', 'changed', { diff: { ...measuredDiff([], { width: 2560, height: 1440 }), state: 'pending', overlayUrl: null } }, { accent: '#e5484d' })]),
  ],
};

/** The library comparing the shown pull request with `main`: the checkout screens differ, the cart is the same. */
export const libraryCompareFlows: ReviewFlowView[] = [
  {
    ...placeOrderFlow,
    checkpoints: placeOrderFlow.checkpoints.map((cp) => ({
      ...cp,
      captures: cp.captures.map((c) => {
        const changed = cp.name === 'checkout-ready';
        return {
          ...c,
          compare: { captureId: `main-${c.id}`, image: c.baseline?.image ?? c.image, label: 'main', same: !changed },
          diff: changed && c.diff ? { ...c.diff, against: 'compare' as const } : null,
        };
      }),
    })),
  },
];

/**
 * The other runs that captured the changed desktop checkout (placeOrderFlow,
 * checkpoint 1), newest first, as the viewer's "Compare with" lists them: the
 * run before, two older runs whose images still carry open comments, and runs
 * with nothing open.
 */
export const checkoutCompareTargets: CompareTargetView[] = (() => {
  const cap = placeOrderFlow.checkpoints[1].captures[0];
  const run = (runNumber: number, minutes: number, extra: Partial<CompareTargetView> = {}): CompareTargetView => ({
    captureId: `cmp-${runNumber}`,
    runNumber,
    image: image('Checkout', { tall: true, accent: runNumber % 2 ? '#3e63dd' : '#8e4ec6' }),
    same: false,
    branch: 'feat/checkout-redesign',
    at: ago(minutes).toISOString(),
    openThreads: 0,
    ...extra,
  });
  return [
    { ...run(481, 60 * 5, { branch: 'main' }), captureId: cap.previous!.captureId, image: cap.previous!.image },
    run(479, 60 * 9, { openThreads: 2 }),
    run(477, 60 * 20, { openThreads: 1, branch: 'feat/checkout-sidebar-with-a-very-long-branch-name' }),
    run(476, 60 * 22, { same: true }),
    { ...run(470, 60 * 26, { branch: 'main' }), captureId: cap.baseline!.captureId, image: cap.baseline!.image },
    run(468, 60 * 30, { branch: null }),
  ];
})();

/** The runs a run's whole review can be compared with, newest first, as its "Compare with" lists them. */
export const runCompareTargets: RunCompareTargetView[] = [
  { runNumber: 481, branch: 'main', sha: '4f2a9c1', at: ago(60 * 5).toISOString(), screens: 14 },
  { runNumber: 479, branch: 'feat/checkout-redesign', sha: 'b81e0d7', at: ago(60 * 9).toISOString(), screens: 14 },
  { runNumber: 477, branch: 'feat/checkout-sidebar-with-a-very-long-branch-name', sha: '0c3d5e2', at: ago(60 * 20).toISOString(), screens: 6 },
  { runNumber: 470, branch: 'main', sha: '9a7b6c5', at: ago(60 * 26).toISOString(), screens: 1 },
  { runNumber: 468, branch: null, sha: null, at: ago(60 * 30).toISOString(), screens: 12 },
];

/** A run's review compared with run #479: the checkout changed since, the cart is the same. */
export const runCompareFlows: ReviewFlowView[] = [
  {
    ...placeOrderFlow,
    checkpoints: placeOrderFlow.checkpoints.map((cp) => ({
      ...cp,
      captures: cp.captures.map((c) => {
        const changed = cp.name === 'checkout-ready';
        return {
          ...c,
          compare: { captureId: `run-479-${c.id}`, image: c.baseline?.image ?? c.image, label: 'Run #479', same: !changed, runNumber: 479 },
          diff: changed && c.diff ? { ...c.diff, against: 'compare' as const } : null,
        };
      }),
    })),
  },
];

/**
 * A run the size of a real suite: 240 tests in twelve spec files, each a copy
 * of the sample flows with ids of its own, to show that the storyboard keeps
 * only the rows on screen in the document.
 */
export const manyFlows: ReviewFlowView[] = Array.from({ length: 240 }, (_, i) => {
  const base = reviewFlows[i % reviewFlows.length];
  const n = String(i + 1).padStart(3, '0');
  return {
    ...base,
    resultId: `many-${n}`,
    testId: `many-test-${n}`,
    cases: [],
    title: `${base.title} #${n}`,
    titlePath: [...base.titlePath.slice(0, -1), `${base.titlePath.at(-1) ?? base.title} #${n}`],
    file: `suite-${String((i % 12) + 1).padStart(2, '0')}.spec.ts`,
    checkpoints: base.checkpoints.map((c) => ({ ...c, id: `many-${n}-${c.id}`, captures: c.captures.map((cap) => ({ ...cap, id: `many-${n}-${cap.id}` })) })),
  };
});
