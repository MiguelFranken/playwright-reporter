/**
 * The library in the middle of a review loop: a critical flow whose change
 * request was addressed by a partial run (ready to verify), a high-priority
 * one still waiting for a change, an unlinked one nobody commented on, and
 * a screen the newest run did not capture.
 */
import type { LibraryViewDef } from '../lib/library-views';
import { BUILT_IN_VIEWS, DEFAULT_LIBRARY_VIEW } from '../lib/library-views';
import type { ReviewCaptureView, ReviewFlowView } from '../lib/review';
import type { ReviewThreadView } from '../lib/review-threads';
import { NOW } from './now';
import { legacyFlow, longTextFlow, manyFlows, placeOrderFlow, validationFlow } from './review';
import { buttonThread, totalsThread, VIEWER_ID } from './review-threads';

const withRun = (cap: ReviewCaptureView, runNumber: number, updated: boolean): ReviewCaptureView => ({
  ...cap,
  runNumber,
  previous: cap.previous ? { ...cap.previous, runNumber: runNumber - 3, same: !updated } : null,
  // The library measures nothing against a baseline.
  diff: null,
});

const checkout = placeOrderFlow.checkpoints[1];
const commentedVersion = checkout.captures.find((c) => c.variant === 'desktop')!.previous!.image;

/** The change request on the checkout, made on run 483; run 486 changed the screen since. */
export const toVerifyThread: ReviewThreadView = {
  ...buttonThread,
  id: 'thread-verify',
  placement: 'outdated',
  originRunNumber: 483,
  origin: { captureId: 'cap-commented', checkpointId: checkout.id, image: commentedVersion, anchor: { kind: 'point', x: 0.62, y: 0.33 } },
};

/** Still on the pixels it was made on: a developer's to-do. */
export const waitingThread: ReviewThreadView = { ...totalsThread, id: 'thread-waiting' };

/** Critical, ready to verify: the desktop checkout changed since the comment; mobile screens are from the full run before. */
export const toVerifyFlow: ReviewFlowView = {
  ...placeOrderFlow,
  runNumber: 486,
  cases: placeOrderFlow.cases?.map((c) => ({ ...c, priority: 'critical' as const })),
  checkpoints: placeOrderFlow.checkpoints.map((cp, i) => ({
    ...cp,
    captures: cp.captures.map((c) =>
      c.variant === 'desktop' ? withRun({ ...c, status: 'changed', threads: i === 1 ? [toVerifyThread] : [] }, 486, i === 1) : withRun({ ...c, threads: [] }, 483, false),
    ),
  })),
};

/** High priority, waiting for changes. */
export const waitingFlow: ReviewFlowView = {
  ...validationFlow,
  runNumber: 486,
  cases: validationFlow.cases?.map((c) => ({ ...c, priority: 'high' as const })),
  checkpoints: validationFlow.checkpoints.map((cp) => ({
    ...cp,
    captures: cp.captures.map((c) => withRun({ ...c, threads: c.variant === 'desktop' ? [waitingThread] : [] }, 486, false)),
  })),
};

/** A flow the newest run did not reach: its checkpoint comes from run 480. */
export const earlierRunFlow: ReviewFlowView = {
  ...longTextFlow,
  runNumber: 486,
  cases: [],
  checkpoints: longTextFlow.checkpoints.map((cp, i) => ({
    ...cp,
    origin: i === 0 ? null : { runNumber: 480, resultHref: '#result-480', videoUrl: '#video-480' },
    captures: cp.captures.map((c) => withRun({ ...c, status: 'approved', threads: [] }, i === 0 ? 486 : 480, false)),
  })),
};

/** Nobody linked it to a case, nobody commented. */
export const quietFlow: ReviewFlowView = {
  ...legacyFlow,
  runNumber: 486,
  checkpoints: legacyFlow.checkpoints.map((cp) => ({ ...cp, captures: cp.captures.map((c) => withRun({ ...c, threads: [] }, 486, false)) })),
};

export const libraryFlows: ReviewFlowView[] = [toVerifyFlow, waitingFlow, earlierRunFlow, quietFlow];

/** Three hundred flows, for a library that has grown. */
export const manyLibraryFlows: ReviewFlowView[] = manyFlows.map((f, i) => ({
  ...f,
  cases: f.cases?.map((c) => ({ ...c, priority: (['critical', 'high', 'medium', 'low', 'none'] as const)[i % 5] })),
  checkpoints: f.checkpoints.map((cp) => ({ ...cp, captures: cp.captures.map((c) => ({ ...c, threads: i % 7 === 0 ? [waitingThread] : [] })) })),
}));

export const savedViews: LibraryViewDef[] = [
  { id: 'view-checkout', name: 'Checkout fixes', config: { ...DEFAULT_LIBRARY_VIEW, filters: { states: ['waiting'], priorities: ['critical', 'high'] }, group: 'priority' } },
  { id: 'view-mobile', name: 'Mobile to review', config: { ...DEFAULT_LIBRARY_VIEW, filters: { states: ['verify', 'updated'], priorities: [] }, variant: 'mobile' } },
];

export const allViews: LibraryViewDef[] = [...BUILT_IN_VIEWS, ...savedViews];

export { NOW, VIEWER_ID };
