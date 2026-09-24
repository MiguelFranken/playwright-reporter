import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PAT_PREFIX, generateToken, hashToken, isPersonalToken, safeEqualHex } from './tokens';

describe('generateToken', () => {
  it('returns a prefixed token and the prefix the UI shows', () => {
    const { token, prefix } = generateToken();
    expect(token.startsWith('pwr_')).toBe(true);
    expect(prefix).toBe(token.slice(0, 10));
    expect(prefix.startsWith('pwr_')).toBe(true);
  });

  it('carries 32 bytes of entropy in a url-safe alphabet', () => {
    const { token } = generateToken();
    const body = token.slice('pwr_'.length);
    // base64url of 32 bytes is 43 characters with no padding.
    expect(body).toHaveLength(43);
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('mints personal access tokens with their own prefix', () => {
    const { token, prefix } = generateToken(PAT_PREFIX);
    expect(token.startsWith('pwr_pat_')).toBe(true);
    expect(token.slice(PAT_PREFIX.length)).toHaveLength(43);
    expect(prefix).toBe(token.slice(0, 14));
    expect(isPersonalToken(token)).toBe(true);
    expect(isPersonalToken(generateToken().token)).toBe(false);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken().token));
    expect(tokens.size).toBe(200);
  });
});

describe('hashToken', () => {
  it('is the sha256 the api_tokens row stores', () => {
    expect(hashToken('pwr_abc')).toBe(createHash('sha256').update('pwr_abc').digest('hex'));
    expect(hashToken('pwr_abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across calls and different for different tokens', () => {
    expect(hashToken('one')).toBe(hashToken('one'));
    expect(hashToken('one')).not.toBe(hashToken('two'));
  });
});

describe('safeEqualHex', () => {
  const hash = hashToken('pwr_abc');

  it('is true for identical hex strings', () => {
    expect(safeEqualHex(hash, hash)).toBe(true);
  });

  it('is false for different values of the same length', () => {
    expect(safeEqualHex(hash, hashToken('pwr_def'))).toBe(false);
  });

  it('is false rather than throwing when the lengths differ', () => {
    // timingSafeEqual throws on mismatched lengths, so the guard has to come first.
    expect(safeEqualHex(hash, 'ab')).toBe(false);
    expect(safeEqualHex('', hash)).toBe(false);
    expect(safeEqualHex('', '')).toBe(true);
  });

  it('ignores anything past the hex that can be decoded', () => {
    // Buffer.from(hex) stops at the first invalid pair, so lengths diverge.
    expect(safeEqualHex(hash, `${hash}zz`)).toBe(true);
    expect(safeEqualHex('zz', 'yy')).toBe(true);
  });
});
