import type { ReviewFlowView } from '../lib/review';
import type { ReviewCommentView, ReviewThreadView } from '../lib/review-threads';
import { USER_AVATAR } from './avatars';
import { ago, NOW } from './now';
import { placeOrderFlow } from './review';

export const VIEWER_ID = 'user-ada';

const ada = { name: 'Ada Lovelace', image: USER_AVATAR };
const grace = { name: 'Grace Hopper', image: null };

let n = 0;
function comment(body: string, minutesAgo: number, extra: Partial<ReviewCommentView> = {}): ReviewCommentView {
  return { id: `comment-${++n}`, kind: 'comment', body, author: ada, authorId: VIEWER_ID, source: 'app', at: ago(minutesAgo).toISOString(), ...extra };
}

/** A pin on the order button, with a reply. */
export const buttonThread: ReviewThreadView = {
  id: 'thread-1',
  number: 1,
  status: 'open',
  anchor: { kind: 'point', x: 0.62, y: 0.33 },
  placement: 'exact',
  originRunNumber: 483,
  createdAt: ago(50).toISOString(),
  comments: [
    comment('The order button should use the primary style — it reads as secondary next to the summary.', 50),
    comment('Agreed. And 16px more space above it, like on the cart page.', 20, { author: grace, authorId: 'user-grace' }),
  ],
};

/** An area around the totals, written by an AI assistant. */
export const totalsThread: ReviewThreadView = {
  id: 'thread-2',
  number: 2,
  status: 'open',
  anchor: { kind: 'area', x: 0.05, y: 0.52, w: 0.42, h: 0.14 },
  placement: 'exact',
  originRunNumber: 483,
  createdAt: ago(35).toISOString(),
  comments: [comment('The totals block lost its border and now blends into the page background.', 35, { author: null, authorId: null, source: 'mcp' })],
};

/** Placed on an earlier run whose image has changed since. */
export const outdatedThread: ReviewThreadView = {
  id: 'thread-3',
  number: 3,
  status: 'open',
  anchor: { kind: 'point', x: 0.08, y: 0.06 },
  placement: 'outdated',
  originRunNumber: 480,
  createdAt: ago(60 * 30).toISOString(),
  comments: [comment('Logo is blurry at 2x.', 60 * 30, { author: grace, authorId: 'user-grace' })],
};

export const resolvedThread: ReviewThreadView = {
  id: 'thread-4',
  number: 4,
  status: 'resolved',
  anchor: { kind: 'point', x: 0.9, y: 0.03 },
  placement: 'exact',
  originRunNumber: 483,
  createdAt: ago(90).toISOString(),
  resolvedAt: ago(10).toISOString(),
  resolvedBy: 'Ada Lovelace',
  comments: [comment('Cart badge overlaps the icon.', 90, { author: grace, authorId: 'user-grace' }), comment('Fixed in the last run.', 10), { ...comment('', 10), kind: 'resolved' }],
};

/** About the whole image: no pin. */
export const pagewideThread: ReviewThreadView = {
  id: 'thread-5',
  number: 5,
  status: 'open',
  anchor: { kind: 'image', x: 0, y: 0 },
  placement: 'exact',
  originRunNumber: 483,
  createdAt: ago(15).toISOString(),
  comments: [comment('The whole page feels cramped on desktop; the old spacing scale read better.', 15)],
};

/** Pins far down a tall page, below the first screen. */
export const lowThread: ReviewThreadView = {
  id: 'thread-6',
  number: 6,
  status: 'open',
  anchor: { kind: 'point', x: 0.3, y: 0.92 },
  placement: 'exact',
  originRunNumber: 483,
  createdAt: ago(5).toISOString(),
  comments: [comment('Footer links are too close together to tap.', 5)],
};

export const reviewThreads: ReviewThreadView[] = [buttonThread, totalsThread, outdatedThread, resolvedThread, pagewideThread, lowThread];

export const longThread: ReviewThreadView = {
  ...buttonThread,
  id: 'thread-long',
  comments: [
    comment(`${'The spacing between the order summary and the button collapses when the voucher line is shown, '.repeat(4)}which pushes the button below the fold on 13-inch laptops.`, 50),
    ...Array.from({ length: 6 }, (_, i) => comment(`Reply ${i + 1}: ${'still happening on staging. '.repeat(i + 1)}`, 40 - i * 5, i % 2 ? { author: grace, authorId: 'user-grace' } : {})),
  ],
};

/** The order flow with threads on its changed checkout screen. */
export function flowWithThreads(threads: ReviewThreadView[] = reviewThreads): ReviewFlowView {
  return {
    ...placeOrderFlow,
    checkpoints: placeOrderFlow.checkpoints.map((cp, i) =>
      i === 1 ? { ...cp, captures: cp.captures.map((c) => (c.variant === 'desktop' ? { ...c, threads } : { ...c, threads: [{ ...buttonThread, id: 'thread-m1', anchor: { kind: 'point' as const, x: 0.5, y: 0.4 } }] })) } : cp,
    ),
  };
}

/** The checkout's desktop capture, and the approved screen the viewer compares it with. */
const checkoutDesktop = placeOrderFlow.checkpoints[1].captures.find((c) => c.variant === 'desktop')!;
const approvedCheckout = checkoutDesktop.baseline!;

/** Asked for on the approved screen; this run changed the screen since: ready to verify. */
export const fixedThread: ReviewThreadView = {
  ...buttonThread,
  id: 'thread-fixed',
  placement: 'outdated',
  originRunNumber: approvedCheckout.runNumber,
  anchor: { kind: 'point', x: 0.62, y: 0.35 },
  origin: { captureId: approvedCheckout.captureId, image: approvedCheckout.image, anchor: { kind: 'point', x: 0.62, y: 0.33 } },
};

/** An area on the approved screen, ready to verify too. */
export const movedAreaThread: ReviewThreadView = {
  ...outdatedThread,
  number: 3,
  id: 'thread-moved',
  anchor: { kind: 'area', x: 0.05, y: 0.08, w: 0.3, h: 0.1 },
  originRunNumber: approvedCheckout.runNumber,
  origin: { captureId: approvedCheckout.captureId, image: approvedCheckout.image, anchor: { kind: 'area', x: 0.05, y: 0.06, w: 0.3, h: 0.1 } },
  comments: [comment('The header wraps onto two lines; keep the logo and the search on one.', 60 * 30, { author: grace, authorId: 'user-grace' })],
};

/** Two comments to verify, one still waiting for a fix, one resolved. */
export const verifyThreads: ReviewThreadView[] = [fixedThread, totalsThread, movedAreaThread, resolvedThread];

export const verifyFlows: ReviewFlowView[] = [flowWithThreads(verifyThreads)];

export const commentedFlows: ReviewFlowView[] = [flowWithThreads()];

/** The checkpoint of `flowWithThreads` that carries the threads. */
export const commentedCheckpointId = placeOrderFlow.checkpoints[1].id;

export { NOW };

/** Changes requested on the approved screen without a comment; this run changed it since. */
export const uncommentedRequestFlows: ReviewFlowView[] = [
  {
    ...placeOrderFlow,
    checkpoints: placeOrderFlow.checkpoints.map((cp, i) =>
      i === 1
        ? {
            ...cp,
            captures: cp.captures.map((c) =>
              c.variant === 'desktop' ? { ...c, threads: [], request: { by: 'Grace Hopper', at: ago(60 * 20).toISOString(), runNumber: approvedCheckout.runNumber, captureId: approvedCheckout.captureId, onThisImage: false } } : { ...c, threads: [] },
            ),
          }
        : cp,
    ),
  },
];

/** Changes requested on these very pixels, without a comment. */
export const uncommentedRequestHereFlows: ReviewFlowView[] = [
  {
    ...placeOrderFlow,
    checkpoints: placeOrderFlow.checkpoints.map((cp, i) =>
      i === 1
        ? {
            ...cp,
            captures: cp.captures.map((c) =>
              c.variant === 'desktop'
                ? { ...c, status: 'changes_requested' as const, threads: [], request: { by: 'Grace Hopper', at: ago(30).toISOString(), runNumber: 483, captureId: c.id, onThisImage: true } }
                : { ...c, threads: [] },
            ),
          }
        : cp,
    ),
  },
];
