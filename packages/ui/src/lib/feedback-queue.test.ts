import { describe, expect, test } from 'vitest';
import { defaultFeedbackScope, feedbackItemDone, feedbackItems, feedbackQueue, feedbackScopeCounts, flowsWithFeedback, parseFeedbackScope } from './feedback-queue';
import type { ReviewCaptureView, ReviewCheckpointView, ReviewFlowView } from './review';
import type { ReviewThreadView } from './review-threads';

const image = { url: '/a.png', available: true };

function thread(id: string, n: number, placement: 'exact' | 'outdated', status: 'open' | 'resolved' = 'open'): ReviewThreadView {
  return { id, number: n, status, placement, anchor: { kind: 'point', x: 0.5, y: 0.5 }, createdAt: '2026-09-01T00:00:00Z', comments: [] };
}

function cap(id: string, variant: string, extra: Partial<ReviewCaptureView> = {}): ReviewCaptureView {
  return { id, variant, status: 'approved', image, threads: [], ...extra };
}

function cp(id: string, sequence: number, captures: ReviewCaptureView[]): ReviewCheckpointView {
  return { id, name: id, sequence, stepPath: [], tags: [], captures };
}

function flow(resultId: string, checkpoints: ReviewCheckpointView[]): ReviewFlowView {
  return { resultId, title: resultId, titlePath: [resultId], file: 'a.spec.ts', outcome: 'passed', resultHref: '#', checkpoints } as ReviewFlowView;
}

const flows = [
  flow('checkout', [
    cp('cart', 0, [cap('cart-m', 'mobile', { threads: [thread('t-m', 1, 'exact')] }), cap('cart-d', 'desktop', { threads: [thread('t3', 3, 'outdated'), thread('t1', 1, 'exact'), thread('t2', 2, 'exact', 'resolved')] })]),
    cp('pay', 1, [cap('pay-d', 'desktop')]),
  ]),
  flow('search', [
    cp('results', 0, [cap('results-d', 'desktop', { status: 'changed', request: { at: '2026-09-01T00:00:00Z', captureId: 'old', onThisImage: false } })]),
    cp('empty', 1, [cap('empty-d', 'desktop', { status: 'changes_requested', threads: [thread('t9', 1, 'exact')], request: { at: '2026-09-01T00:00:00Z', captureId: 'empty-d', onThisImage: true } })]),
  ]),
];

describe('feedbackItems', () => {
  test('follows the journey: flow, checkpoint, variant, thread number', () => {
    expect(feedbackItems(flows).map((i) => i.key)).toEqual(['thread:t1', 'thread:t3', 'thread:t-m', 'request:results-d', 'thread:t9']);
  });

  test('a thread made on an earlier version is to verify; one on these pixels waits', () => {
    const byKey = Object.fromEntries(feedbackItems(flows).map((i) => [i.key, i]));
    expect(byKey['thread:t3'].stage).toBe('verify');
    expect(byKey['thread:t1'].stage).toBe('waiting');
    expect(byKey['thread:t3']).toMatchObject({ flowId: 'checkout', checkpointId: 'cart', variant: 'desktop', captureId: 'cart-d', number: 3 });
  });

  test('a change request is an item only where no comment says what it is about', () => {
    const items = feedbackItems(flows);
    expect(items.find((i) => i.key === 'request:results-d')?.stage).toBe('verify');
    expect(items.some((i) => i.key === 'request:empty-d')).toBe(false);
  });
});

describe('scopes', () => {
  test('count and filter', () => {
    expect(feedbackScopeCounts(flows)).toEqual({ verify: 2, waiting: 3, all: 5 });
    expect(feedbackQueue(flows, 'verify').map((i) => i.key)).toEqual(['thread:t3', 'request:results-d']);
    expect(feedbackQueue(flows, 'waiting')).toHaveLength(3);
  });

  test('start with what changed when anything did', () => {
    expect(defaultFeedbackScope({ verify: 1, waiting: 4, all: 5 })).toBe('verify');
    expect(defaultFeedbackScope({ verify: 0, waiting: 4, all: 4 })).toBe('all');
  });

  test('parse from a link', () => {
    expect(parseFeedbackScope('waiting')).toBe('waiting');
    expect(parseFeedbackScope('nope')).toBeNull();
    expect(parseFeedbackScope(null)).toBeNull();
  });
});

describe('flowsWithFeedback', () => {
  test('keeps only the checkpoints with an item', () => {
    const out = flowsWithFeedback(flows, feedbackQueue(flows, 'verify'));
    expect(out.map((f) => [f.resultId, f.checkpoints.map((c) => c.id)])).toEqual([
      ['checkout', ['cart']],
      ['search', ['results']],
    ]);
  });
});

describe('feedbackItemDone', () => {
  const [t1] = feedbackItems(flows);
  const request = feedbackItems(flows).find((i) => i.kind === 'request')!;

  test('open feedback is not done', () => {
    expect(feedbackItemDone(t1, flows)).toBe(false);
    expect(feedbackItemDone(request, flows)).toBe(false);
  });

  test('a resolved or deleted thread is', () => {
    const resolved = flows.map((f) => ({ ...f, checkpoints: f.checkpoints.map((c) => ({ ...c, captures: c.captures.map((x) => ({ ...x, threads: x.threads?.map((t) => ({ ...t, status: 'resolved' as const })) })) })) }));
    expect(feedbackItemDone(t1, resolved)).toBe(true);
    expect(feedbackItemDone(t1, [])).toBe(true);
  });

  test('an approved change request is', () => {
    const approved = flows.map((f) => ({ ...f, checkpoints: f.checkpoints.map((c) => ({ ...c, captures: c.captures.map((x) => (x.id === 'results-d' ? { ...x, status: 'approved' as const } : x)) })) }));
    expect(feedbackItemDone(request, approved)).toBe(true);
  });
});
