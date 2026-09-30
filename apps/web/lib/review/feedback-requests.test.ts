import { describe, expect, it } from 'vitest';
import { feedbackRequests, producingTests } from './feedback-requests';
import type { ComparedCapture, DecisionRecord, ReviewFlowRecord } from './queries';
import type { CaptureThread } from './threads';

const decision = (over: Partial<DecisionRecord>): DecisionRecord => ({
  id: 'd1', testId: 't1', checkpointName: 'email', variant: 'desktop', sha256: 'aaa', captureId: 'c-old', decision: 'changes_requested', source: 'human', comment: null, createdAt: new Date('2026-09-30T10:00:00Z'), by: 'Ada', runNumber: 58, ...over,
});
const thread = (number: number, over: Partial<CaptureThread> = {}): CaptureThread =>
  ({ id: `th-${number}`, number, status: 'open', placement: 'exact', originCaptureId: 'c-now', originRunNumber: 59, anchor: { kind: 'point', x: 1, y: 1 }, position: { kind: 'point', x: 0.1, y: 0.1 }, comments: [], ...over }) as CaptureThread;
const capture = (over: Partial<ComparedCapture>): ComparedCapture =>
  ({ id: 'c-now', checkpointId: 'cp', testId: 't1', checkpointName: 'email', variant: 'desktop', sha256: 'bbb', status: 'changed', threads: [], request: null, runNumber: 59, ...over }) as ComparedCapture;
const flow = (captures: ComparedCapture[], over: Partial<ReviewFlowRecord> = {}): ReviewFlowRecord =>
  ({ testId: 't1', title: 'sends a refund email', titlePath: ['Refunds', 'sends a refund email'], file: 'tests/refund.spec.ts', line: 12, project: 'chromium', runNumber: 59, checkpoints: [{ name: 'email', title: 'Refund email', sequence: 0, testResultId: 'r1', captures }] , ...over }) as ReviewFlowRecord;

describe('feedbackRequests', () => {
  it('lists every open thread and a change request without a comment, each once', () => {
    const out = feedbackRequests([flow([capture({ threads: [thread(2), thread(1, { placement: 'outdated', originCaptureId: 'c-old', originRunNumber: 58 }), thread(3, { status: 'resolved' })], request: decision({}) })])]);
    expect(out.map((r) => [r.requestId, r.stage])).toEqual([
      ['thread:th-1', 'verify'],
      ['thread:th-2', 'waiting'],
      ['capture:d1', 'verify'],
    ]);
    expect(out[0].original).toEqual({ captureId: 'c-old', run: 58 });
    expect(out[1].original).toBeNull();
    expect(out[2]).toMatchObject({ kind: 'capture', original: { captureId: 'c-old', run: 58 }, test: { title: 'Refunds › sends a refund email', file: 'tests/refund.spec.ts', browser: 'chromium' }, checkpoint: { key: 'email', order: 1 } });
  });

  it('a request on the same pixels waits; one with a comment is its thread', () => {
    expect(feedbackRequests([flow([capture({ request: decision({ sha256: 'bbb', captureId: 'c-other' }) })])])[0]).toMatchObject({ stage: 'waiting', original: null });
    expect(feedbackRequests([flow([capture({ request: decision({ comment: 'Fix the typo' }) })])])).toEqual([]);
  });

  it('names each producing test once', () => {
    const out = feedbackRequests([flow([capture({ threads: [thread(1), thread(2)] })])]);
    expect(producingTests(out)).toMatchObject([{ testId: 't1', requests: 2, checkpoints: ['email'] }]);
  });
});
