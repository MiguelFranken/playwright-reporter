import { describe, expect, it } from 'vitest';
import { caseListKey, listQuery } from './list-params';

describe('case list params', () => {
  it('keys the same list the same way whatever order its URL was written in', () => {
    const a = caseListKey(new URLSearchParams('priority=high&suite=s1&priority=critical'));
    const b = caseListKey({ suite: 's1', priority: ['critical', 'high'] });
    expect(a).toBe(b);
  });

  it('leaves params that do not change the rows out of the key', () => {
    expect(caseListKey({ adopt: '1', q: 'cart' })).toBe(caseListKey({ q: 'cart' }));
    expect(caseListKey({ page: '1' })).toBe(caseListKey({}));
    expect(caseListKey({ page: '2' })).not.toBe(caseListKey({}));
  });

  it('keys a server record and the browser query string alike', () => {
    expect(caseListKey({ q: 'a b&c', tag: ['x'] })).toBe(caseListKey(new URLSearchParams('tag=x&q=a+b%26c')));
  });

  it('carries only the list params onto a case link, in the URL order', () => {
    expect(listQuery(new URLSearchParams('adopt=1&status=active&status=draft&page=3'))).toBe('?status=active&status=draft');
    expect(listQuery({})).toBe('');
  });
});
