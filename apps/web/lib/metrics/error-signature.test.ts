import { describe, expect, it } from 'vitest';
import { errorSignature, normalizeErrorMessage } from './error-signature';

describe('error signature', () => {
  it('groups messages that differ only in volatile parts', () => {
    const a = 'Timed out 1500ms waiting for expect(locator).toHaveText()\nLocator: locator("#counter")';
    const b = 'Timed out 2000ms waiting for expect(locator).toHaveText()\nLocator: locator("#other")';
    expect(errorSignature(a)).toBe(errorSignature(b));
  });

  it('separates different errors', () => {
    expect(errorSignature('Error: element not found')).not.toBe(errorSignature('Error: timeout'));
  });

  it('strips ansi and paths', () => {
    expect(normalizeErrorMessage('[31mfailed[0m at /Users/x/tests/a.spec.ts:10:5')).toBe('failed at <path>');
  });

  it('returns null for empty', () => {
    expect(errorSignature('')).toBeNull();
  });
});
