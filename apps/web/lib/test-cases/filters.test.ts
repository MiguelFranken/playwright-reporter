import { describe, expect, it } from 'vitest';
import { listQuery, parseCaseFilters } from './filters';

describe('parseCaseFilters', () => {
  it('keeps known values and drops the rest', () => {
    expect(
      parseCaseFilters({ suite: 'not-a-uuid', status: ['active', 'bogus'], priority: 'high', sort: 'title', dir: 'desc', attention: '1', page: '2' }),
    ).toMatchObject({ suite: undefined, status: ['active'], priority: ['high'], sort: 'title', dir: 'desc', attention: true, page: 2 });
  });

  it('defaults to the tree order', () => {
    expect(parseCaseFilters({})).toMatchObject({ sort: 'position', dir: 'asc', suite: undefined, page: 1 });
    expect(parseCaseFilters({ suite: 'unassigned' }).suite).toBe('unassigned');
  });
});

describe('listQuery', () => {
  it('carries only the list params', () => {
    expect(listQuery({ suite: 'unassigned', q: 'login', adopt: '1', page: '3' })).toBe('?suite=unassigned&q=login');
    expect(listQuery({})).toBe('');
  });
});
