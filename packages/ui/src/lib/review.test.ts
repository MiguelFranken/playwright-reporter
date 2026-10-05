import { describe, expect, it } from 'vitest';
import {
  buildReviewTree,
  captureViewport,
  changeScore,
  comparedByRule,
  isRunCompareRule,
  describeDiff,
  diffMagnitude,
  fitZoom,
  fillFrames,
  frameWithin,
  shownZoom,
  widthZoom,
  flattenFolders,
  folderPathOf,
  formatChangedShare,
  inFolder,
  parseCompareRule,
  resolveCompare,
  reviewStatusOf,
  statusAgainstRun,
  NEEDS_REVIEW,
  worstStatus,
  type CompareTargetView,
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

describe('shownZoom', () => {
  const desktop = { width: 1280, height: 720 };
  it('holds a zoom asked for at what fits the width, gaps included', () => {
    expect(widthZoom([desktop, desktop], 2584)).toBe(1);
    expect(widthZoom([desktop, { width: 390, height: 844 }], 859)).toBe(0.5);
    expect(shownZoom(1.5, [desktop], { width: 1600, height: 400 })).toBe(1.25);
    expect(shownZoom(0.5, [desktop], { width: 1600, height: 400 })).toBe(0.5);
  });
  it('fits the whole screen for fit', () => {
    expect(shownZoom('fit', [desktop], { width: 1600, height: 360 })).toBe(0.5);
  });
});

describe('fillFrames', () => {
  it('spans the whole space: its width at the zoom that fits, its full height', () => {
    expect(fillFrames([{ width: 1280, height: 720 }], { width: 1920, height: 900 })).toEqual({ zoom: 1.5, screens: [{ width: 1280, height: 600 }] });
  });
});

describe('frameWithin', () => {
  it('ends a screen longer than the room at its edge', () => {
    expect(frameWithin({ width: 390, height: 844 }, 500, 1.25)).toEqual({ width: 390, height: 400 });
    expect(frameWithin({ width: 390, height: 844 }, 2000, 1)).toEqual({ width: 390, height: 844 });
    expect(frameWithin({ width: 390, height: 844 }, 0, 1)).toEqual({ width: 390, height: 844 });
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

describe('compare rules', () => {
  const img = { url: '#', available: true };
  const capture = {
    id: 'now',
    baseline: { captureId: 'base', image: img, runNumber: 470, same: false, approvedAt: '' },
    previous: { captureId: 'prev', image: img, runNumber: 481, same: false },
  };
  const targets: CompareTargetView[] = [
    { captureId: 'now', runNumber: 482, image: img, same: true, openThreads: 3 },
    { captureId: 'prev', runNumber: 481, image: img, same: false, openThreads: 0 },
    { captureId: 'c', runNumber: 478, image: img, same: false, openThreads: 2 },
    { captureId: 'd', runNumber: 475, image: img, same: true, openThreads: 1 },
  ];

  it('parses what a URL may carry, and nothing else', () => {
    expect(parseCompareRule('previous')).toBe('previous');
    expect(parseCompareRule('run:38')).toBe('run:38');
    expect(parseCompareRule('run:0')).toBe('auto');
    expect(parseCompareRule('run:x')).toBe('auto');
    expect(parseCompareRule(null)).toBe('auto');
  });

  it('keeps the default reference for auto and for the rule that names it', () => {
    expect(resolveCompare(capture, 'auto', targets)).toEqual({ target: null, fellBack: false });
    expect(resolveCompare(capture, 'baseline', targets)).toEqual({ target: null, fellBack: false });
  });

  it('picks the run before, a named run, or the newest other image with open comments', () => {
    expect(resolveCompare(capture, 'previous', targets).target?.captureId).toBe('prev');
    expect(resolveCompare(capture, 'run:475', targets).target).toMatchObject({ captureId: 'd', label: 'Run #475', same: true });
    // The image's own comments do not count: it would be compared with itself.
    expect(resolveCompare(capture, 'comments', targets).target?.captureId).toBe('c');
  });

  it('falls back when the rule finds nothing, and waits for the runs before saying so', () => {
    expect(resolveCompare({ id: 'now', baseline: null, previous: null }, 'baseline', targets)).toEqual({ target: null, fellBack: true });
    expect(resolveCompare(capture, 'run:999', targets)).toEqual({ target: null, fellBack: true });
    expect(resolveCompare(capture, 'comments', undefined)).toEqual({ target: null, fellBack: false });
  });

  it('compares a whole run under the run before or a named run only', () => {
    expect(isRunCompareRule('previous')).toBe(true);
    expect(isRunCompareRule('run:38')).toBe(true);
    expect(isRunCompareRule('auto')).toBe(false);
    expect(isRunCompareRule('baseline')).toBe(false);
    expect(isRunCompareRule('comments')).toBe(false);
  });

  it('keeps what the server compared the whole run with, without saying the rule found nothing', () => {
    const run999 = { ...capture, compare: { captureId: 'old', image: img, label: 'Run #999', same: false, runNumber: 999 } };
    expect(comparedByRule(run999, 'run:999')).toBe(true);
    expect(comparedByRule(run999, 'run:998')).toBe(false);
    // Run #999 is older than the targets the viewer loaded: the server's pick still holds.
    expect(resolveCompare(run999, 'run:999', targets)).toEqual({ target: null, fellBack: false });
    const before = { ...capture, compare: { captureId: 'prev', image: img, label: 'Run #481', same: false, runNumber: 481 } };
    expect(comparedByRule(before, 'previous')).toBe(true);
    expect(resolveCompare(before, 'previous', targets)).toEqual({ target: null, fellBack: false });
    // A library comparison is no run's pick.
    expect(comparedByRule({ ...capture, compare: { captureId: 'main', image: img, label: 'main', same: false } }, 'previous')).toBe(false);
  });
});

describe('reviewStatusOf', () => {
  const base = { decision: null, approved: false, sha256: 'a' };
  it('keeps a decision about the exact pixels', () => {
    expect(reviewStatusOf({ ...base, decision: 'approved', reference: { sha256: 'b' } })).toBe('approved');
    expect(reviewStatusOf({ ...base, decision: 'changes_requested', approved: true, reference: null })).toBe('changes_requested');
  });
  it('is changed against an approved baseline', () => {
    expect(reviewStatusOf({ ...base, approved: true, reference: { sha256: 'a' } })).toBe('changed');
  });
  it('compares with the run before while nothing is approved', () => {
    expect(reviewStatusOf({ ...base, reference: { sha256: 'a' } })).toBe('unchanged');
    expect(reviewStatusOf({ ...base, reference: { sha256: 'b' } })).toBe('changed');
    expect(reviewStatusOf({ ...base, sha256: null, reference: { sha256: null } })).toBe('changed');
  });
  it('is new only without any earlier image', () => {
    expect(reviewStatusOf({ ...base, reference: null })).toBe('new');
    expect(reviewStatusOf({ ...base, reference: undefined })).toBe('new');
  });
  it('asks for no review of unchanged pixels, and ranks them below a request', () => {
    expect(NEEDS_REVIEW).not.toContain('unchanged');
    expect(worstStatus(['approved', 'unchanged'])).toBe('unchanged');
    expect(worstStatus(['unchanged', 'changes_requested'])).toBe('changes_requested');
  });
});

describe('statusAgainstRun', () => {
  it('says whether the screen changed since the chosen run, whatever was approved before', () => {
    expect(statusAgainstRun({ decision: null, sha256: 'a', reference: { sha256: 'a' } })).toBe('unchanged');
    expect(statusAgainstRun({ decision: null, sha256: 'a', reference: { sha256: 'b' } })).toBe('changed');
    expect(statusAgainstRun({ decision: null, sha256: 'a', reference: null })).toBe('new');
  });
  it('shows the same pixels as unchanged even when they were approved', () => {
    expect(statusAgainstRun({ decision: 'approved', sha256: 'a', reference: { sha256: 'a' } })).toBe('unchanged');
  });
  it('keeps an approval of changed pixels, so a decision does not bounce back', () => {
    expect(statusAgainstRun({ decision: 'approved', sha256: 'a', reference: { sha256: 'b' } })).toBe('approved');
  });
  it('always shows a change request', () => {
    expect(statusAgainstRun({ decision: 'changes_requested', sha256: 'a', reference: { sha256: 'a' } })).toBe('changes_requested');
  });
});
