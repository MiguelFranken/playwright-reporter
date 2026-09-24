import { describe, expect, it } from 'vitest';
import { errorCategory, tallyCategories } from './error-category';

const ESC = '';

describe('errorCategory', () => {
  it('reads an expectation that disagreed as an assertion', () => {
    expect(errorCategory('Error: expect(received).toBe(expected)').key).toBe('assertion');
    expect(errorCategory('AssertionError: values differ').key).toBe('assertion');
  });

  it('prefers the timeout over the locator when a locator call timed out', () => {
    // `locator.click: Timeout 1500ms exceeded` is a timeout that happens to
    // name a locator, not a missing element — the narrower cause has to win.
    expect(errorCategory('locator.click: Timeout 1500ms exceeded.').key).toBe('timeout');
  });

  it('reads a genuine locator failure as one', () => {
    expect(
      errorCategory("locator.click: strict mode violation: getByRole('button') resolved to 3 elements").key,
    ).toBe('locator');
  });

  it('recognises every browser spelling of a refused connection', () => {
    expect(errorCategory('Error: page.goto: net::ERR_CONNECTION_REFUSED').key).toBe('network');
    expect(errorCategory('Error: page.goto: NS_ERROR_CONNECTION_REFUSED').key).toBe('network');
    expect(errorCategory('connect ECONNREFUSED 127.0.0.1:3000').key).toBe('network');
  });

  it('separates a screenshot mismatch from the assertion that reported it', () => {
    expect(errorCategory('Error: expect(locator).toHaveScreenshot(expected) failed').key).toBe('snapshot');
  });

  it('falls back to "other" for an unrecognised or missing message', () => {
    expect(errorCategory('something nobody anticipated').key).toBe('other');
    expect(errorCategory(null).key).toBe('other');
    expect(errorCategory('   ').key).toBe('other');
  });

  it('looks past ANSI colour codes', () => {
    const message = `${ESC}[31mError: ${ESC}[39mexpect(locator).toBeVisible() failed`;
    expect(errorCategory(message).key).toBe('assertion');
  });
});

describe('tallyCategories', () => {
  it('counts by category, in the canonical order, omitting the empty ones', () => {
    const tally = tallyCategories(['expect(a).toBe(b)', 'Timeout 5000ms exceeded', 'expect(c).toEqual(d)', null]);
    expect(tally.map((t) => [t.category.key, t.count])).toEqual([
      ['assertion', 2],
      ['timeout', 1],
      ['other', 1],
    ]);
  });

  it('is empty for no messages at all', () => {
    expect(tallyCategories([])).toEqual([]);
  });
});
