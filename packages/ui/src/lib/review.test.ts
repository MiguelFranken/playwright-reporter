import { describe, expect, it } from 'vitest';
import {
  buildReviewTree,
  captureViewport,
  changeScore,
  describeDiff,
  diffMagnitude,
  fitZoom,
  flattenFolders,
  folderPathOf,
  formatChangedShare,
  inFolder,
  sizeChange,
  type ReviewDiffView,
  type ReviewFlowView,
} from './review';

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

describe('diffs', () => {
  const diff = (over: Partial<ReviewDiffView> = {}): ReviewDiffView => ({
    id: 'd',
    state: 'done',
    against: 'baseline',
    changedPixels: 40,
    totalPixels: 10_000,
    ratio: 0.004,
    sizeChanged: false,
    base: { width: 100, height: 100 },
    head: { width: 100, height: 100 },
    regions: [{ x: 0, y: 0, width: 10, height: 4, pixels: 40 }],
    ...over,
  });

  it('formats a changed share for a glance', () => {
    expect(formatChangedShare(0)).toBe('0%');
    expect(formatChangedShare(0.00005)).toBe('< 0.01%');
    expect(formatChangedShare(0.0042)).toBe('0.42%');
    expect(formatChangedShare(0.004)).toBe('0.4%');
    expect(formatChangedShare(0.05)).toBe('5%');
    expect(formatChangedShare(0.183)).toBe('18%');
  });

  it('describes a diff in a few words', () => {
    expect(describeDiff(diff())).toBe('1 region · 0.4%');
    expect(describeDiff(diff({ changedPixels: 0, ratio: 0, regions: [] }))).toBe('No visible change');
    expect(describeDiff(diff({ state: 'pending' }))).toMatch(/Measuring/);
    expect(describeDiff(diff({ sizeChanged: true, head: { width: 100, height: 140 } }))).toBe('1 region · 0.4% · height +40 px');
  });

  it('names the size change', () => {
    expect(sizeChange(diff())).toBeNull();
    expect(sizeChange(diff({ sizeChanged: true, head: { width: 92, height: 100 } }))).toBe('width −8 px');
  });

  it('grades the magnitude and ranks changes', () => {
    expect(diffMagnitude(diff())).toBe('minor');
    expect(diffMagnitude(diff({ ratio: 0.02 }))).toBe('major');
    expect(diffMagnitude(diff({ changedPixels: 0, ratio: 0 }))).toBe('none');
    expect(diffMagnitude(diff({ state: 'too_large' }))).toBeNull();
    const grew = changeScore({ status: 'changed', diff: diff({ sizeChanged: true }) });
    expect(grew).toBeGreaterThan(changeScore({ status: 'changed', diff: diff({ ratio: 0.5 }) }));
    expect(changeScore({ status: 'changed', diff: null })).toBeGreaterThan(changeScore({ status: 'approved', diff: null }));
  });
});
