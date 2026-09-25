import { describe, expect, test } from 'vitest';
import { searchKey } from './search-key';

describe('searchKey', () => {
  test('changes with the page and with any filter', () => {
    const base = searchKey({ status: 'failed' });
    expect(searchKey({ status: 'failed', page: '2' })).not.toBe(base);
    expect(searchKey({ status: 'passed' })).not.toBe(base);
    expect(searchKey({ status: 'failed', tags: ['a', 'b'] })).not.toBe(searchKey({ status: 'failed', tags: ['a'] }));
  });

  test('ignores the order params were written in, and unset params', () => {
    expect(searchKey({ page: '2', q: 'cart' })).toBe(searchKey({ q: 'cart', page: '2' }));
    expect(searchKey({ q: 'cart', env: undefined })).toBe(searchKey({ q: 'cart' }));
  });

  test('ignores omitted params, such as the test a drawer shows', () => {
    expect(searchKey({ page: '2', test: 'abc' }, ['test'])).toBe(searchKey({ page: '2' }, ['test']));
  });
});
