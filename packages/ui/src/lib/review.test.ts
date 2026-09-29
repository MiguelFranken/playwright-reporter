import { describe, expect, it } from 'vitest';
import { buildReviewTree, captureViewport, fitZoom, flattenFolders, folderPathOf, inFolder, type ReviewFlowView } from './review';

const flow = (file: string, cases: ReviewFlowView['cases'] = [], status: 'new' | 'approved' = 'new'): ReviewFlowView => ({
  resultId: file,
  title: file,
  titlePath: [file],
  file,
  outcome: 'passed',
  resultHref: '#',
  cases,
  checkpoints: [{ id: `${file}-cp`, name: 'x', sequence: 0, stepPath: [], tags: [], captures: [{ id: `${file}-c`, variant: 'desktop', status, image: { url: '#', available: true } }] }],
});

describe('captureViewport', () => {
  it('prefers the recorded viewport, then the variant name', () => {
    expect(captureViewport({ variant: 'desktop', viewport: { width: 1000, height: 500 } })).toEqual({ width: 1000, height: 500 });
    expect(captureViewport({ variant: 'mobile' })).toEqual({ width: 390, height: 844 });
    expect(captureViewport({ variant: 'Mobile Safari' })).toEqual({ width: 390, height: 844 });
    expect(captureViewport({ variant: 'chromium', isMobile: true })).toEqual({ width: 390, height: 844 });
    expect(captureViewport({ variant: 'chromium' })).toEqual({ width: 1280, height: 720 });
  });
});

describe('fitZoom', () => {
  it('fits side by side frames into the space, never above 100%', () => {
    expect(fitZoom([{ width: 1280, height: 720 }], { width: 640, height: 2000 })).toBe(0.5);
    expect(fitZoom([{ width: 390, height: 844 }], { width: 2000, height: 422 })).toBe(0.5);
    expect(fitZoom([{ width: 100, height: 100 }], { width: 2000, height: 2000 })).toBe(1);
  });
});

describe('review tree', () => {
  const cases = (suitePath: string[]) => [{ key: 'TC-1', title: 'Case', href: '#', suitePath }];
  const flows = [
    flow('tests/checkout/coupon.spec.ts', cases(['Checkout', 'Coupons'])),
    flow('tests/checkout/pay.spec.ts', cases(['Checkout']), 'approved'),
    flow('tests/account.spec.ts'),
  ];

  it('groups by the linked case’s suite, unlinked tests last', () => {
    const tree = buildReviewTree(flows, 'suite');
    expect(tree.map((f) => [f.name, f.total, f.needsReview])).toEqual([
      ['Checkout', 2, 1],
      ['Not in a test case', 1, 1],
    ]);
    expect(flattenFolders(tree).map((f) => f.id)).toEqual(['Checkout', 'Checkout / Coupons', 'Not in a test case / tests/account.spec.ts']);
    expect(inFolder(flows[0], 'suite', 'Checkout')).toBe(true);
    expect(inFolder(flows[2], 'suite', 'Checkout')).toBe(false);
  });

  it('groups by directory and file', () => {
    expect(folderPathOf(flows[0], 'file')).toEqual(['tests', 'checkout', 'coupon.spec.ts']);
    const tree = buildReviewTree(flows, 'file');
    expect(tree[0].children.map((c) => c.name)).toEqual(['checkout', 'account.spec.ts']);
  });
});
