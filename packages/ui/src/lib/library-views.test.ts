import { describe, expect, test } from 'vitest';
import {
  BUILT_IN_VIEWS,
  captureStates,
  DEFAULT_LIBRARY_VIEW,
  describeViewConfig,
  flowPriority,
  flowState,
  groupLibraryFlows,
  libraryCounts,
  matchesLibraryFilters,
  matchingCheckpointIds,
  normalizeViewConfig,
  sameViewConfig,
  sortLibraryFlows,
  viewConfigFromParams,
  viewConfigToParams,
  type LibraryViewConfig,
} from './library-views';
import type { ReviewCaptureView, ReviewFlowView, ReviewStatus } from './review';
import type { ReviewThreadView } from './review-threads';
import type { CasePriority } from './test-cases';

const image = { url: '/a.png', available: true };

function thread(n: number, placement: 'exact' | 'outdated', status: 'open' | 'resolved' = 'open'): ReviewThreadView {
  return { id: `t${n}`, number: n, status, placement, anchor: { kind: 'point', x: 0.5, y: 0.5 }, createdAt: '2026-09-01T00:00:00Z', comments: [] };
}

function cap(id: string, opts: { status?: ReviewStatus; threads?: ReviewThreadView[]; updated?: boolean; run?: number } = {}): ReviewCaptureView {
  return {
    id,
    variant: 'desktop',
    status: opts.status ?? 'approved',
    image,
    threads: opts.threads ?? [],
    runNumber: opts.run ?? 1,
    previous: opts.updated === undefined ? null : { captureId: `${id}-before`, image, runNumber: 0, same: !opts.updated },
  };
}

function flow(title: string, captures: ReviewCaptureView[], opts: { priority?: CasePriority; suite?: string[]; run?: number } = {}): ReviewFlowView {
  return {
    resultId: title,
    title,
    titlePath: [title],
    file: `tests/${title}.spec.ts`,
    outcome: 'passed',
    resultHref: `/r/${title}`,
    runNumber: opts.run ?? 1,
    cases: opts.priority || opts.suite ? [{ key: `TC-${title.length}`, title, href: '#', suitePath: opts.suite ?? [], priority: opts.priority ?? 'none' }] : [],
    checkpoints: captures.map((c, i) => ({ id: `${title}-${i}`, name: `step-${i}`, sequence: i, stepPath: [], tags: [], captures: [c] })),
  };
}

describe('where a screen stands', () => {
  test('open comments on the pixels as they are wait for changes; on an earlier version they are ready to verify', () => {
    expect([...captureStates(cap('a', { threads: [thread(1, 'exact')] }))]).toEqual(['waiting']);
    expect([...captureStates(cap('a', { threads: [thread(1, 'outdated')], updated: true }))]).toEqual(['verify', 'updated']);
    expect([...captureStates(cap('a', { threads: [thread(1, 'exact'), thread(2, 'outdated')] }))]).toEqual(['waiting', 'verify']);
  });

  test('a change request waits without a comment; resolved threads are not feedback', () => {
    expect([...captureStates(cap('a', { status: 'changes_requested' }))]).toEqual(['waiting']);
    expect([...captureStates(cap('a', { threads: [thread(1, 'exact', 'resolved')] }))]).toEqual(['approved']);
  });

  test('unreviewed screens need review only while nobody commented', () => {
    expect([...captureStates(cap('a', { status: 'changed' }))]).toEqual(['needs-review']);
    expect([...captureStates(cap('a', { status: 'new', threads: [thread(1, 'exact')] }))]).toEqual(['waiting']);
  });

  test('the same pixels captured again are not an update', () => {
    expect(captureStates(cap('a', { updated: false })).has('updated')).toBe(false);
  });

  test('a flow is as urgent as its most urgent screen', () => {
    expect(flowState(flow('f', [cap('a'), cap('b', { threads: [thread(1, 'outdated')] })]))).toBe('verify');
    expect(flowState(flow('f', [cap('a', { status: 'new' }), cap('b', { status: 'changes_requested' })]))).toBe('waiting');
    expect(flowState(flow('f', [cap('a')]))).toBe('approved');
  });
});

describe('priority', () => {
  test('is the highest of the linked cases, none without one', () => {
    const f = flow('f', [cap('a')], { priority: 'low' });
    f.cases!.push({ key: 'TC-9', title: 'x', href: '#', suitePath: [], priority: 'high' });
    expect(flowPriority(f)).toBe('high');
    expect(flowPriority(flow('g', [cap('a')]))).toBe('none');
  });
});

describe('filters', () => {
  const fix = flow('fix', [cap('a'), cap('b', { threads: [thread(1, 'exact')] })], { priority: 'high' });
  const verify = flow('verify', [cap('c', { threads: [thread(1, 'outdated')], updated: true })], { priority: 'low' });
  const quiet = flow('quiet', [cap('d')]);

  test('any state within a category, every category that is set', () => {
    const pick = (states: LibraryViewConfig['filters']['states'], priorities: LibraryViewConfig['filters']['priorities'] = []) =>
      [fix, verify, quiet].filter((f) => matchesLibraryFilters(f, { states, priorities })).map((f) => f.title);
    expect(pick([])).toEqual(['fix', 'verify', 'quiet']);
    expect(pick(['waiting', 'verify'])).toEqual(['fix', 'verify']);
    expect(pick(['waiting', 'verify'], ['high', 'critical'])).toEqual(['fix']);
    expect(pick([], ['none'])).toEqual(['quiet']);
    expect(pick(['updated'])).toEqual(['verify']);
  });

  test('names the checkpoints that match, so the rest of the journey can step back', () => {
    expect(matchingCheckpointIds(fix, { states: ['waiting'], priorities: [] })).toEqual(new Set(['fix-1']));
    expect(matchingCheckpointIds(fix, { states: [], priorities: ['high'] })).toBeNull();
  });

  test('counts flows per state and priority, and the open comments', () => {
    const counts = libraryCounts([fix, verify, quiet]);
    expect(counts.states).toMatchObject({ waiting: 1, verify: 1, updated: 1, approved: 2, 'needs-review': 0 });
    expect(counts.priorities).toMatchObject({ high: 1, low: 1, none: 1 });
    expect(counts.comments).toBe(2);
  });
});

describe('grouping and order', () => {
  const a = flow('a', [cap('a1')], { priority: 'low', run: 3 });
  const b = flow('b', [cap('b1', { threads: [thread(1, 'exact'), thread(2, 'exact')] })], { priority: 'critical', run: 1 });
  const c = flow('c', [cap('c1', { threads: [thread(1, 'outdated')], run: 5 })], { priority: 'high', run: 2 });

  test('groups by state and by priority, most urgent section first', () => {
    expect(groupLibraryFlows([a, b, c], 'state').map((s) => [s.name, s.flows.map((f) => f.title)])).toEqual([
      ['Waiting for changes', ['b']],
      ['Ready to verify', ['c']],
      ['Approved', ['a']],
    ]);
    expect(groupLibraryFlows([a, b, c], 'priority').map((s) => s.name)).toEqual(['Critical', 'High', 'Low']);
    expect(groupLibraryFlows([a, b, c], 'none')).toHaveLength(1);
    expect(groupLibraryFlows([], 'none')).toEqual([]);
  });

  test('orders by priority, urgency, recency and comments; ties keep their order', () => {
    const titles = (sort: LibraryViewConfig['sort']) => sortLibraryFlows([a, b, c], sort).map((f) => f.title);
    expect(titles('journey')).toEqual(['a', 'b', 'c']);
    expect(titles('priority')).toEqual(['b', 'c', 'a']);
    expect(titles('urgency')).toEqual(['b', 'c', 'a']);
    // The newest capture of a flow counts, not only its newest result.
    expect(titles('recent')).toEqual(['c', 'a', 'b']);
    expect(titles('comments')).toEqual(['b', 'c', 'a']);
  });
});

describe('views in the URL', () => {
  const params = (record: Record<string, string | null>) => (name: string) => record[name] ?? null;

  test('reads what the URL says and takes the rest from the view it started from', () => {
    const toFix = BUILT_IN_VIEWS.find((v) => v.id === 'to-fix')!.config;
    expect(viewConfigFromParams(params({ sort: 'recent' }), toFix)).toEqual({ ...toFix, sort: 'recent' });
    // An emptied filter outlasts the view's.
    expect(viewConfigFromParams(params({ state: '-' }), toFix).filters.states).toEqual([]);
    expect(viewConfigToParams({ ...toFix, filters: { ...toFix.filters, states: [] } }, toFix).state).toBe('-');
    expect(viewConfigFromParams(params({ variant: '-' }), { ...toFix, variant: 'mobile' }).variant).toBeNull();
    // Unknown values are dropped, known ones kept in display order.
    expect(viewConfigFromParams(params({ state: 'verify,bogus,waiting', priority: 'low,high', group: 'nope' })).filters).toEqual({ states: ['waiting', 'verify'], priorities: ['high', 'low'] });
    expect(viewConfigFromParams(params({ group: 'nope' })).group).toBe('folder');
  });

  test('reads a link from before views had folders of their own', () => {
    expect(viewConfigFromParams(params({ group: 'file' }))).toEqual({ ...DEFAULT_LIBRARY_VIEW, group: 'folder', folders: 'file' });
    expect(viewConfigFromParams(params({ folders: 'file', group: 'state' }))).toEqual({ ...DEFAULT_LIBRARY_VIEW, group: 'state', folders: 'file' });
    expect(normalizeViewConfig({ group: 'file' })).toEqual({ ...DEFAULT_LIBRARY_VIEW, folders: 'file' });
  });

  test('writes only the difference, and round-trips', () => {
    const config: LibraryViewConfig = { filters: { states: ['verify'], priorities: [] }, folders: 'file', group: 'priority', sort: 'journey', variant: 'mobile' };
    const written = viewConfigToParams(config);
    expect(written).toEqual({ view: null, state: 'verify', priority: null, folders: 'file', group: 'priority', sort: null, variant: 'mobile' });
    expect(viewConfigFromParams(params(written))).toEqual(config);
    expect(Object.values(viewConfigToParams(DEFAULT_LIBRARY_VIEW)).every((v) => v === null)).toBe(true);
  });

  test('a stored view is cleaned of anything unknown', () => {
    expect(normalizeViewConfig({ filters: { states: ['waiting', 3, 'x'], priorities: 'high' }, group: 'priority', sort: 'bogus', variant: '  mobile ' })).toEqual({
      filters: { states: ['waiting'], priorities: [] },
      folders: 'suite',
      group: 'priority',
      sort: 'journey',
      variant: 'mobile',
    });
    expect(normalizeViewConfig(null)).toEqual(DEFAULT_LIBRARY_VIEW);
    expect(sameViewConfig(normalizeViewConfig({ filters: { states: ['verify', 'waiting'] } }), normalizeViewConfig({ filters: { states: ['waiting', 'verify'] } }))).toBe(true);
  });

  test('describes a view in words', () => {
    expect(describeViewConfig(BUILT_IN_VIEWS.find((v) => v.id === 'to-fix')!.config)).toBe('Waiting for changes · grouped by priority · priority');
    expect(describeViewConfig(DEFAULT_LIBRARY_VIEW)).toBe('Every flow');
  });
});
