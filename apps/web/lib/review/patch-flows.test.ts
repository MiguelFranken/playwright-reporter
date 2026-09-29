import { describe, expect, test } from 'vitest';
import type { ReviewCaptureView, ReviewFlowView } from '@miguelfranken/ui/lib/review';
import { applyDecision, patchCaptures } from './patch-flows';

const capture = (id: string): ReviewCaptureView => ({
  id,
  variant: 'desktop',
  status: 'changed',
  image: { url: `/a/${id}`, thumbnailUrl: null, available: true },
  decision: null,
  baseline: null,
  previous: null,
});

const flow = (id: string, captureIds: string[][]): ReviewFlowView => ({
  resultId: id,
  testId: id,
  title: id,
  titlePath: [id],
  file: 'a.spec.ts',
  line: 1,
  project: null,
  outcome: 'passed',
  flow: null,
  resultHref: `/r/${id}`,
  videoUrl: null,
  traceUrl: null,
  failureImage: null,
  checkpoints: captureIds.map((ids, i) => ({ id: `${id}-cp${i}`, name: `cp${i}`, sequence: i, stepPath: [], tags: [], captures: ids.map(capture) })),
});

describe('patchCaptures', () => {
  const flows = [flow('one', [['a', 'b'], ['c']]), flow('two', [['d']])];

  test('keeps every flow and checkpoint without a patched capture as the same object', () => {
    const next = patchCaptures(flows, (cap) => (cap.id === 'c' ? { ...cap, status: 'approved' } : undefined));
    expect(next).not.toBe(flows);
    expect(next[1]).toBe(flows[1]);
    expect(next[0]).not.toBe(flows[0]);
    expect(next[0].checkpoints[0]).toBe(flows[0].checkpoints[0]);
    expect(next[0].checkpoints[1].captures[0].status).toBe('approved');
  });

  test('returns the same list when nothing changes', () => {
    expect(patchCaptures(flows, () => undefined)).toBe(flows);
  });
});

describe('applyDecision', () => {
  test('marks the decided captures with the decision and who made it', () => {
    const [one] = applyDecision([flow('one', [['a', 'b']])], { captureIds: ['b'], decision: 'approved', comment: 'fine' }, 'Ada');
    const [a, b] = one.checkpoints[0].captures;
    expect(a.status).toBe('changed');
    expect(b.status).toBe('approved');
    expect(b.decision).toMatchObject({ decision: 'approved', comment: 'fine', by: 'Ada' });
  });
});
