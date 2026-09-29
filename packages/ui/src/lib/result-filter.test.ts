import { describe, expect, it } from 'vitest';
import { matchesResultFacets, parseResultFacets, resultFacetParams } from './result-filter';

const row = (over: Partial<Parameters<typeof matchesResultFacets>[0]> = {}) => ({
  attachmentKinds: [] as string[],
  pwProject: 'chromium',
  tags: [] as string[],
  attemptCount: 1,
  ...over,
});

describe('matchesResultFacets', () => {
  it('filters by attachments, with and without', () => {
    expect(matchesResultFacets(row({ attachmentKinds: ['screenshot'] }), { artifact: ['screenshot'] })).toBe(true);
    expect(matchesResultFacets(row({ attachmentKinds: ['image'] }), { artifact: ['screenshot'] })).toBe(true);
    expect(matchesResultFacets(row(), { artifact: ['screenshot'] })).toBe(false);
    expect(matchesResultFacets(row(), { artifact: ['no-screenshot'] })).toBe(true);
    expect(matchesResultFacets(row({ attachmentKinds: ['screenshot', 'video'] }), { artifact: ['screenshot', 'no-video'] })).toBe(false);
  });

  it('matches any of the chosen projects and tags', () => {
    expect(matchesResultFacets(row(), { pwProject: ['firefox', 'chromium'] })).toBe(true);
    expect(matchesResultFacets(row(), { pwProject: ['firefox'] })).toBe(false);
    expect(matchesResultFacets(row({ tags: ['@smoke'] }), { tag: ['@smoke', '@slow'] })).toBe(true);
    expect(matchesResultFacets(row(), { tag: ['@smoke'] })).toBe(false);
  });

  it('keeps only retried tests', () => {
    expect(matchesResultFacets(row({ attemptCount: 2 }), { retried: true })).toBe(true);
    expect(matchesResultFacets(row(), { retried: true })).toBe(false);
  });
});

describe('parseResultFacets', () => {
  it('round-trips through search params and drops unknown values', () => {
    const search = new URLSearchParams('artifact=no-trace&artifact=bogus&pwProject=webkit&retried=1');
    const facets = parseResultFacets((k) => search.getAll(k));
    expect(facets).toEqual({ artifact: ['no-trace'], pwProject: ['webkit'], retried: true });
    expect(resultFacetParams(facets)).toEqual({ artifact: ['no-trace'], pwProject: ['webkit'], tag: undefined, retried: '1' });
  });
});
