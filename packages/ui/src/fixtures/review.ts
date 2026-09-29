import type { ReviewCaptureView, ReviewCheckpointView, ReviewFlowView, ReviewImage } from '../lib/review';
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

export const placeOrderFlow: ReviewFlowView = {
  resultId: 'res-order',
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
      [capture('Checkout', 'desktop', 'changed', {}, { accent: '#e5484d', tall: true }), capture('Checkout', 'mobile', 'changed', {}, { accent: '#e5484d', tall: true })],
      { description: 'Every field complete, just before the order is placed.', stepPath: ['Checkout', 'fill in the checkout form'] },
    ),
    checkpoint('order-confirmation', 'Order confirmation', 2, [capture('Thank you!', 'desktop', 'new'), capture('Thank you!', 'mobile', 'new')]),
  ],
};

export const validationFlow: ReviewFlowView = {
  resultId: 'res-validation',
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

export const reviewFlows: ReviewFlowView[] = [placeOrderFlow, validationFlow, failedFlow];

export const approvedFlows: ReviewFlowView[] = [
  {
    ...placeOrderFlow,
    checkpoints: placeOrderFlow.checkpoints.map((c) => ({ ...c, captures: c.captures.map((cap) => ({ ...cap, status: 'approved' as const })) })),
  },
];

export const reviewQueueRows: ReviewQueueRow[] = [
  { number: 483, status: 'passed', branch: 'feat/checkout-redesign', commit: '9f2c1ab', commitMessage: 'Redesign the checkout summary', prNumber: 212, startedAt: ago(12).toISOString(), counts: { changed: 4, new: 3, changes_requested: 0, approved: 38 } },
  { number: 482, status: 'failed', branch: 'fix/coupon-rounding', commit: '51de0c3', commitMessage: 'Round fixed-value coupons to cents', prNumber: 209, startedAt: ago(95).toISOString(), counts: { changed: 0, new: 2, changes_requested: 1, approved: 40 } },
  { number: 481, status: 'passed', branch: 'main', commit: 'a0b1c2d', commitMessage: 'Merge pull request #207', prNumber: null, startedAt: ago(60 * 5).toISOString(), counts: { changed: 0, new: 0, changes_requested: 0, approved: 45 } },
];

export { NOW };
